export type BusStop = {
  station: string;
  arrivalTime: string | null;
  departureTime: string | null;
};

export type BusTrip = {
  vehicleNumber: string;
  trip: string;
  stations: BusStop[];
};

const API_BASE =
  "https://busapi.amithv.xyz/api/v1";

function normalize(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function stationMatches(station: string, search: string) {
  const a = normalize(station);
  const b = normalize(search);

  return a === b || a.includes(b) || b.includes(a);
}

export async function searchBuses(
  from: string,
  to: string
): Promise<BusTrip[]> {
  const url =
    `${API_BASE}/schedules?departure=${encodeURIComponent(from)}` +
    `&destination=${encodeURIComponent(to)}`;

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
      throw new Error(`Transport API returned ${response.status}`);
    }

    const data = await response.json();

    const trips: BusTrip[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.schedules)
          ? data.schedules
          : [];

    return trips.filter((trip) => {
      if (!Array.isArray(trip?.stations)) {
        return false;
      }

      const fromIndex = trip.stations.findIndex((stop: BusStop) =>
        stationMatches(stop.station, from)
      );

      const toIndex = trip.stations.findIndex((stop: BusStop) =>
        stationMatches(stop.station, to)
      );

      return fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex;
    });
  } catch (error) {
    console.error("Bus search failed:", error);
    return [];
  }
}
