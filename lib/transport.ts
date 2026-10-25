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
    id:
      vehicleNumber ??
      `private-${index}-${schedule.trip ?? "trip"}`,

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

export async function searchBuses(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const resolvedFrom = resolveStopName(from);
  const resolvedTo = resolveStopName(to);

  try {
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

    const trips = convertDataset(data);

    const directTrips = findDirectTrips(
      trips,
      resolvedFrom,
      resolvedTo
    );

    console.log(
      `GECW Go search: ${resolvedFrom} -> ${resolvedTo}`,
      `| total trips: ${trips.length}`,
      `| direct trips: ${directTrips.length}`
    );

    return createSearchResult(
      resolvedFrom,
      resolvedTo,
      directTrips
    );
  } catch (error) {
    console.error(
      "Bus dataset failed:",
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
