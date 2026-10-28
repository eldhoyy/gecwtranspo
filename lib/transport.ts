import type {
  ScheduledStop,
  TransportSearchResult,
  TransportStop,
  TransportTrip,
} from "@/lib/types";

import {
  createSearchResult,
} from "./normalize";

import {
  getStopNameVariants,
  resolveStopName,
} from "./stops";

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

const MYBUSYATRA_BASE_URL =
  "https://www.mybusyatra.in";

/*
 * MyBusYatra uses "Thalappuzha"
 * with double p in its URL.
 */
const MYBUS_SLUG_OVERRIDES:
  Record<string, string> = {
    THALAPUZHA: "thalappuzha",
    MANANTHAVADY: "mananthavady",
    NALAM_MILE: "nalam-mile",
    "4TH MILE": "4th-mile",
    KALPETTA: "kalpetta",
    PANAMARAM: "panamaram",
    KAMBALAKKAD: "kambalakkad",
    PULPALLY: "pulpally",
    MEENANGADI: "meenangadi",
    SULTHAN_BATHERY: "sulthan-bathery",
    "SULTHAN BATHERY": "sulthan-bathery",
    VYTHIRI: "vythiri",
    THIRUNELLY: "thirunelly",
    THONDERNAD: "thondernad",
    KANNUR: "kannur",
    THALASSERY: "thalassery",
    KOZHIKODE: "kozhikode",
    CALICUT: "kozhikode",
    VADAKARA: "vadakara",
    MUKKAM: "mukkam",
    PERAMBRA: "perambra",
    NILAMBUR: "nilambur",
    MANJERI: "manjeri",
    MALAPPURAM: "malappuram",
    MUVATTUPUZHA: "muvattupuzha",
    PERUMBAVOOR: "perumbavoor",
    ALUVA: "aluva",
    ERNAKULAM: "ernakulam",
  };

/*
 * ----------------------------------------------------
 * BASIC HELPERS
 * ----------------------------------------------------
 */

function normalizeName(
  value: string
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "");
}

