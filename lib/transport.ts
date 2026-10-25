import type {
  ScheduledStop,
  TransportSearchResult,
  TransportStop,
  TransportTrip,
} from "@/lib/types";

import { createSearchResult } from "@/lib/normalize";

type ApiStation = {
  station?: string;
  arrivalTime?: string | null;
  departureTime?: string | null;
};

type ApiTrip = {
  vehicle_number?: string;
  vehicleNumber?: string;
  trip?: string | number;
  stations?: ApiStation[];
};

const API_BASE = "https://busapi.amithv.xyz/api/v1";

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function makeStopId(name: string): string {
  return `private-${normalizeName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function convertTrip(
  apiTrip: ApiTrip,
  index: number
): TransportTrip | null {
  if (
    !Array.isArray(apiTrip.stations) ||
    apiTrip.stations.length === 0
  ) {
    return null;
  }

  const stops: ScheduledStop[] = apiTrip.stations
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
      (stop): stop is ScheduledStop => stop !== null
    );

  if (stops.length < 2) {
    return null;
  }

  return {
    id:
      apiTrip.vehicle_number ||
      apiTrip.vehicleNumber ||
      `private-trip-${index}`,

    vehicleNumber:
      apiTrip.vehicle_number ||
      apiTrip.vehicleNumber ||
      undefined,

    serviceName:
      apiTrip.trip !== undefined
        ? String(apiTrip.trip)
        : undefined,

    operator: "Private Bus",

    mode: "bus",

    source: "private-bus-api",

    stops,

    isLive: false,
  };
}

export async function searchBuses(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const departure = encodeURIComponent(from.trim());
  const destination = encodeURIComponent(to.trim());

  const url =
    `${API_BASE}/schedules` +
    `?departure=${departure}` +
    `&destination=${destination}` +
    `&restrict=true`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },

      next: {
        revalidate: 300,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Private bus API returned ${response.status}`
      );
    }

    const data = await response.json();

    const rawTrips: ApiTrip[] = Array.isArray(data)
      ? data
      : [];

    const trips = rawTrips
      .map(convertTrip)
      .filter(
        (trip): trip is TransportTrip => trip !== null
      );

    return createSearchResult(from, to, trips);
  } catch (error) {
    console.error("Private bus source failed:", error);

    return {
      from,
      to,
      directJourneys: [],
      connectingJourneys: [],
      searchedAt: new Date().toISOString(),
    };
  }
}
