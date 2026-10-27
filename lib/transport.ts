import type {
  ScheduledStop,
  TransportSearchResult,
  TransportStop,
  TransportTrip,
} from "@/lib/types";

import { createSearchResult } from "./normalize";
import { resolveStopName } from "./stops";

type ApiStation = {
  station?: string;
  arrivalTime?: string | null;
  departureTime?: string | null;
};

type ApiSchedule = {
  trip?: string | number;
  stations?: ApiStation[];
};

type ApiBus = {
  "Vehicle Number"?: string;
  vehicle_number?: string;
  route?: string[];
  schedule?: ApiSchedule[];
};

type Dataset = {
  busSchedules?: ApiBus[];
};

const SCHEDULE_API_URL =
  "https://busapi.amithv.xyz/api/v1/schedules";

const DATASET_URL =
  "https://raw.githubusercontent.com/amith-vp/Kerala-Private-Bus-Timing/main/wayanad.json";

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "");
}

function makeStopId(name: string): string {
  return `private-${normalizeName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function stationMatches(
  stationName: string,
  requestedName: string
): boolean {
  const station = normalizeName(stationName);
  const requested = normalizeName(requestedName);

  return (
    station === requested ||
    station.includes(requested) ||
    requested.includes(station)
  );
}

function convertSchedule(
  bus: ApiBus,
  schedule: ApiSchedule,
  index: number
): TransportTrip | null {
  if (
    !Array.isArray(schedule.stations) ||
    schedule.stations.length < 2
  ) {
    return null;
  }

  const vehicleNumber =
    bus["Vehicle Number"] ??
    bus.vehicle_number ??
    undefined;

  const stops: ScheduledStop[] = schedule.stations
    .map((station, sequence) => {
      const name = station.station?.trim();

      if (!name) {
        return null;
      }

      const stop: TransportStop = {
        id: makeStopId(name),
        name,
      };

      return {
        stop,
        sequence,
        arrivalTime: station.arrivalTime ?? null,
        departureTime: station.departureTime ?? null,
      };
    })
    .filter(
      (stop): stop is ScheduledStop =>
        stop !== null
    );

  if (stops.length < 2) {
    return null;
  }

  return {
    /*
     * IMPORTANT:
     * Do not use only the vehicle number as the ID.
     *
     * One bus can have multiple scheduled trips.
     * Each trip must therefore have its own unique ID.
     */
    id:
      `private-${vehicleNumber || "bus"}-${schedule.trip ?? index}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),

    vehicleNumber,

    serviceName:
      schedule.trip !== undefined
        ? `Trip ${schedule.trip}`
        : undefined,

    operator: "Private Bus",

    mode: "bus",

    source: "private-bus-api",

    stops,

    isLive: false,
  };
}

function convertDataset(
  data: Dataset
): TransportTrip[] {
  const buses = Array.isArray(data.busSchedules)
    ? data.busSchedules
    : [];

  const trips: TransportTrip[] = [];

  buses.forEach((bus, busIndex) => {
    const schedules = Array.isArray(bus.schedule)
      ? bus.schedule
      : [];

    schedules.forEach((schedule, scheduleIndex) => {
      const trip = convertSchedule(
        bus,
        schedule,
        busIndex * 1000 + scheduleIndex
      );

      if (trip) {
        trips.push(trip);
      }
    });
  });

  return trips;
}

function findDirectTrips(
  trips: TransportTrip[],
  from: string,
  to: string
): TransportTrip[] {
  return trips.filter((trip) => {
    const fromIndex = trip.stops.findIndex((stop) =>
      stationMatches(stop.stop.name, from)
    );

    const toIndex = trip.stops.findIndex((stop) =>
      stationMatches(stop.stop.name, to)
    );

    return (
      fromIndex !== -1 &&
      toIndex !== -1 &&
      fromIndex < toIndex
    );
  });
}

/*
 * Get ALL matching trips from the schedule API.
 *
 * IMPORTANT:
 * We deliberately do NOT send the optional `time`
 * parameter. Sending a time can cause already-departed
 * or other scheduled buses to disappear from the results.
 */
async function fetchFromScheduleApi(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const url =
    `${SCHEDULE_API_URL}?departure=${encodeURIComponent(
      from
    )}&destination=${encodeURIComponent(to)}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Schedule API returned ${response.status}`
    );
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "Schedule API returned invalid data."
    );
  }

  return data
    .map((item, index) =>
      convertSchedule(
        {
          vehicle_number:
            (item as {
              vehicle_number?: string;
            }).vehicle_number,

          "Vehicle Number":
            (item as {
              "Vehicle Number"?: string;
            })["Vehicle Number"],

          schedule: [
            {
              trip: (item as {
                trip?: string | number;
              }).trip,

              stations: (item as {
                stations?: ApiStation[];
              }).stations,
            },
          ],
        },
        (
          item as {
            trip?: string | number;
          }
        ).trip !== undefined
          ? {
              trip: (
                item as {
                  trip?: string | number;
                }
              ).trip,

              stations: (
                item as {
                  stations?: ApiStation[];
                }
              ).stations,
            }
          : {
              stations: (
                item as {
                  stations?: ApiStation[];
                }
              ).stations,
            },
        },
        index
      )
    )
    .filter(
      (trip): trip is TransportTrip =>
        trip !== null
    );
}

/*
 * Fallback to the Wayanad dataset if the API is unavailable.
 */
async function fetchFromDataset(): Promise<
  TransportTrip[]
> {
  const response = await fetch(DATASET_URL, {
    headers: {
      Accept: "application/json",
    },
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Bus dataset returned ${response.status}`
    );
  }

  const data: Dataset = await response.json();

  return convertDataset(data);
}

export async function searchBuses(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const resolvedFrom = resolveStopName(from);
  const resolvedTo = resolveStopName(to);

  try {
    let directTrips: TransportTrip[] = [];

    /*
     * First try the schedule API.
     */
    try {
      const apiTrips =
        await fetchFromScheduleApi(
          resolvedFrom,
          resolvedTo
        );

      directTrips = findDirectTrips(
        apiTrips,
        resolvedFrom,
        resolvedTo
      );
    } catch (apiError) {
      console.warn(
        "Schedule API failed. Using Wayanad dataset.",
        apiError
      );

      /*
       * Fallback dataset.
       */
      const allTrips =
        await fetchFromDataset();

      directTrips = findDirectTrips(
        allTrips,
        resolvedFrom,
        resolvedTo
      );
    }

    console.log(
      `GECW Go search: ${resolvedFrom} -> ${resolvedTo}`,
      `| direct trips: ${directTrips.length}`
    );

    return createSearchResult(
      resolvedFrom,
      resolvedTo,
      directTrips
    );
  } catch (error) {
    console.error(
      "Bus search failed:",
      error
    );

    return {
      from: resolvedFrom,
      to: resolvedTo,
      directJourneys: [],
      connectingJourneys: [],
      searchedAt:
        new Date().toISOString(),
    };
  }
}
