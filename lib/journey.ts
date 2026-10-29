import type { Journey, JourneySegment, ScheduledStop, TransportTrip } from "./types";
import { getStopNameVariants, resolveStopName } from "./stops";

export function normalizeTime(value?: string | null): string | undefined {
  if (!value) return undefined;
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  const m24 = text.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const h = Number(m24[1]);
    const m = Number(m24[2]);
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const m12 = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!m12) return undefined;
  let h = Number(m12[1]);
  const m = Number(m12[2] ?? 0);
  if (h < 1 || h > 12 || m > 59) return undefined;
  if (m12[3] === "am" && h === 12) h = 0;
  if (m12[3] === "pm" && h !== 12) h += 12;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMinutes(value?: string | null): number | null {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

function matchesStop(stop: ScheduledStop, requested: string): boolean {
  const variants = getStopNameVariants(requested).map((v) => v.trim().toLowerCase());
  const name = stop.stop.name.trim().toLowerCase();
  return variants.some((v) => name === v || name.includes(v) || v.includes(name));
}

function findIndex(stops: ScheduledStop[], requested: string): number {
  return stops.findIndex((stop) => matchesStop(stop, requested));
}

export function createDirectJourney(trip: TransportTrip, from: string, to: string): Journey | null {
  if (trip.mode !== "bus" || trip.stops.length < 2) return null;
  const fromIndex = findIndex(trip.stops, from);
  const toIndex = findIndex(trip.stops, to);
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) return null;

  const fromStop = trip.stops[fromIndex];
  const toStop = trip.stops[toIndex];
  const departureTime = normalizeTime(fromStop.departureTime ?? fromStop.arrivalTime);
  const arrivalTime = normalizeTime(toStop.arrivalTime ?? toStop.departureTime);
  const departureMinutes = timeToMinutes(departureTime);
  const arrivalMinutes = timeToMinutes(arrivalTime);
  let duration: number | undefined;
  if (departureMinutes !== null && arrivalMinutes !== null) {
    duration = arrivalMinutes >= departureMinutes ? arrivalMinutes - departureMinutes : arrivalMinutes + 1440 - departureMinutes;
  }

  const segment: JourneySegment = { trip, from: fromStop, to: toStop };
  return {
    segments: [segment],
    transfers: 0,
    totalDurationMinutes: duration,
    departureTime,
    arrivalTime,
    isLive: trip.isLive ?? false,
  };
}

export function findDirectJourneys(trips: TransportTrip[], from: string, to: string): Journey[] {
  const resolvedFrom = resolveStopName(from);
  const resolvedTo = resolveStopName(to);
  if (!resolvedFrom || !resolvedTo || resolvedFrom.toLowerCase() === resolvedTo.toLowerCase()) return [];

  return trips
    .map((trip) => createDirectJourney(trip, resolvedFrom, resolvedTo))
    .filter((j): j is Journey => Boolean(j))
    .sort((a, b) => {
      const at = timeToMinutes(a.departureTime);
      const bt = timeToMinutes(b.departureTime);
      if (at === null && bt === null) return 0;
      if (at === null) return 1;
      if (bt === null) return -1;
      return at - bt;
    });
}
