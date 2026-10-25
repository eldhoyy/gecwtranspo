import type {
  Journey,
  JourneySegment,
  ScheduledStop,
  TransportSearchResult,
  TransportTrip,
} from "@/lib/types";

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function stopMatches(stop: ScheduledStop, place: string): boolean {
  const stopName = normalizeName(stop.stop.name);
  const searchName = normalizeName(place);

  return (
    stopName === searchName ||
    stopName.includes(searchName) ||
    searchName.includes(stopName)
  );
}

function createDirectJourney(
  trip: TransportTrip,
  from: string,
  to: string
): Journey | null {
  const fromIndex = trip.stops.findIndex((stop) =>
    stopMatches(stop, from)
  );

  const toIndex = trip.stops.findIndex((stop) =>
    stopMatches(stop, to)
  );

  /*
   * The order check is critical.
   *
   * A bus must actually travel:
   *
   * FROM → TO
   *
   * We must not return a bus simply because both places
   * appear somewhere in its complete route.
   */
  if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) {
    return null;
  }

  const fromStop = trip.stops[fromIndex];
  const toStop = trip.stops[toIndex];

  const segment: JourneySegment = {
    trip,
    from: fromStop,
    to: toStop,
  };

  return {
    segments: [segment],
    transfers: 0,
    departureTime:
      fromStop.departureTime ?? fromStop.arrivalTime ?? undefined,
    arrivalTime:
      toStop.arrivalTime ?? toStop.departureTime ?? undefined,
    isLive: trip.isLive ?? false,
  };
}

export function findDirectJourneys(
  trips: TransportTrip[],
  from: string,
  to: string
): Journey[] {
  return trips
    .map((trip) => createDirectJourney(trip, from, to))
    .filter((journey): journey is Journey => journey !== null);
}

export function createSearchResult(
  from: string,
  to: string,
  trips: TransportTrip[]
): TransportSearchResult {
  const directJourneys = findDirectJourneys(trips, from, to);

  return {
    from,
    to,
    directJourneys,
    connectingJourneys: [],
    searchedAt: new Date().toISOString(),
  };
}
