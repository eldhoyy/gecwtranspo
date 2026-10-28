import type {
  ScheduledStop,
  TransportTrip,
} from "../types";

const KSRTC_BASE_URL =
  "https://www.ksrtcedp.com";

type KsrtcStop = {
  place: string;
  arrivalTime: string | null;
  departureTime: string | null;
};

type KsrtcService = {
  id: string;
  serviceName: string;
  busType: string;
  origin: string;
  destination: string;
  route: KsrtcStop[];
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[().,'’`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesStop(
  actual: string,
  searched: string
): boolean {
  const a = normalize(actual);
  const b = normalize(searched);

  return (
    a === b ||
    a.includes(b) ||
    b.includes(a)
  );
}

function stopIndex(
  route: KsrtcStop[],
  name: string
): number {
  return route.findIndex((stop) =>
    matchesStop(stop.place, name)
  );
}

function createStops(
  route: KsrtcStop[]
): ScheduledStop[] {
  return route.map((stop, index) => ({
    stop: {
      id: `ksrtc-${normalize(stop.place)
        .replace(/\s+/g, "-")}`,
      name: stop.place,
      placeName: stop.place,
    },
    sequence: index,
    arrivalTime: stop.arrivalTime,
    departureTime: stop.departureTime,
  }));
}

/*
 * IMPORTANT:
 * These are real route structures from KSRTC schedule data.
 *
 * Add more services here as they are verified from
 * the official KSRTC schedule source.
 */
const KSRTC_SERVICES: KsrtcService[] = [
  {
    id: "ksrtc-mananthavady-trivandrum-1625",
    serviceName: "MANANTHAVADY - TRIVANDRUM",
    busType: "SEXP",
    origin: "MANANTHAVADY",
    destination: "TRIVANDRUM",

    route: [
      {
        place: "MANANTHAVADY",
        arrivalTime: null,
        departureTime: "16:25",
      },
      {
        place: "PANAMARAM",
        arrivalTime: "16:55",
        departureTime: "16:55",
      },
      {
        place: "KALPETTA",
        arrivalTime: "17:10",
        departureTime: "17:10",
      },
      {
        place: "VYTHIRI",
        arrivalTime: "17:45",
        departureTime: "17:45",
      },
      {
        place: "ADIVARAM",
        arrivalTime: "18:15",
        departureTime: "18:15",
      },
      {
        place: "THAMARASSERY",
        arrivalTime: "18:35",
        departureTime: "18:35",
      },
      {
        place: "KOZHIKKODE",
        arrivalTime: "19:15",
        departureTime: "19:30",
      },
      {
        place: "UNIVERSITY KKD",
        arrivalTime: "20:20",
        departureTime: "20:20",
      },
      {
        place: "KAKKAD",
        arrivalTime: "20:30",
        departureTime: "20:30",
      },
      {
        place: "KOTTAKKAL",
        arrivalTime: "21:00",
        departureTime: "21:00",
      },
      {
        place: "KUTTIPPURAM",
        arrivalTime: "21:30",
        departureTime: "21:30",
      },
      {
        place: "EDAPAL JN",
        arrivalTime: "21:45",
        departureTime: "21:45",
      },
      {
        place: "KUNNAMKULAM",
        arrivalTime: "22:10",
        departureTime: "22:10",
      },
      {
        place: "THRISSUR",
        arrivalTime: "22:40",
        departureTime: "23:10",
      },
      {
        place: "CHALAKKUDI",
        arrivalTime: "23:45",
        departureTime: "23:45",
      },
      {
        place: "PERUMBAVOOR",
        arrivalTime: "00:30",
        departureTime: "00:30",
      },
      {
        place: "MUVATTUPUZHA",
        arrivalTime: "01:00",
        departureTime: "01:15",
      },
      {
        place: "KOOTHATTUKULAM",
        arrivalTime: "01:40",
        departureTime: "01:40",
      },
      {
        place: "ETTUMANOOR",
        arrivalTime: "02:15",
        departureTime: "02:15",
      },
      {
        place: "KOTTAYAM",
        arrivalTime: "02:30",
        departureTime: "02:30",
      },
      {
        place: "CHANGANASSERY",
        arrivalTime: "02:50",
        departureTime: "02:50",
      },
      {
        place: "THIRUVALLA",
        arrivalTime: "03:05",
        departureTime: "03:05",
      },
      {
        place: "CHENGANNUR",
        arrivalTime: "03:20",
        departureTime: "03:20",
      },
      {
        place: "PANDALAM",
        arrivalTime: "03:40",
        departureTime: "03:40",
      },
      {
        place: "ADOOR",
        arrivalTime: "04:05",
        departureTime: "04:05",
      },
      {
        place: "KOTTARAKKARA",
        arrivalTime: "04:20",
        departureTime: "05:00",
      },
      {
        place: "VALAKOM",
        arrivalTime: "05:30",
        departureTime: "05:30",
      },
      {
        place: "KILIMANOOR",
        arrivalTime: "06:00",
        departureTime: "06:00",
      },
      {
        place: "TRIVANDRUM",
        arrivalTime: "06:45",
        departureTime: null,
      },
    ],
  },
];

function toTransportTrip(
  service: KsrtcService
): TransportTrip {
  return {
    id: service.id,
    vehicleNumber: undefined,
    serviceName: service.serviceName,
    operator: "KSRTC",
    mode: "bus",
    source: "ksrtc",
    stops: createStops(service.route),
    isLive: false,
  };
}

export function getKsrtcTrips(
  from: string,
  to: string
): TransportTrip[] {
  return KSRTC_SERVICES
    .filter((service) => {
      const fromIndex = stopIndex(
        service.route,
        from
      );

      const toIndex = stopIndex(
        service.route,
        to
      );

      return (
        fromIndex >= 0 &&
        toIndex >= 0 &&
        fromIndex < toIndex
      );
    })
    .map(toTransportTrip);
}

/*
 * Useful for debugging / future database ingestion.
 */
export function getAllKsrtcTrips(): TransportTrip[] {
  return KSRTC_SERVICES.map(toTransportTrip);
}
