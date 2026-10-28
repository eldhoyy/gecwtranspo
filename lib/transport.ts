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

type ApiTrip = {
  vehicle_number?: string;
  "Vehicle Number"?: string;
  trip?: string | number;
  stations?: ApiStation[];
};

type ApiBus = {
  "Vehicle Number"?: string;
  vehicle_number?: string;
  route?: string[];
  schedule?: {
    trip?: string | number;
    stations?: ApiStation[];
  }[];
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

function convertStations(
  stations: ApiStation[] | undefined
): ScheduledStop[] {
  if (!Array.isArray(stations)) {
    return [];
  }

  return stations
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
}

function convertApiTrip(
  trip: ApiTrip,
  index: number
): TransportTrip | null {
  const stops = convertStations(trip.stations);

  if (stops.length < 2) {
    return null;
  }

  const vehicleNumber =
    trip.vehicle_number ??
    trip["Vehicle Number"] ??
    undefined;

  const tripNumber = trip.trip ?? index;

  return {
    id: `private-${vehicleNumber || "bus"}-${tripNumber}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-"),

    vehicleNumber,

    serviceName:
      trip.trip !== undefined
        ? `Trip ${trip.trip}`
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
      const trip = convertApiTrip(
        {
          vehicle_number:
            bus.vehicle_number,

          "Vehicle Number":
            bus["Vehicle Number"],

          trip:
            schedule.trip,

          stations:
            schedule.stations,
        },

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
    const fromIndex =
      trip.stops.findIndex(
        (stop) =>
          stationMatches(
            stop.stop.name,
            from
          )
      );

    const toIndex =
      trip.stops.findIndex(
        (stop) =>
          stationMatches(
            stop.stop.name,
            to
          )
      );

    return (
      fromIndex !== -1 &&
      toIndex !== -1 &&
      fromIndex < toIndex
    );
  });
}

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

  const data: unknown =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "Schedule API returned invalid data."
    );
  }

  return data
    .map((item, index) =>
      convertApiTrip(
        item as ApiTrip,
        index
      )
    )
    .filter(
      (trip): trip is TransportTrip =>
        trip !== null
    );
}

async function fetchFromDataset(): Promise<
  TransportTrip[]
> {
  const response = await fetch(
    DATASET_URL,
    {
      headers: {
        Accept: "application/json",
      },

      next: {
        revalidate: 3600,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Bus dataset returned ${response.status}`
    );
  }

  const data: Dataset =
    await response.json();

  return convertDataset(data);
}

/*
 * Remove duplicate copies of the same
 * vehicle + trip + route.
 */
function deduplicateTrips(
  trips: TransportTrip[]
): TransportTrip[] {
  const seen = new Set<string>();

  return trips.filter((trip) => {
    const stopsKey = trip.stops
      .map(
        (stop) =>
          `${normalizeName(
            stop.stop.name
          )}:${stop.departureTime ?? ""}`
      )
      .join("|");

    const key =
      `${trip.vehicleNumber ?? "unknown"}|` +
      `${trip.serviceName ?? ""}|` +
      stopsKey;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

export async function searchBuses(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const resolvedFrom =
    resolveStopName(from);

  const resolvedTo =
    resolveStopName(to);

  try {
    /*
     * IMPORTANT:
     *
     * We now search BOTH:
     *
     * 1. Live/API schedule source
     * 2. Complete Wayanad dataset
     *
     * The old code searched the dataset only
     * when the API failed. That could make a
     * search return only one bus.
     */

    const [apiResult, datasetResult] =
      await Promise.allSettled([
        fetchFromScheduleApi(
          resolvedFrom,
          resolvedTo
        ),

        fetchFromDataset(),
      ]);

    let allTrips: TransportTrip[] = [];

    /*
     * Add API results.
     */
    if (
      apiResult.status === "fulfilled"
    ) {
      allTrips.push(
        ...apiResult.value
      );
    } else {
      console.warn(
        "Schedule API failed:",
        apiResult.reason
      );
    }

    /*
     * Add ALL Wayanad dataset trips.
     */
    if (
      datasetResult.status === "fulfilled"
    ) {
      allTrips.push(
        ...datasetResult.value
      );
    } else {
      console.warn(
        "Wayanad dataset failed:",
        datasetResult.reason
      );
    }

    /*
     * Remove duplicate copies.
     */
    allTrips =
      deduplicateTrips(allTrips);

    /*
     * Find EVERY bus that contains both
     * requested stops in the correct order.
     */
    const directTrips =
      findDirectTrips(
        allTrips,
        resolvedFrom,
        resolvedTo
      );

    console.log(
      `GECW Go search: ${resolvedFrom} -> ${resolvedTo}`,
      `| all source trips: ${allTrips.length}`,
      `| matching buses: ${directTrips.length}`
    );

    /*
     * createSearchResult already keeps every
     * matching journey and sorts upcoming buses
     * before departed buses.
     */
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
