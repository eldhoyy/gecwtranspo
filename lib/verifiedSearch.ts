import type { Journey, ScheduledStop, TransportSearchResult, TransportTrip } from "@/lib/types";
import { getStopNameVariants, resolveStopName } from "./stops";
import { getKsrtcTrips } from "./sources/ksrtc";

const DATASET_URL = "https://raw.githubusercontent.com/amith-vp/Kerala-Private-Bus-Timing/main/wayanad.json";
const SCHEDULE_API_URL = "https://busapi.amithv.xyz/api/v1/schedules";

type Station = { station?: string; arrivalTime?: string | null; departureTime?: string | null };
type Bus = { "Vehicle Number"?: string; vehicle_number?: string; route?: string[]; schedule?: { trip?: string | number; stations?: Station[] }[] };
type Dataset = { busSchedules?: Bus[] };
type ApiTrip = { vehicle_number?: string; "Vehicle Number"?: string; trip?: string | number; stations?: Station[] };

function norm(v: string): string { return v.trim().toLowerCase().replace(/[.,/()\-–—]+/g, " ").replace(/\s+/g, " "); }
function slug(v: string): string { return norm(v).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

function equivalentStopNames(a: string, b: string): boolean {
  const left = new Set(getStopNameVariants(a).map(norm));
  const right = new Set(getStopNameVariants(b).map(norm));
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function stopMatches(actual: string, requested: string): boolean {
  const a = norm(actual);
  return getStopNameVariants(requested).some((v) => {
    const r = norm(v);
    return a === r || a.includes(r) || r.includes(a);
  }) || equivalentStopNames(actual, requested);
}

function findTiming(stations: Station[], routeName: string): Station | undefined {
  const exact = stations.find((s) => s.station?.trim() && norm(s.station) === norm(routeName));
  if (exact) return exact;
  return stations.find((s) => s.station?.trim() && equivalentStopNames(s.station.trim(), routeName));
}

function makeStop(name: string, sequence: number, timing?: Station): ScheduledStop {
  return { stop: { id: `private-${slug(name)}`, name }, sequence, arrivalTime: timing?.arrivalTime ?? null, departureTime: timing?.departureTime ?? null };
}

function routeMatches(stops: ScheduledStop[], from: string, to: string): boolean {
  let fi = -1;
  let ti = -1;
  for (let i = 0; i < stops.length; i++) {
    if (fi < 0 && stopMatches(stops[i].stop.name, from)) fi = i;
    if (ti < 0 && stopMatches(stops[i].stop.name, to)) ti = i;
  }
  return fi >= 0 && ti >= 0 && fi < ti;
}

function journeyHasTimes(t: TransportTrip, from: string, to: string): boolean {
  const fi = t.stops.findIndex((s) => stopMatches(s.stop.name, from));
  const ti = t.stops.findIndex((s) => stopMatches(s.stop.name, to));
  if (fi < 0 || ti < 0 || fi >= ti) return false;
  const fromStop = t.stops[fi];
  const toStop = t.stops[ti];
  return Boolean((fromStop.departureTime ?? fromStop.arrivalTime) && (toStop.arrivalTime ?? toStop.departureTime));
}

function apiTripToTransport(item: ApiTrip, index: number): TransportTrip | null {
  const raw = Array.isArray(item.stations) ? item.stations : [];
  const stops = raw.filter((s) => !!s.station?.trim()).map((s, i) => makeStop(s.station!.trim(), i, s));
  if (stops.length < 2) return null;
  const vehicle = item.vehicle_number?.trim() || item["Vehicle Number"]?.trim();
  return { id: `private-api-${slug(vehicle || "bus")}-${item.trip ?? index}`, vehicleNumber: vehicle, serviceName: item.trip !== undefined ? `Trip ${item.trip}` : "Private Bus", operator: "Private Bus", mode: "bus", source: "private-bus-api", stops, isLive: false };
}

function datasetTrips(data: Dataset): TransportTrip[] {
  const result: TransportTrip[] = [];
  for (const [busIndex, bus] of (data.busSchedules ?? []).entries()) {
    const vehicle = bus.vehicle_number?.trim() || bus["Vehicle Number"]?.trim();
    const route = (bus.route ?? []).map((x) => x.trim()).filter(Boolean);
    for (const [tripIndex, schedule] of (bus.schedule ?? []).entries()) {
      const scheduledStations = schedule.stations ?? [];
      const names = route.length >= 2 ? route : scheduledStations.map((s) => s.station?.trim() || "").filter(Boolean);
      if (names.length < 2) continue;
      const stops = names.map((name, i) => makeStop(name, i, findTiming(scheduledStations, name)));
      result.push({ id: `private-dataset-${slug(vehicle || `bus-${busIndex}`)}-${schedule.trip ?? tripIndex}`, vehicleNumber: vehicle, serviceName: schedule.trip !== undefined ? `Trip ${schedule.trip}` : "Private Bus", operator: "Private Bus", mode: "bus", source: "private-bus-api", stops, isLive: false });
    }
  }
  return result;
}

function tripKey(t: TransportTrip): string {
  const first = t.stops[0];
  const fromTime = first?.departureTime ?? first?.arrivalTime ?? "";
  return [t.operator, t.vehicleNumber ?? "", fromTime, t.stops.map((s) => norm(s.stop.name)).join(">")].join("|").toLowerCase();
}

function journey(t: TransportTrip, from: string, to: string): Journey | null {
  const fi = t.stops.findIndex((s) => stopMatches(s.stop.name, from));
  const ti = t.stops.findIndex((s) => stopMatches(s.stop.name, to));
  if (fi < 0 || ti < 0 || fi >= ti) return null;
  const a = t.stops[fi];
  const b = t.stops[ti];
  const departureTime = a.departureTime ?? a.arrivalTime ?? undefined;
  const arrivalTime = b.arrivalTime ?? b.departureTime ?? undefined;
  if (!departureTime || !arrivalTime) return null;
  return { segments: [{ trip: t, from: a, to: b }], transfers: 0, totalDurationMinutes: undefined, waitingTimeMinutes: 0, departureTime, arrivalTime, isLive: false, isPast: false };
}

async function privateTrips(from: string, to: string): Promise<TransportTrip[]> {
  const [dataset, api] = await Promise.allSettled([
    fetch(DATASET_URL, { headers: { Accept: "application/json" }, next: { revalidate: 300 } }).then(async (r) => r.ok ? datasetTrips(await r.json() as Dataset) : []),
    fetch(`${SCHEDULE_API_URL}?${new URLSearchParams({ departure: resolveStopName(from), destination: resolveStopName(to), restrict: "false" })}`, { headers: { Accept: "application/json" }, next: { revalidate: 60 } }).then(async (r) => {
      if (!r.ok) return [] as TransportTrip[];
      const data = await r.json() as unknown;
      const rows = Array.isArray(data) ? data : data && typeof data === "object" && "data" in data && Array.isArray((data as { data?: unknown[] }).data) ? (data as { data: unknown[] }).data : data && typeof data === "object" && "schedules" in data && Array.isArray((data as { schedules?: unknown[] }).schedules) ? (data as { schedules: unknown[] }).schedules : [];
      return rows.map((x, i) => apiTripToTransport(x as ApiTrip, i)).filter((x): x is TransportTrip => !!x);
    }),
  ]);
  const all: TransportTrip[] = [];
  if (dataset.status === "fulfilled") all.push(...dataset.value.filter((t) => routeMatches(t.stops, from, to) && journeyHasTimes(t, from, to)));
  if (api.status === "fulfilled") all.push(...api.value.filter((t) => routeMatches(t.stops, from, to) && journeyHasTimes(t, from, to)));
  const seen = new Set<string>();
  return all.filter((t) => { const k = tripKey(t); if (seen.has(k)) return false; seen.add(k); return true; });
}

export async function searchVerifiedTransport(from: string, to: string): Promise<TransportSearchResult> {
  const resolvedFrom = resolveStopName(from);
  const resolvedTo = resolveStopName(to);
  const [privateResult, ksrtcResult] = await Promise.allSettled([
    privateTrips(resolvedFrom, resolvedTo),
    getKsrtcTrips(resolvedFrom, resolvedTo),
  ]);
  const trips: TransportTrip[] = [];
  if (privateResult.status === "fulfilled") trips.push(...privateResult.value);
  if (ksrtcResult.status === "fulfilled") trips.push(...ksrtcResult.value.filter((t) => journeyHasTimes(t, resolvedFrom, resolvedTo)));
  const seen = new Set<string>();
  const directJourneys = trips
    .map((t) => journey(t, resolvedFrom, resolvedTo))
    .filter((j): j is Journey => !!j)
    .filter((j) => {
      const t = j.segments[0].trip;
      const k = `${t.source}|${t.operator}|${t.vehicleNumber ?? ""}|${j.departureTime}|${j.arrivalTime}|${t.serviceName ?? ""}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.departureTime ?? "99:99").localeCompare(b.departureTime ?? "99:99"));
  return { from: resolvedFrom, to: resolvedTo, directJourneys, connectingJourneys: [], searchedAt: new Date().toISOString() };
}
