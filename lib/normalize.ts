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
  const stopName = normalizeName(stop.stop.name);
  const searchName = normalizeName(place);

  return (
    stopName === searchName ||
    stopName.includes(searchName) ||
    searchName.includes(stopName)
  );
}

/*
 * Convert schedule time such as:
 *
 * 02:30 pm
 * 5:40 PM
 * 17:40
 *
 * into minutes after midnight.
 */
function timeToMinutes(
  value: string | null | undefined
): number | null {
  if (!value) {
    return null;
  }

  const text = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  // 24-hour format: 17:40
  const twentyFourHour =
    text.match(/^(\d{1,2}):(\d{2})$/);

  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);

    if (
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      return hour * 60 + minute;
    }
  }

  // 12-hour format: 5:40 pm
  const twelveHour =
    text.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/
    );

  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? "0");
    const period = twelveHour[3];

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
      } else if (hour !== 12) {
        hour += 12;
      }

      return hour * 60 + minute;
    }
  }

  return null;
}

/*
 * Current time in Kerala / India.
 *
 * Vercel servers normally use UTC, so we explicitly
 * calculate the current Indian time.
 */
function getCurrentIndiaMinutes(): number {
  const formatter = new Intl.DateTimeFormat(
    "en-IN",
    {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );

  const parts = formatter.formatToParts(
    new Date()
  );

  const hour = Number(
    parts.find((part) => part.type === "hour")
      ?.value ?? "0"
  );

  const minute = Number(
    parts.find((part) => part.type === "minute")
      ?.value ?? "0"
  );

  return hour * 60 + minute;
}

function createDirectJourney(
  trip: TransportTrip,
  from: string,
  to: string
): Journey | null {
  const fromIndex = trip.stops.findIndex(
    (stop) => stopMatches(stop, from)
  );

  const toIndex = trip.stops.findIndex(
    (stop) => stopMatches(stop, to)
  );

  if (
    fromIndex === -1 ||
    toIndex === -1 ||
    fromIndex >= toIndex
  ) {
    return null;
  }

  const fromStop = trip.stops[fromIndex];
  const toStop = trip.stops[toIndex];

  const departureTime =
    fromStop.departureTime ??
    fromStop.arrivalTime ??
    undefined;

  const arrivalTime =
    toStop.arrivalTime ??
    toStop.departureTime ??
    undefined;

  const currentMinutes =
    getCurrentIndiaMinutes();

  const departureMinutes =
    timeToMinutes(departureTime);

  let waitingTimeMinutes:
    | number
    | undefined;

  /*
   * Only keep buses that have not departed yet.
   *
   * We deliberately allow a small 1-minute tolerance
   * because the user may search exactly at departure time.
   */
  if (departureMinutes !== null) {
    waitingTimeMinutes =
      departureMinutes - currentMinutes;

    if (waitingTimeMinutes < -1) {
      return null;
    }
  }

  const segment: JourneySegment = {
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

    isLive: trip.isLive ?? false,
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
      (journey): journey is Journey =>
        journey !== null
    )
    .sort((a, b) => {
      const aWait =
        a.waitingTimeMinutes ??
        Number.MAX_SAFE_INTEGER;

      const bWait =
        b.waitingTimeMinutes ??
        Number.MAX_SAFE_INTEGER;

      return aWait - bWait;
    });
}

export function createSearchResult(
  from: string,
  to: string,
  trips: TransportTrip[]
): TransportSearchResult {
  const directJourneys =
    findDirectJourneys(
      trips,
      from,
      to
    );

  return {
    from,
    to,
    directJourneys,

    connectingJourneys: [],

    searchedAt:
      new Date().toISOString(),
  };
}