function makeStopId(
  name: string
): string {
  return `bus-${normalizeName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function stationMatches(
  stationName: string,
  requestedName: string
): boolean {
  const station =
    normalizeName(stationName);

  const variants =
    getStopNameVariants(
      requestedName
    );

  return variants.some(
    (variant) => {
      const requested =
        normalizeName(
          variant
        );

      return (
        station === requested ||
        station.includes(requested) ||
        requested.includes(station)
      );
    }
  );
}

/*
 * ----------------------------------------------------
 * CONVERT ORDERED STATIONS
 * ----------------------------------------------------
 */

function convertStations(
  stations:
    | ApiStation[]
    | undefined
): ScheduledStop[] {
  if (
    !Array.isArray(stations)
  ) {
    return [];
  }

  return stations
    .map(
      (
        station,
        sequence
      ) => {
        const name =
          station.station?.trim();

        if (!name) {
          return null;
        }

        const stop:
          TransportStop = {
          id:
            makeStopId(name),
          name,
        };

        return {
          stop,
          sequence,
          arrivalTime:
            station.arrivalTime ??
            null,
          departureTime:
            station.departureTime ??
            null,
        };
      }
    )
    .filter(
      (
        stop
      ): stop is ScheduledStop =>
        stop !== null
    );
}

/*
 * ----------------------------------------------------
 * PRIVATE BUS API CONVERSION
 * ----------------------------------------------------
 */

function convertApiTrip(
  trip: ApiTrip,
  index: number
): TransportTrip | null {
  const stops =
    convertStations(
      trip.stations
    );

  if (
    stops.length < 2
  ) {
    return null;
  }

  const vehicleNumber =
    trip.vehicle_number ??
    trip["Vehicle Number"] ??
    undefined;

  const tripNumber =
    trip.trip ?? index;

  return {
    id:
      `private-${vehicleNumber || "bus"}-${tripNumber}`
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        ),

    vehicleNumber,

    serviceName:
      trip.trip !== undefined
        ? `Trip ${trip.trip}`
        : undefined,

    operator:
      "Private Bus",

    mode:
      "bus",

    source:
      "private-bus-api",

    stops,

    isLive:
      false,
  };
}

/*
 * ----------------------------------------------------
 * WAYANAD DATASET CONVERSION
 * ----------------------------------------------------
 */

function convertDataset(
  data: Dataset
): TransportTrip[] {
  const buses =
    Array.isArray(
      data.busSchedules
    )
      ? data.busSchedules
      : [];

  const trips:
    TransportTrip[] = [];

  buses.forEach(
    (
      bus,
      busIndex
    ) => {
      const schedules =
        Array.isArray(
          bus.schedule
        )
          ? bus.schedule
          : [];

      schedules.forEach(
        (
          schedule,
          scheduleIndex
        ) => {
          const trip =
            convertApiTrip(
              {
                vehicle_number:
                  bus.vehicle_number,

                "Vehicle Number":
                  bus[
                    "Vehicle Number"
                  ],

                trip:
                  schedule.trip,

                stations:
                  schedule.stations,
              },

              busIndex * 1000 +
                scheduleIndex
            );

          if (trip) {
            trips.push(trip);
          }
        }
      );
    }
  );

  return trips;
}

/*
 * ----------------------------------------------------
 * FIND DIRECT TRIPS
 *
 * IMPORTANT:
 *
 * A trip can contain many stops.
 *
 * Example:
 *
 * MANANTHAVADY
 * PANAMARAM
 * KALPETTA
 * ADIVAARAM
 * THAMARASSERY
 * MUKKAM
 * AREEKODE
 * NILAMBUR
 *
 * Searching:
 *
 * PANAMARAM -> KALPETTA
 *
 * returns this same bus.
 *
 * We do NOT create a fake
 * PANAMARAM -> KALPETTA trip.
 * ----------------------------------------------------
 */

function findDirectTrips(
  trips: TransportTrip[],
  from: string,
  to: string
): TransportTrip[] {
  return trips.filter(
    (trip) => {
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
    }
  );
}

/*
 * ----------------------------------------------------
 * PRIVATE BUS API
 * ----------------------------------------------------
 */

async function fetchFromScheduleApi(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const url =
    `${SCHEDULE_API_URL}?departure=${encodeURIComponent(
      from
    )}&destination=${encodeURIComponent(
      to
    )}`;

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "application/json",
        },

        cache:
          "no-store",
      }
    );

  if (!response.ok) {
    throw new Error(
      `Schedule API returned ${response.status}`
    );
  }

  const data: unknown =
    await response.json();

  if (
    !Array.isArray(data)
  ) {
    throw new Error(
      "Schedule API returned invalid data."
    );
  }

  return data
    .map(
      (
        item,
        index
      ) =>
        convertApiTrip(
          item as ApiTrip,
          index
        )
    )
    .filter(
      (
        trip
      ): trip is TransportTrip =>
        trip !== null
    );
}

/*
 * ----------------------------------------------------
 * PRIVATE WAYANAD DATASET
 * ----------------------------------------------------
 */

async function fetchFromDataset():
  Promise<TransportTrip[]> {
  const response =
    await fetch(
      DATASET_URL,
      {
        headers: {
          Accept:
            "application/json",
        },

        next: {
          revalidate:
            3600,
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      `Bus dataset returned ${response.status}`
    );
  }

  const data:
    Dataset =
    await response.json();

  return convertDataset(
    data
  );
}

/*
 * ----------------------------------------------------
 * MYBUSYATRA
 * ----------------------------------------------------
 */

function myBusYatraSlug(
  value: string
): string {
  const normalized =
    resolveStopName(value)
      .toUpperCase();

  const override =
    MYBUS_SLUG_OVERRIDES[
      normalized
    ];

  if (override) {
    return override;
  }

  return normalized
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-|-$/g,
      ""
    );
}

/*
 * Decode the common HTML
 * entities used by MyBusYatra.
 */
function decodeHtml(
  value: string
): string {
  return value
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      "\""
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&lt;/gi,
      "<"
    );
}

/*
 * Convert HTML into readable
 * lines while preserving useful
 * block boundaries.
 */
function htmlToLines(
  html: string
): string[] {
  const text =
    decodeHtml(
      html
        .replace(
          /<script[\s\S]*?<\/script>/gi,
          "\n"
        )
        .replace(
          /<style[\s\S]*?<\/style>/gi,
          "\n"
        )
        .replace(
          /<noscript[\s\S]*?<\/noscript>/gi,
          "\n"
        )
        .replace(
          /<\/(div|p|li|article|section|header|footer|h1|h2|h3|h4|h5|h6|br|main|nav)>/gi,
          "\n"
        )
        .replace(
          /<[^>]+>/g,
          " "
        )
    );

  return text
    .replace(
      /\r/g,
      ""
    )
    .split("\n")
    .map(
      (line) =>
        line
          .replace(
            /\s+/g,
            " "
          )
          .trim()
    )
    .filter(Boolean);
}

/*
 * ----------------------------------------------------
 * MYBUSYATRA SERVICE LINKS
 *
 * The timetable page contains
 * links to individual services.
 *
 * Example:
 *
 * /bus/ksrtc-fast-passenger-...
 *
 * We collect those links and
 * open the actual service page.
 * ----------------------------------------------------
 */

function extractMyBusYatraDetailLinks(
  html: string
): string[] {
  const links:
    string[] = [];

  const regex =
    /href\s*=\s*["']([^"']+)["']/gi;

  let match:
    RegExpExecArray | null;

  while (
    (match =
      regex.exec(html))
  ) {
    const href =
      decodeHtml(
        match[1]
      );

    if (
      !href
        .toLowerCase()
        .includes("/bus/")
    ) {
      continue;
    }

    try {
      const url =
        new URL(
          href,
          MYBUSYATRA_BASE_URL
        );

      if (
        url.hostname !==
        new URL(
          MYBUSYATRA_BASE_URL
        ).hostname
      ) {
        continue;
      }

      /*
       * We use KSRTC detail pages
       * here because the existing
       * private-bus API and dataset
       * already provide private buses.
       */
      if (
        !url.pathname
          .toLowerCase()
          .startsWith(
            "/bus/ksrtc"
          )
      ) {
        continue;
      }

      links.push(
        url.toString()
      );
    } catch {
      continue;
    }
  }

  return [
    ...new Set(
      links
    ),
  ];
}

/*
 * ----------------------------------------------------
 * MYBUSYATRA ROUTE PARSER
 *
 * Reads the actual Route Schedule
 * from the individual bus page.
 *
 * Example from AX627:
 *
 * MANANTHAVADY 14:35
 * PANAMARAM 15:15
 * KALPETTA 15:55
 * ADIVAARAM 16:50
 * THAMARASSERY 17:10
 * MUKKAM 17:40
 * AREEKODE 18:05
 * NILAMBUR 18:40
 * ----------------------------------------------------
 */

function cleanRouteStation(
  value: string
): string | null {
  const station =
    value
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (!station) {
    return null;
  }

  if (
    /^(departure|arrival)$/i.test(
      station
    )
  ) {
    return null;
  }

  if (
    /^route schedule$/i.test(
      station
    )
  ) {
    return null;
  }

  if (
    /^timings are indicative/i.test(
      station
    )
  ) {
    return null;
  }

  return station;
}

function isTime(
  value: string
): boolean {
  return /^\d{1,2}:\d{2}$/.test(
    value.trim()
  );
}

function normalizeTime(
  value: string
): string {
  const match =
    value
      .trim()
      .match(
        /^(\d{1,2}):(\d{2})$/
      );

  if (!match) {
    return value.trim();
  }

  return `${match[1].padStart(
    2,
    "0"
  )}:${match[2]}`;
}

function extractMyBusYatraRoute(
  html: string
): ScheduledStop[] {
  const lines =
    htmlToLines(html);

  const routeStart =
    lines.findIndex(
      (line) =>
        /^route schedule$/i.test(
          line
        )
    );

  if (
    routeStart === -1
  ) {
    return [];
  }

  let routeEnd =
    lines.length;

  for (
    let i =
      routeStart + 1;
    i <
      lines.length;
    i += 1
  ) {
    if (
      /timings are indicative/i.test(
        lines[i]
      )
    ) {
      routeEnd = i;
      break;
    }

    if (
      /^fare$/i.test(
        lines[i]
      )
    ) {
      routeEnd = i;
      break;
    }
  }

  const routeLines =
    lines.slice(
      routeStart + 1,
      routeEnd
    );

  const stops:
    ScheduledStop[] = [];

  let pendingStation:
    string | null = null;

  for (
    let i = 0;
    i <
      routeLines.length;
    i += 1
  ) {
    const line =
      routeLines[i];

    /*
     * Case 1:
     *
     * MANANTHAVADY 14:35
     */
    const inline =
      line.match(
        /^(.+?)\s+(\d{1,2}:\d{2})$/
      );

    if (inline) {
      const station =
        cleanRouteStation(
          inline[1]
        );

      if (
        station &&
        isTime(
          inline[2]
        )
      ) {
        const time =
          normalizeTime(
            inline[2]
          );

        stops.push({
          stop: {
            id:
              makeStopId(
                station
              ),
            name:
              station,
          },

          sequence:
            stops.length,

          arrivalTime:
            time,

          departureTime:
            time,
        });

        pendingStation =
          null;

        continue;
      }
    }

    /*
     * Case 2:
     *
     * MANANTHAVADY
     * 14:35
     */
    if (
      isTime(line)
    ) {
      if (
        pendingStation
      ) {
        const time =
          normalizeTime(
            line
          );

        stops.push({
          stop: {
            id:
              makeStopId(
                pendingStation
              ),
            name:
              pendingStation,
          },

          sequence:
            stops.length,

          arrivalTime:
            time,

          departureTime:
            time,
        });

        pendingStation =
          null;
      }

      continue;
    }

    const station =
      cleanRouteStation(
        line
      );

    if (station) {
      pendingStation =
        station;
    }
  }

  /*
   * Remove accidental consecutive
   * duplicate stations.
   */
  const cleaned:
    ScheduledStop[] = [];

  for (
    const stop of stops
  ) {
    const previous =
      cleaned[
        cleaned.length - 1
      ];

    if (
      previous &&
      normalizeName(
        previous.stop.name
      ) ===
        normalizeName(
          stop.stop.name
        ) &&
      previous.departureTime ===
        stop.departureTime
    ) {
      continue;
    }

    cleaned.push({
      ...stop,

      sequence:
        cleaned.length,
    });
  }

  return cleaned;
}

/*
 * ----------------------------------------------------
 * MYBUSYATRA SERVICE DETAILS
 * ----------------------------------------------------
 */

function extractMyBusYatraService(
  html: string
): TransportTrip | null {
  const lines =
    htmlToLines(html);

  const text =
    lines.join(" ");

  /*
   * Vehicle number.
   *
   * Example:
   * Vehicle No: AX627
   */
  const vehicleMatch =
    text.match(
      /Vehicle\s*No:\s*([A-Z0-9 -]+)/i
    );

  const vehicleNumber =
    vehicleMatch?.[1]
      ?.trim()
      .replace(
        /\s+/g,
        " "
      );

  /*
   * Service title.
   *
   * Example:
   * KSRTC Fast Passenger
   */
  const titleMatch =
    html.match(
      /<h1[^>]*>([\s\S]*?)<\/h1>/i
    );

  const serviceName =
    titleMatch
      ? decodeHtml(
          titleMatch[1]
            .replace(
              /<[^>]+>/g,
              " "
            )
        )
          .replace(
            /\s+/g,
            " "
          )
          .trim()
      : "KSRTC Bus";

  const stops =
    extractMyBusYatraRoute(
      html
    );

  /*
   * A valid full service must
   * contain at least two stops.
   */
  if (
    stops.length < 2
  ) {
    return null;
  }

  const firstStop =
    stops[0]
      ?.stop.name;

  const lastStop =
    stops[
      stops.length - 1
    ]
      ?.stop.name;

  return {
    id:
      `mybusyatra-${vehicleNumber || serviceName}-${firstStop}-${lastStop}-${stops[0]?.departureTime || ""}`
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        ),

    vehicleNumber,

    serviceName,

    operator:
      "KSRTC",

    mode:
      "bus",

    source:
      "public-transport-api",

    stops,

    isLive:
      false,
  };
}

/*
 * ----------------------------------------------------
 * FETCH INDIVIDUAL MYBUSYATRA SERVICE
 * ----------------------------------------------------
 */

async function fetchMyBusYatraService(
  url: string
): Promise<TransportTrip | null> {
  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "text/html",
            "User-Agent":
              "GECW-Go/1.0",
          },

          next: {
            revalidate:
              900,
          },
        }
      );

    if (
      !response.ok
    ) {
      return null;
    }

    const html =
      await response.text();

    return extractMyBusYatraService(
      html
    );
  } catch {
    return null;
  }
}

/*
 * ----------------------------------------------------
 * FETCH MYBUSYATRA
 *
 * IMPORTANT:
 *
 * We no longer create:
 *
 * MANANTHAVADY
 *       ↓
 * PANAMARAM
 *
 * as a synthetic trip.
 *
 * We first find the real service
 * page and then read its complete
 * ordered route.
 * ----------------------------------------------------
 */

async function fetchFromMyBusYatra(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const fromSlug =
    myBusYatraSlug(
      from
    );

  const toSlug =
    myBusYatraSlug(
      to
    );

  const url =
    `${MYBUSYATRA_BASE_URL}/bus-timing-from-${fromSlug}-to-${toSlug}`;

  const response =
    await fetch(
      url,
      {
        headers: {
          Accept:
            "text/html",

          "User-Agent":
            "GECW-Go/1.0",
        },

        next: {
          revalidate:
            900,
        },
      }
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `MyBusYatra returned ${response.status}`
    );
  }

  const html =
    await response.text();

  /*
   * Get the individual service
   * pages from the timetable.
   */
  const detailLinks =
    extractMyBusYatraDetailLinks(
      html
    );

    if (
    detailLinks.length === 0
  ) {
    return [];
  }

  const trips: TransportTrip[] = [];

  for (const detailLink of detailLinks) {
    try {
      const trip = await fetchMyBusYatraService(
        detailLink,
        from,
        to
      );

      if (trip) {
        trips.push(trip);
      }
    } catch {
      // Ignore individual service-page failures.
      // Other services can still be used.
    }
  }

  return trips;
}

async function fetchMyBusYatraService(
  url: string,
  from: string,
  to: string
): Promise<TransportTrip | null> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();

  const service = extractMyBusYatraService(html);

  if (!service) {
    return null;
  }

  const route = extractMyBusYatraRoute(html);

  if (route.length < 2) {
    return null;
  }

  const fromVariants = getStopNameVariants(from);
  const toVariants = getStopNameVariants(to);

  const fromIndex = route.findIndex((stop) =>
    fromVariants.some(
      (variant) =>
        normalizeStopName(stop.name) ===
        normalizeStopName(variant)
    )
  );

  const toIndex = route.findIndex((stop) =>
    toVariants.some(
      (variant) =>
        normalizeStopName(stop.name) ===
        normalizeStopName(variant)
    )
  );

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= toIndex
  ) {
    return null;
  }

  const selectedRoute = route.slice(
    fromIndex,
    toIndex + 1
  );

  const firstStop = selectedRoute[0];
  const lastStop =
    selectedRoute[selectedRoute.length - 1];

  const departure =
    firstStop.departure ||
    firstStop.arrival ||
    "";

  const arrival =
    lastStop.arrival ||
    lastStop.departure ||
    "";

  return {
    id:
      service.vehicleNumber
        ? `mybus-${service.vehicleNumber}-${fromIndex}-${toIndex}`
        : `mybus-${service.serviceName}-${from}-${to}`,
    operator: "KSRTC",
    vehicleNumber:
      service.vehicleNumber || undefined,
    serviceName:
      service.serviceName || "KSRTC Service",
    routeName:
      service.routeName ||
      `${route[0].name} → ${
        route[route.length - 1].name
      }`,
    direction:
      service.direction || undefined,
    departure,
    arrival,
    stops: selectedRoute.map((stop, index) => ({
      name: stop.name,
      sequence: index,
      arrival: stop.arrival || undefined,
      departure: stop.departure || undefined,
    })),
  };
}

async function fetchFromMyBusYatra(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const slugFrom =
    MYBUS_SLUG_OVERRIDES[
      normalizeStopName(from)
    ] ||
    encodeURIComponent(
      from.trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
    );

  const slugTo =
    MYBUS_SLUG_OVERRIDES[
      normalizeStopName(to)
    ] ||
    encodeURIComponent(
      to.trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
    );

  const url = `${MYBUSYATRA_BASE_URL}/bus/${slugFrom}-to-${slugTo}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();

    /*
     * Get the individual service
     * pages from the timetable.
     */
    const detailLinks =
      extractMyBusYatraDetailLinks(html);

    if (
      detailLinks.length === 0
    ) {
      return [];
    }

    const trips: TransportTrip[] = [];

    for (const detailLink of detailLinks) {
      try {
        const trip =
          await fetchMyBusYatraService(
            detailLink,
            from,
            to
          );

        if (trip) {
          trips.push(trip);
        }
      } catch {
        // Ignore one failed service page.
      }
    }

    return trips;
  } catch {
    return [];
  }
}

