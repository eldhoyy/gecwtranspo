import type {
  ScheduledStop,
  TransportSearchResult,
  TransportStop,
  TransportTrip,
  Journey,
} from "@/lib/types";
import { getStopNameVariants, resolveStopName } from "./stops";
import { getKsrtcTrips } from "./sources/ksrtc";

type ApiStation = {
  station?: string;
  arrivalTime?: string | null;
  departureTime?: string | null;
};

type ApiTrip = {
  vehicle_number?: string;
  "Vehicle Number"?: string;
  trip?: string | number;
  stations?: ApiStation[];
};

const SCHEDULE_API_URL = "https://busapi.amithv.xyz/api/v1/schedules";

const SEARCH_TIMEOUT_MS = 12000;
const RESULT_CACHE_MS = 5 * 60 * 1000;

const resultCache = new Map<string, { expiresAt: number; result: TransportSearchResult }>();

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/[.,/()\-–—]+/g, " ").replace(/\s+/g, " ");
}

function slugify(value: string): string {
  return normalizeName(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function makeStopId(name: string): string {
  return `bus-${slugify(name)}`;
}

function stationMatches(stationName: string, requestedName: string): boolean {
  const station = normalizeName(stationName);
  return getStopNameVariants(requestedName).some((variant) => {
    const requested = normalizeName(variant);
    return station === requested || station.includes(requested) || requested.includes(station);
  });
}

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");

  const twentyFour = text.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute;
    return null;
  }

  const twelve = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!twelve) return null;
  let hour = Number(twelve[1]);
  const minute = Number(twelve[2] ?? "0");
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (twelve[3] === "am" && hour === 12) hour = 0;
  if (twelve[3] === "pm" && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

function convertStations(stations: ApiStation[] | undefined): ScheduledStop[] {
  if (!Array.isArray(stations)) return [];
  return stations
    .map((station, sequence) => {
      const name = station.station?.trim();
      if (!name) return null;
      const stop: TransportStop = { id: makeStopId(name), name };
      return {
        stop,
        sequence,
        arrivalTime: station.arrivalTime ?? null,
        departureTime: station.departureTime ?? null,
      } satisfies ScheduledStop;
    })
    .filter((stop): stop is ScheduledStop => stop !== null);
}

function convertApiTrip(trip: ApiTrip, index: number): TransportTrip | null {
  const stops = convertStations(trip.stations);
  if (stops.length < 2) return null;

  const vehicleNumber = trip.vehicle_number?.trim() || trip["Vehicle Number"]?.trim() || undefined;
  const tripNumber = trip.trip ?? index;

  return {
    id: `private-${slugify(`${vehicleNumber ?? "bus"}-${tripNumber}-${stops.map((s) => normalizeName(s.stop.name)).join("-")}`)}`,
    vehicleNumber,
    serviceName: trip.trip !== undefined ? `Trip ${trip.trip}` : undefined,
    operator: "Private Bus",
    mode: "bus",
    source: "private-bus-api",
    stops,
    isLive: false,
  };
}

function findOrderedStops(trip: TransportTrip, from: string, to: string): [ScheduledStop, ScheduledStop] | null {
  const fromIndex = trip.stops.findIndex((stop) => stationMatches(stop.stop.name, from));
  const toIndex = trip.stops.findIndex((stop) => stationMatches(stop.stop.name, to));
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) return null;
  return [trip.stops[fromIndex], trip.stops[toIndex]];
}

function tripToJourney(trip: TransportTrip, from: string, to: string): Journey | null {
  const endpoints = findOrderedStops(trip, from, to);
  if (!endpoints) return null;

  const [fromStop, toStop] = endpoints;
  const departureTime = fromStop.departureTime ?? fromStop.arrivalTime ?? undefined;
  const arrivalTime = toStop.arrivalTime ?? toStop.departureTime ?? undefined;
  const departureMinutes = timeToMinutes(departureTime);
  const arrivalMinutes = timeToMinutes(arrivalTime);

  let duration: number | undefined;
  if (departureMinutes !== null && arrivalMinutes !== null) {
    duration = arrivalMinutes >= departureMinutes
      ? arrivalMinutes - departureMinutes
      : arrivalMinutes + 24 * 60 - departureMinutes;
  }

  return {
    segments: [{ trip, from: fromStop, to: toStop }],
    transfers: 0,
    totalDurationMinutes: duration,
    departureTime,
    arrivalTime,
    isLive: trip.isLive ?? false,
  };
}

function journeySort(a: Journey, b: Journey): number {
  if (a.transfers !== b.transfers) return a.transfers - b.transfers;
  const aTime = timeToMinutes(a.departureTime);
  const bTime = timeToMinutes(b.departureTime);
  if (aTime === null && bTime === null) return 0;
  if (aTime === null) return 1;
  if (bTime === null) return -1;
  return aTime - bTime;
}

function dedupeTrips(trips: TransportTrip[]): TransportTrip[] {
  const seen = new Set<string>();
  const result: TransportTrip[] = [];
  for (const trip of trips) {
    const route = trip.stops.map((s) => normalizeName(s.stop.name)).join("|");
    const identity = `${trip.source}|${normalizeName(trip.operator ?? "")}|${normalizeName(trip.vehicleNumber ?? trip.serviceName ?? "")}|${route}|${trip.stops.map((s) => `${s.arrivalTime ?? ""}/${s.departureTime ?? ""}`).join("|")}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(trip);
  }
  return result;
}

async function fetchJson<T>(url: string, timeoutMs = SEARCH_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.warn("Transport source failed:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPrivateTrips(from: string, to: string): Promise<TransportTrip[]> {
  const params = new URLSearchParams({
    departure: from,
    destination: to,
    restrict: "false",
  });

  const data = await fetchJson<ApiTrip[]>(`${SCHEDULE_API_URL}?${params.toString()}`);
  if (!Array.isArray(data)) return [];

  return data.map(convertApiTrip).filter((trip): trip is TransportTrip => trip !== null);
}

function cacheKey(from: string, to: string): string {
  return `${normalizeName(from)}=>${normalizeName(to)}`;
}

export async function searchTransport(from: string, to: string): Promise<TransportSearchResult> {
  const fromName = resolveStopName(from);
  const toName = resolveStopName(to);

  if (!fromName || !toName || normalizeName(fromName) === normalizeName(toName)) {
    return {
      from: fromName,
      to: toName,
      directJourneys: [],
      connectingJourneys: [],
      searchedAt: new Date().toISOString(),
    };
  }

  const key = cacheKey(fromName, toName);
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const [privateTrips, ksrtcTrips] = await Promise.all([
    fetchPrivateTrips(fromName, toName),
    getKsrtcTrips(fromName, toName),
  ]);

  const trips = dedupeTrips([...privateTrips, ...ksrtcTrips]);
  const directJourneys = trips
    .map((trip) => tripToJourney(trip, fromName, toName))
    .filter((journey): journey is Journey => journey !== null)
    .sort(journeySort);

  const result: TransportSearchResult = {
    from: fromName,
    to: toName,
    directJourneys,
    connectingJourneys: [],
    searchedAt: new Date().toISOString(),
  };

  resultCache.set(key, { expiresAt: Date.now() + RESULT_CACHE_MS, result });
  return result;
}

export async function searchBuses(from: string, to: string): Promise<TransportSearchResult> {
  return searchTransport(from, to);
}

export { timeToMinutes };
