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

function stopMatches(
  stop: ScheduledStop,
  place: string
): boolean {
  const stopName =
    normalizeName(stop.stop.name);

  const searchName =
    normalizeName(place);

  return (
    stopName === searchName ||
    stopName.includes(searchName) ||
    searchName.includes(stopName)
  );
}

export function timeToMinutes(
  value: string | null | undefined
): number | null {
  if (!value) return null;

  const text = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  /*
   * 24-hour format
   * Example: 17:40
   */
  const twentyFourHour =
    text.match(
      /^(\d{1,2}):(\d{2})$/
    );

  if (twentyFourHour) {
    const hour =
      Number(twentyFourHour[1]);

    const minute =
      Number(twentyFourHour[2]);

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return hour * 60 + minute;
    }
  }

  /*
   * 12-hour format
   */
  const twelveHour =
    text.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/
    );

  if (twelveHour) {
    let hour =
      Number(twelveHour[1]);

    const minute =
      Number(twelveHour[2] ?? "0");

    const period =
      twelveHour[3];

    if (
      hour >= 1 &&
      hour <= 12 &&
      minute >= 0 &&
      minute <= 59
    ) {
      if (period === "am") {
        if (hour === 12) {
          hour = 0;
        }
      } else {
        if (hour !== 12) {
          hour += 12;
        }
      }

      return hour * 60 + minute;
    }
  }

  return null;
}

function getCurrentIndiaMinutes(): number {
  const formatter =
    new Intl.DateTimeFormat(
      "en-IN",
      {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }
    );

  const parts =
    formatter.formatToParts(
      new Date()
    );

  const hour =
    Number(
      parts.find(
        (part) =>
          part.type === "hour"
      )?.value ?? "0"
    );

  const minute =
    Number(
      parts.find(
        (part) =>
          part.type === "minute"
      )?.value ?? "0"
    );

  return hour * 60 + minute;
}

function createDirectJourney(
  trip: TransportTrip,
  from: string,
  to: string
): Journey | null {
  const fromIndex =
    trip.stops.findIndex(
      (stop) =>
        stopMatches(stop, from)
    );

  const toIndex =
    trip.stops.findIndex(
      (stop) =>
        stopMatches(stop, to)
    );

  /*
   * Direction is important.
   *
   * A bus must encounter FROM
   * before TO.
   */
  if (
    fromIndex === -1 ||
    toIndex === -1 ||
    fromIndex >= toIndex
  ) {
    return null;
  }

  const fromStop =
    trip.stops[fromIndex];

  const toStop =
    trip.stops[toIndex];

  const departureTime =
    fromStop.departureTime ??
    fromStop.arrivalTime ??
    undefined;

  const arrivalTime =
    toStop.arrivalTime ??
    toStop.departureTime ??
    undefined;

  const departureMinutes =
    timeToMinutes(
      departureTime
    );

  const currentMinutes =
    getCurrentIndiaMinutes();

  let waitingTimeMinutes:
    | number
    | undefined;

  let isPast = false;

  if (
    departureMinutes !== null
  ) {
    waitingTimeMinutes =
      departureMinutes -
      currentMinutes;

    /*
     * IMPORTANT:
     *
     * Past buses are NOT removed.
     * They remain visible as DEPARTED.
     */
    isPast =
      departureMinutes <
      currentMinutes;
  }

  const segment:
    JourneySegment = {
    trip,
    from: fromStop,
    to: toStop,
  };

  return {
    segments: [segment],

    transfers: 0,

    departureTime,

    arrivalTime,

    waitingTimeMinutes,

    isLive:
      trip.isLive ?? false,

    isPast,
  };
}

export function findDirectJourneys(
  trips: TransportTrip[],
  from: string,
  to: string
): Journey[] {
  return trips
    .map((trip) =>
      createDirectJourney(
        trip,
        from,
        to
      )
    )
    .filter(
      (
        journey
      ): journey is Journey =>
        journey !== null
    )
    .sort((a, b) => {
      /*
       * IMPORTANT:
       *
       * Do NOT put upcoming buses
       * before departed buses.
       *
       * Everything is sorted purely
       * by departure time.
       *
       * Example:
       *
       * 06:00
       * 06:30
       * 07:00
       * ...
       * 13:05
       * ...
       */
      const aTime =
        timeToMinutes(
          a.departureTime
        );

      const bTime =
        timeToMinutes(
          b.departureTime
        );

      if (
        aTime !== null &&
        bTime !== null
      ) {
        return aTime - bTime;
      }

      if (aTime !== null) return -1;
      if (bTime !== null) return 1;

      return 0;
    });
}

export function createSearchResult(
  from: string,
  to: string,
  trips: TransportTrip[]
): TransportSearchResult {
  return {
    from,
    to,

    directJourneys:
      findDirectJourneys(
        trips,
        from,
        to
      ),

    connectingJourneys: [],

    searchedAt:
      new Date().toISOString(),
  };
}