function dedupeTrips(
  trips: TransportTrip[]
): TransportTrip[] {
  const seen = new Set<string>();

  return trips.filter((trip) => {
    const key = [
      trip.operator,
      trip.vehicleNumber || "",
      trip.serviceName || "",
      trip.departure || "",
      trip.arrival || "",
      trip.stops
        .map((stop) => stop.name)
        .join("|"),
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export async function searchTransport(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const fromStop = resolveStopName(from);
  const toStop = resolveStopName(to);

  if (!fromStop || !toStop) {
    return createSearchResult(
      from,
      to,
      [],
      [],
      new Date().toISOString()
    );
  }

  const [
    apiTrips,
    datasetTrips,
    myBusTrips,
  ] = await Promise.all([
    fetchFromScheduleApi(
      fromStop,
      toStop
    ),
    fetchFromDataset(
      fromStop,
      toStop
    ),
    fetchFromMyBusYatra(
      fromStop,
      toStop
    ),
  ]);

  const allTrips = dedupeTrips([
    ...apiTrips,
    ...datasetTrips,
    ...myBusTrips,
  ]);

  /*
   * Important:
   *
   * Every trip contains its complete ordered
   * route. Therefore a bus is returned only when
   * the searched origin occurs BEFORE the searched
   * destination on that same bus route.
   *
   * This prevents creating fake dedicated trips
   * such as:
   *
   * MANANTHAVADY → NALAM MILE
   *
   * when the actual bus is:
   *
   * MANANTHAVADY
   *   ↓
   * NALAM MILE
   *   ↓
   * PANAMARAM
   *   ↓
   * KAMBALAKKAD
   *   ↓
   * KALPETTA
   */
  const directTrips = allTrips.filter(
    (trip) =>
      findDirectTripSegment(
        trip,
        fromStop,
        toStop
      ) !== null
  );

  return createSearchResult(
    fromStop,
    toStop,
    directTrips,
    [],
    new Date().toISOString()
  );
}

function findDirectTripSegment(
  trip: TransportTrip,
  from: string,
  to: string
) {
  const fromVariants =
    getStopNameVariants(from).map(
      normalizeStopName
    );

  const toVariants =
    getStopNameVariants(to).map(
      normalizeStopName
    );

  const fromIndex = trip.stops.findIndex(
    (stop) =>
      fromVariants.includes(
        normalizeStopName(stop.name)
      )
  );

  const toIndex = trip.stops.findIndex(
    (stop) =>
      toVariants.includes(
        normalizeStopName(stop.name)
      )
  );

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= toIndex
  ) {
    return null;
  }

  return {
    fromIndex,
    toIndex,
    stops: trip.stops.slice(
      fromIndex,
      toIndex + 1
    ),
  };
    }
