import type {
  ScheduledStop,
  TransportSearchResult,
  TransportStop,
  TransportTrip,
  Journey,
  JourneySegment,
} from "@/lib/types";
import { getStopNameVariants, resolveStopName } from "./stops";
import { getKsrtcTrips } from "./sources/ksrtc";

type ApiStation = { station?: string; arrivalTime?: string | null; departureTime?: string | null };
type ApiTrip = { vehicle_number?: string; "Vehicle Number"?: string; trip?: string | number; stations?: ApiStation[] };
type DatasetBus = { "Vehicle Number"?: string; vehicle_number?: string; route?: string[]; schedule?: { trip?: string | number; stations?: ApiStation[] }[] };
type Dataset = { busSchedules?: DatasetBus[] };

const SCHEDULE_API_URL = "https://busapi.amithv.xyz/api/v1/schedules";
const FULL_ROUTE_API_URL = "https://busapi.amithv.xyz/api/v1/search";
const DATASET_URL = "https://raw.githubusercontent.com/amith-vp/Kerala-Private-Bus-Timing/main/wayanad.json";
const SOURCE_TIMEOUT = 12000;
const CACHE_TTL = 15 * 60 * 1000;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[.,/()\-–—]+/g, " ").replace(/\s+/g, " ");
}
function slugify(value: string): string { return normalizeName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function makeStopId(name: string): string { return `bus-${slugify(name)}`; }
function timeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}
function matchesStop(stationName: string, requestedName: string): boolean {
  const station = normalizeName(stationName);
  return getStopNameVariants(requestedName).some((v) => {
    const requested = normalizeName(v);
    return station === requested || station.includes(requested) || requested.includes(station);
  });
}
function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  let m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = Number(m[1]), min = Number(m[2]);
    return h <= 23 && min <= 59 ? h * 60 + min : null;
  }
  m = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m) return null;
  let h = Number(m[1]), min = Number(m[2] ?? 0);
  if (h < 1 || h > 12 || min > 59) return null;
  if (m[3] === "am" && h === 12) h = 0;
  if (m[3] === "pm" && h !== 12) h += 12;
  return h * 60 + min;
}
function convertStations(stations?: ApiStation[]): ScheduledStop[] {
  if (!Array.isArray(stations)) return [];
  return stations.map((s, sequence) => {
    const name = s.station?.trim();
    if (!name) return null;
    const stop: TransportStop = { id: makeStopId(name), name };
    return { stop, sequence, arrivalTime: s.arrivalTime ?? null, departureTime: s.departureTime ?? null };
  }).filter((x): x is ScheduledStop => x !== null);
}
function convertApiTrip(trip: ApiTrip, index: number): TransportTrip | null {
  const stops = convertStations(trip.stations);
  if (stops.length < 2) return null;
  const vehicleNumber = trip.vehicle_number?.trim() || trip["Vehicle Number"]?.trim() || undefined;
  const tripNumber = trip.trip ?? index;
  return {
    id: `private-api-${slugify(`${vehicleNumber ?? "bus"}-${tripNumber}-${stops.map(s => s.stop.name).join("-")}`)}`,
    vehicleNumber,
    serviceName: trip.trip !== undefined ? `Trip ${trip.trip}` : undefined,
    operator: "Private Bus",
    mode: "bus",
    source: "private-bus-api",
    stops,
    isLive: false,
  };
}
function convertDataset(data: Dataset): TransportTrip[] {
  if (!Array.isArray(data.busSchedules)) return [];
  const result: TransportTrip[] = [];
  data.busSchedules.forEach((bus, busIndex) => {
    const schedules = Array.isArray(bus.schedule) ? bus.schedule : [];
    schedules.forEach((schedule, scheduleIndex) => {
      const timed = Array.isArray(schedule.stations) ? schedule.stations : [];
      const timing = new Map<string, { arrivalTime: string | null; departureTime: string | null }>();
      timed.forEach((s) => {
        const name = s.station?.trim();
        if (name) timing.set(normalizeName(name), { arrivalTime: s.arrivalTime ?? null, departureTime: s.departureTime ?? null });
      });
      const route = (Array.isArray(bus.route) && bus.route.length ? bus.route : timed.map(s => s.station ?? "")).map(s => s.trim()).filter(Boolean);
      if (route.length < 2) return;
      const stops: ScheduledStop[] = route.map((name, sequence) => {
        const t = timing.get(normalizeName(name));
        return { stop: { id: makeStopId(name), name }, sequence, arrivalTime: t?.arrivalTime ?? null, departureTime: t?.departureTime ?? null };
      });
      const vehicleNumber = bus.vehicle_number?.trim() || bus["Vehicle Number"]?.trim() || undefined;
      const tripNumber = schedule.trip ?? scheduleIndex;
      result.push({
        id: `private-dataset-${slugify(`${vehicleNumber ?? `bus-${busIndex}`}-${tripNumber}-${route.join("-")}`)}`,
        vehicleNumber,
        serviceName: schedule.trip !== undefined ? `Trip ${schedule.trip}` : undefined,
        operator: "Private Bus",
        mode: "bus",
        source: "private-bus-api",
        stops,
        isLive: false,
      });
    });
    if (!schedules.length && Array.isArray(bus.route) && bus.route.length >= 2) {
      const route = bus.route.map(s => s.trim()).filter(Boolean);
      if (route.length >= 2) {
        const vehicleNumber = bus.vehicle_number?.trim() || bus["Vehicle Number"]?.trim() || undefined;
        result.push({
          id: `private-dataset-route-${slugify(`${vehicleNumber ?? `bus-${busIndex}`}-${route.join("-")}`)}`,
          vehicleNumber,
          operator: "Private Bus",
          mode: "bus",
          source: "private-bus-api",
          stops: route.map((name, sequence) => ({ stop: { id: makeStopId(name), name }, sequence, arrivalTime: null, departureTime: null })),
          isLive: false,
        });
      }
    }
  });
  return result;
}
async function fetchDataset(): Promise<TransportTrip[]> {
  try {
    const response = await fetch(DATASET_URL, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return [];
    return convertDataset((await response.json()) as Dataset);
  } catch { return []; }
}
async function fetchScheduleApi(from: string, to: string): Promise<TransportTrip[]> {
  try {
    const params = new URLSearchParams({ departure: from, destination: to, restrict: "false" });
    const response = await fetch(`${SCHEDULE_API_URL}?${params}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.schedules) ? data.schedules : [];
    return rows.map((x: ApiTrip, i: number) => convertApiTrip(x, i)).filter((x: TransportTrip | null): x is TransportTrip => x !== null);
  } catch { return []; }
}
async function fetchFullRoute(vehicleNumber: string): Promise<TransportTrip[]> {
  try {
    const params = new URLSearchParams({ vehicle_number: vehicleNumber });
    const response = await fetch(`${FULL_ROUTE_API_URL}?${params}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.schedules) ? data.schedules : [];
    return rows.map((x: ApiTrip, i: number) => convertApiTrip(x, i)).filter((x: TransportTrip | null): x is TransportTrip => x !== null);
  } catch { return []; }
}
async function enrichWithFullRoutes(trips: TransportTrip[]): Promise<TransportTrip[]> {
  const candidates = Array.from(new Set(trips.filter(t => t.vehicleNumber && t.stops.length < 4).map(t => t.vehicleNumber!)));
  if (!candidates.length) return trips;
  const enriched: TransportTrip[] = [];
  for (let i = 0; i < candidates.length; i += 8) {
    const batch = candidates.slice(i, i + 8);
    const rows = await Promise.all(batch.map(v => timeout(fetchFullRoute(v), 6000, [])));
    rows.flat().forEach(t => enriched.push(t));
  }
  return dedupeTrips([...trips, ...enriched]);
}
function tripIdentity(trip: TransportTrip): string {
  return [trip.source, trip.operator ?? "", trip.vehicleNumber ?? "", trip.serviceName ?? "", trip.stops.map(s => normalizeName(s.stop.name)).join(">")].join("|");
}
function dedupeTrips(trips: TransportTrip[]): TransportTrip[] {
  const map = new Map<string, TransportTrip>();
  for (const trip of trips) {
    const key = tripIdentity(trip);
    const existing = map.get(key);
    if (!existing || trip.stops.length > existing.stops.length || countTimes(trip) > countTimes(existing)) map.set(key, trip);
  }
  return [...map.values()];
}
function countTimes(trip: TransportTrip): number { return trip.stops.reduce((n, s) => n + Number(Boolean(s.arrivalTime || s.departureTime)), 0); }
function findDirectTrips(trips: TransportTrip[], from: string, to: string): TransportTrip[] {
  return trips.filter(trip => {
    if (trip.mode !== "bus" || trip.stops.length < 2) return false;
    const fromIndex = trip.stops.findIndex(s => matchesStop(s.stop.name, from));
    const toIndex = trip.stops.findIndex(s => matchesStop(s.stop.name, to));
    return fromIndex >= 0 && toIndex >= 0 && fromIndex < toIndex;
  });
}
function createJourney(trip: TransportTrip, from: string, to: string): Journey | null {
  const fromIndex = trip.stops.findIndex(s => matchesStop(s.stop.name, from));
  const toIndex = trip.stops.findIndex(s => matchesStop(s.stop.name, to));
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) return null;
  const fromStop = trip.stops[fromIndex], toStop = trip.stops[toIndex];
  const departureTime = fromStop.departureTime ?? fromStop.arrivalTime ?? undefined;
  const arrivalTime = toStop.arrivalTime ?? toStop.departureTime ?? undefined;
  const dep = timeToMinutes(departureTime), arr = timeToMinutes(arrivalTime);
  let duration: number | undefined;
  if (dep !== null && arr !== null) duration = arr >= dep ? arr - dep : arr + 1440 - dep;
  const segment: JourneySegment = { trip, from: fromStop, to: toStop };
  return { segments: [segment], transfers: 0, totalDurationMinutes: duration, departureTime, arrivalTime, isLive: trip.isLive ?? false };
}
function sortJourneys(journeys: Journey[]): Journey[] {
  return [...journeys].sort((a, b) => {
    if (a.transfers !== b.transfers) return a.transfers - b.transfers;
    const ad = timeToMinutes(a.departureTime), bd = timeToMinutes(b.departureTime);
    if (ad === null && bd === null) return 0;
    if (ad === null) return 1;
    if (bd === null) return -1;
    return ad - bd;
  });
}
let privateCache: { trips: TransportTrip[]; expiresAt: number } | null = null;
let privateLoading: Promise<TransportTrip[]> | null = null;
async function getPrivateTrips(from: string, to: string): Promise<TransportTrip[]> {
  const now = Date.now();
  if (privateCache && privateCache.expiresAt > now) return privateCache.trips;
  if (!privateLoading) {
    privateLoading = Promise.all([fetchDataset(), fetchScheduleApi(from, to)])
      .then(async ([dataset, api]) => {
        const base = dedupeTrips([...dataset, ...api]);
        const enriched = await enrichWithFullRoutes(base);
        privateCache = { trips: enriched, expiresAt: Date.now() + CACHE_TTL };
        return enriched;
      })
      .finally(() => { privateLoading = null; });
  }
  return privateLoading;
}
export async function searchTransport(from: string, to: string): Promise<TransportSearchResult> {
  const fromName = resolveStopName(from);
  const toName = resolveStopName(to);
  if (!fromName || !toName || normalizeName(fromName) === normalizeName(toName)) {
    return { from: fromName || from.trim(), to: toName || to.trim(), directJourneys: [], connectingJourneys: [], searchedAt: new Date().toISOString() };
  }
  const [privateTrips, ksrtcTrips] = await Promise.all([
    timeout(getPrivateTrips(fromName, toName), SOURCE_TIMEOUT, []),
    timeout(getKsrtcTrips(fromName, toName), SOURCE_TIMEOUT, []),
  ]);
  const allTrips = dedupeTrips([...privateTrips, ...ksrtcTrips]);
  const directJourneys = sortJourneys(findDirectTrips(allTrips, fromName, toName).map(t => createJourney(t, fromName, toName)).filter((j): j is Journey => j !== null));
  return { from: fromName, to: toName, directJourneys, connectingJourneys: [], searchedAt: new Date().toISOString() };
}
export async function searchBuses(from: string, to: string): Promise<TransportSearchResult> { return searchTransport(from, to); }
