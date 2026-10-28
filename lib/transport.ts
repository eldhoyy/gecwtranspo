import type {
  ScheduledStop,
  TransportSearchResult,
  TransportStop,
  TransportTrip,
} from "@/lib/types";

import { createSearchResult } from "./normalize";
import {
  getStopNameVariants,
  resolveStopName,
} from "./stops";

/* =========================================================
   TYPES
   ========================================================= */

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

type MyBusYatraRouteStop = {
  name: string;
  arrival?: string;
  departure?: string;
};

type MyBusYatraService = {
  serviceName: string;
  vehicleNumber?: string;
  routeName?: string;
  direction?: string;
};

/* =========================================================
   SOURCES
   ========================================================= */

const SCHEDULE_API_URL =
  "https://busapi.amithv.xyz/api/v1/schedules";

const FULL_ROUTE_API_URL =
  "https://busapi.amithv.xyz/api/v1/search";

const DATASET_URL =
  "https://raw.githubusercontent.com/amith-vp/Kerala-Private-Bus-Timing/main/wayanad.json";

const MYBUSYATRA_BASE_URL =
  "https://www.mybusyatra.in";

/* =========================================================
   MYBUSYATRA SLUGS
   ========================================================= */

const MYBUS_SLUG_OVERRIDES: Record<string, string> = {
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
  KALIKAVU: "kalikavu",
  NILAMBUR: "nilambur",
  MANJERI: "manjeri",
  MALAPPURAM: "malappuram",
  MUVATTUPUZHA: "muvattupuzha",
  PERUMBAVOOR: "perumbavoor",
  ALUVA: "aluva",
  ERNAKULAM: "ernakulam",
};

/* =========================================================
   BASIC HELPERS
   ========================================================= */

function normalizeName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,/()\-–—]+/g, " ")
    .replace(/\s+/g, " ");
}

function makeStopId(name: string): string {
  return `bus-${normalizeName(name)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function stationMatches(
  stationName: string,
  requestedName: string
): boolean {
  const station = normalizeName(stationName);

  const variants = getStopNameVariants(
    requestedName
  );

  return variants.some((variant) => {
    const requested = normalizeName(variant);

    return (
      station === requested ||
      station.includes(requested) ||
      requested.includes(station)
    );
  });
}

function timeToMinutes(
  value?: string | null
): number | null {
  if (!value) return null;

  const text = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

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

  const twelveHour =
    text.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/
    );

  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = Number(
      twelveHour[2] ?? "0"
    );

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

/* =========================================================
   STATION CONVERSION
   ========================================================= */

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
        arrivalTime:
          station.arrivalTime ?? null,
        departureTime:
          station.departureTime ?? null,
      };
    })
    .filter(
      (stop): stop is ScheduledStop =>
        stop !== null
    );
}

/* =========================================================
   CREATE PRIVATE BUS TRIP
   ========================================================= */

function convertApiTrip(
  trip: ApiTrip,
  index: number
): TransportTrip | null {
  const stops = convertStations(
    trip.stations
  );

  if (stops.length < 2) {
    return null;
  }

  const vehicleNumber =
    trip.vehicle_number?.trim() ||
    trip["Vehicle Number"]?.trim() ||
    undefined;

  const tripNumber =
    trip.trip ?? index;

  return {
    id:
      `private-${vehicleNumber || "bus"}-${tripNumber}`
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

/* =========================================================
   WAYANAD DATASET
   =========================================================

   IMPORTANT:

   The upstream dataset structure is:

   {
     busSchedules: [
       {
         "Vehicle Number": "...",
         route: [...],
         schedule: [
           {
             trip: 1,
             stations: [...]
           }
         ]
       }
     ]
   }

   We preserve the REAL ordered stations.

   We never manufacture a searched FROM -> TO route.
   ========================================================= */

function convertDataset(
  data: Dataset
): TransportTrip[] {
  if (
    !data ||
    !Array.isArray(data.busSchedules)
  ) {
    return [];
  }

  const trips: TransportTrip[] = [];

  data.busSchedules.forEach(
    (bus, busIndex) => {
      const schedules =
        Array.isArray(bus.schedule)
          ? bus.schedule
          : [];

      schedules.forEach(
        (schedule, scheduleIndex) => {
          const stations =
            Array.isArray(
              schedule.stations
            )
              ? schedule.stations
              : [];

          /*
           * Prefer the actual scheduled stations.
           */
          if (stations.length >= 2) {
            const trip =
              convertApiTrip(
                {
                  vehicle_number:
                    bus.vehicle_number,
                  "Vehicle Number":
                    bus["Vehicle Number"],
                  trip: schedule.trip,
                  stations,
                },
                busIndex * 10000 +
                  scheduleIndex
              );

            if (trip) {
              trips.push(trip);
            }

            return;
          }

          /*
           * IMPORTANT:
           *
           * If there are no scheduled station
           * timings, we may use the published
           * route itself.
           *
           * This is still a genuine route from
           * the source. We do NOT invent stops.
           *
           * Times remain null.
           */
          if (
            Array.isArray(bus.route) &&
            bus.route.length >= 2
          ) {
            const routeStops: ScheduledStop[] =
              bus.route
                .map(
                  (name, sequence) => {
                    if (
                      typeof name !==
                        "string" ||
                      !name.trim()
                    ) {
                      return null;
                    }

                    return {
                      stop: {
                        id:
                          makeStopId(name),
                        name: name.trim(),
                      },
                      sequence,
                      arrivalTime: null,
                      departureTime: null,
                    };
                  }
                )
                .filter(
                  (
                    stop
                  ): stop is ScheduledStop =>
                    stop !== null
                );

            if (
              routeStops.length >= 2
            ) {
              trips.push({
                id:
                  `private-route-${bus["Vehicle Number"] || bus.vehicle_number || busIndex}-${schedule.trip ?? scheduleIndex}`
                    .toLowerCase()
                    .replace(
                      /[^a-z0-9]+/g,
                      "-"
                    ),

                vehicleNumber:
                  bus["Vehicle Number"] ||
                  bus.vehicle_number ||
                  undefined,

                serviceName:
                  schedule.trip !==
                  undefined
                    ? `Trip ${schedule.trip}`
                    : undefined,

                operator:
                  "Private Bus",

                mode: "bus",

                source:
                  "private-bus-api",

                stops: routeStops,

                isLive: false,
              });
            }
          }
        }
      );
    }
  );

  return trips;
}

/* =========================================================
   DIRECT ROUTE MATCHING
   =========================================================

   THIS IS THE MOST IMPORTANT PART.

   A bus is returned only when BOTH requested
   stops actually exist in its real ordered route.

   Example:

   REAL SOURCE ROUTE:

   MANANTHAVADY
   NALAM MILE
   PANAMARAM
   KAMBALAKKAD
   KALPETTA

   Search:

   MANANTHAVADY -> NALAM MILE

   Result:
   SAME REAL BUS.

   Search:

   NALAM MILE -> PANAMARAM

   Result:
   SAME REAL BUS.

   Search:

   KALPETTA -> MANANTHAVADY

   Result:
   NOT returned, because the order is wrong.

   No fake trips are created.
   ========================================================= */

function findDirectTrips(
  trips: TransportTrip[],
  from: string,
  to: string
): TransportTrip[] {
  return trips.filter((trip) => {
    if (
      !Array.isArray(trip.stops) ||
      trip.stops.length < 2
    ) {
      return false;
    }

    const fromIndex =
      trip.stops.findIndex((stop) =>
        stationMatches(
          stop.stop.name,
          from
        )
      );

    const toIndex =
      trip.stops.findIndex((stop) =>
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

/* =========================================================
   PRIVATE BUS SCHEDULE API
   ========================================================= */

async function fetchFromScheduleApi(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const url =
    `${SCHEDULE_API_URL}?departure=${encodeURIComponent(
      from
    )}&destination=${encodeURIComponent(
      to
    )}&restrict=false`;

  try {
    const response =
      await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

    if (!response.ok) {
      console.warn(
        "Schedule API status:",
        response.status
      );

      return [];
    }

    const data: unknown =
      await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((item, index) =>
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
  } catch (error) {
    console.warn(
      "Private bus schedule API failed:",
      error
    );

    return [];
  }
}

/* =========================================================
   FULL ROUTE API
   =========================================================

   The upstream API officially supports:

   /api/v1/search?vehicle_number=...

   which returns the bus's complete route.

   We use this only for genuine vehicle numbers
   already obtained from a genuine API result.

   We NEVER manufacture a vehicle number.
   ========================================================= */

async function fetchFullRouteForVehicle(
  vehicleNumber: string
): Promise<TransportTrip[]> {
  if (!vehicleNumber.trim()) {
    return [];
  }

  const url =
    `${FULL_ROUTE_API_URL}?vehicle_number=${encodeURIComponent(
      vehicleNumber
    )}`;

  try {
    const response =
      await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

    if (!response.ok) {
      return [];
    }

    const data: unknown =
      await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((item, index) => {
        const route =
          item as ApiTrip;

        return convertApiTrip(
          {
            vehicle_number:
              vehicleNumber,
            "Vehicle Number":
              vehicleNumber,
            trip: route.trip,
            stations:
              route.stations,
          },
          index
        );
      })
      .filter(
        (
          trip
        ): trip is TransportTrip =>
          trip !== null
      );
  } catch (error) {
    console.warn(
      "Full route lookup failed:",
      error
    );

    return [];
  }
}

/* =========================================================
   DATASET FETCH
   ========================================================= */

async function fetchFromDataset(): Promise<
  TransportTrip[]
> {
  try {
    const response =
      await fetch(DATASET_URL, {
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

    if (!response.ok) {
      console.warn(
        "Wayanad dataset status:",
        response.status
      );

      return [];
    }

    const data: Dataset =
      await response.json();

    return convertDataset(data);
  } catch (error) {
    console.warn(
      "Wayanad dataset failed:",
      error
    );

    return [];
  }
}

/* =========================================================
   HTML HELPERS
   ========================================================= */

function decodeHtml(
  value: string
): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&gt;/gi, ">")
    .replace(/&lt;/gi, "<");
}

function htmlToText(
  html: string
): string {
  return decodeHtml(
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
        /<\/(div|p|li|article|section|header|footer|h1|h2|h3|h4|h5|h6|br|main|nav|tr|td)>/gi,
        "\n"
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(
      /\n\s*\n+/g,
      "\n"
    )
    .trim();
}

function htmlToLines(
  html: string
): string[] {
  return htmlToText(html)
    .split("\n")
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
}

/* =========================================================
   MYBUSYATRA URL HELPERS
   ========================================================= */

function myBusYatraSlug(
  value: string
): string {
  const resolved =
    resolveStopName(value);

  const normalized =
    resolved.toUpperCase();

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

function myBusYatraTimetableUrl(
  from: string,
  to: string
): string {
  return (
    `${MYBUSYATRA_BASE_URL}/bus-timing-from-` +
    `${myBusYatraSlug(from)}-to-` +
    `${myBusYatraSlug(to)}`
  );
}

/* =========================================================
   MYBUSYATRA DETAIL LINKS
   ========================================================= */

function extractMyBusYatraDetailLinks(
  html: string
): string[] {
  const links =
    new Set<string>();

  const regex =
    /href\s*=\s*["']([^"']+)["']/gi;

  let match:
    RegExpExecArray | null;

  while (
    (match = regex.exec(html))
  ) {
    const href =
      decodeHtml(match[1]);

    if (!href) {
      continue;
    }

    try {
      const url =
        new URL(
          href,
          MYBUSYATRA_BASE_URL
        );

      const base =
        new URL(
          MYBUSYATRA_BASE_URL
        );

      if (
        url.hostname !==
        base.hostname
      ) {
        continue;
      }

      if (
        !url.pathname
          .toLowerCase()
          .startsWith("/bus/")
      ) {
        continue;
      }

      url.hash = "";

      links.add(
        url.toString()
      );
    } catch {
      // Ignore malformed URLs.
    }
  }

  return Array.from(links);
}

/* =========================================================
   MYBUSYATRA ROUTE PARSER
   =========================================================

   IMPORTANT:

   This parser is used ONLY on an actual service
   detail page.

   It does NOT create FROM -> TO fake trips.

   It attempts to recover the real ordered route
   printed on the service page.
   ========================================================= */

function extractMyBusYatraRoute(
  html: string
): MyBusYatraRouteStop[] {
  const lines =
    htmlToLines(html);

  const route:
    MyBusYatraRouteStop[] = [];

  const timeRegex =
    /\b(\d{1,2}:\d{2})(?:\s*(am|pm))?\b/i;

  const ignored = new Set([
    "bus timetable",
    "bus timing",
    "departure",
    "arrival",
    "duration",
    "next bus",
    "first departure",
    "last bus",
    "frequency",
  ]);

  function cleanStation(
    value: string
  ): string {
    return value
      .replace(
        /\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b/gi,
        " "
      )
      .replace(
        /[|•·]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();
  }

  function addStop(
    name: string,
    time?: string
  ): void {
    const cleaned =
      cleanStation(name);

    if (
      !cleaned ||
      cleaned.length < 2
    ) {
      return;
    }

    if (
      ignored.has(
        cleaned.toLowerCase()
      )
    ) {
      return;
    }

    if (
      /^(to|from|via|continues|bus|service|route)$/i.test(
        cleaned
      )
    ) {
      return;
    }

    /*
     * Do not accept huge pieces of page text
     * as a stop.
     */
    if (cleaned.length > 80) {
      return;
    }

    const existingIndex =
      route.findIndex(
        (item) =>
          normalizeName(
            item.name
          ) ===
          normalizeName(
            cleaned
          )
      );

    if ( existingIndex >= 0
    ) {
      return;
    }

    route.push({
      name: cleaned,
      time,
    });
  });

  return route;
}

function parseMyBusYatraRoute(
  html: string
): ScheduledStop[] {
  const route: ScheduledStop[] = [];

  const text = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|tr|td|th|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );

  const lines = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);

  const timePattern =
    /\b([01]?\d|2[0-3]):[0-5]\d\s*(?:am|pm)?\b/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const timeMatch =
      line.match(timePattern);

    if (!timeMatch) continue;

    const time = timeMatch[0];

    const stationPart = line
      .replace(time, " ")
      .replace(/\s+/g, " ")
      .trim();

    let stationName = stationPart;

    if (!stationName && lines[i + 1]) {
      stationName = lines[i + 1]
        .replace(timePattern, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    if (!stationName) continue;

    const cleaned =
      normalizeName(stationName);

    if (
      !cleaned ||
      cleaned.length < 2 ||
      cleaned.length > 80
    ) {
      continue;
    }

    if (
      /^(arrival|departure|time|schedule|route|station)$/i.test(
        cleaned
      )
    ) {
      continue;
    }

    const existingIndex =
      route.findIndex(
        (item) =>
          normalizeName(
            item.stop.name
          ) ===
          normalizeName(
            cleaned
          )
      );

    if (
      existingIndex >= 0
    ) {
      continue;
    }

    route.push({
      stop: {
        id:
          `mybusyatra-stop-${route.length}-${slugify(cleaned)}`,
        name: cleaned,
      },
      sequence: route.length,
      arrivalTime: time,
      departureTime: time,
    });
  }

  return route;
}

function findDirectTrips(
  trips: TransportTrip[],
  from: string,
  to: string
): Journey[] {
  const fromName =
    normalizeName(
      resolveStopName(from)
    );

  const toName =
    normalizeName(
      resolveStopName(to)
    );

  if (
    !fromName ||
    !toName ||
    fromName === toName
  ) {
    return [];
  }

  const journeys: Journey[] = [];

  for (const trip of trips) {
    if (
      trip.mode !== "bus" ||
      !trip.stops?.length
    ) {
      continue;
    }

    const fromIndex =
      trip.stops.findIndex(
        (item) =>
          normalizeName(
            item.stop.name
          ) === fromName
      );

    const toIndex =
      trip.stops.findIndex(
        (item) =>
          normalizeName(
            item.stop.name
          ) === toName
      );

    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= toIndex
    ) {
      continue;
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

    journeys.push({
      segments: [
        {
          trip,
          from: fromStop,
          to: toStop,
        },
      ],
      transfers: 0,
      departureTime,
      arrivalTime,
      isLive: trip.isLive,
      isPast: false,
    });
  }

  return journeys;
}

function dedupeTrips(
  trips: TransportTrip[]
): TransportTrip[] {
  const seen =
    new Set<string>();

  const result: TransportTrip[] = [];

  for (const trip of trips) {
    const routeKey =
      trip.stops
        .map(
          (stop) =>
            normalizeName(
              stop.stop.name
            )
        )
        .join("|");

    const key = [
      trip.operator ?? "",
      trip.vehicleNumber ?? "",
      trip.serviceName ?? "",
      routeKey,
    ].join("::");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trip);
  }

  return result;
}

async function fetchFromScheduleApi(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  try {
    const fromName =
      resolveStopName(from);

    const toName =
      resolveStopName(to);

    const params =
      new URLSearchParams({
        from: fromName,
        to: toName,
        restrict: "false",
      });

    const response =
      await fetch(
        `${SCHEDULE_API_URL}?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

    if (!response.ok) {
      return [];
    }

    const data =
      await response.json();

    const rawTrips =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.schedules)
            ? data.schedules
            : [];

    return rawTrips
      .map(
        (
          item: any,
          index: number
        ) =>
          convertApiTrip(
            item,
            `schedule-api-${index}`
          )
      )
      .filter(
        (
          trip: TransportTrip | null
        ): trip is TransportTrip =>
          trip !== null
      );
  } catch {
    return [];
  }
}

async function fetchDataset(): Promise<TransportTrip[]> {
  try {
    const response =
      await fetch(
        DATASET_URL,
        {
          cache: "no-store",
        }
      );

    if (!response.ok) {
      return [];
    }

    const data =
      await response.json();

    return convertDataset(data);
  } catch {
    return [];
  }
}

async function fetchFullRouteForVehicle(
  vehicleNumber: string
): Promise<ScheduledStop[]> {
  try {
    const params =
      new URLSearchParams({
        vehicle_number:
          vehicleNumber,
      });

    const response =
      await fetch(
        `${FULL_ROUTE_API_URL}?${params.toString()}`,
        {
          cache: "no-store",
        }
      );

    if (!response.ok) {
      return [];
    }

    const data =
      await response.json();

    const rawTrips =
      Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.schedules)
            ? data.schedules
            : [];

    for (
      const item of rawTrips
    ) {
      const stations =
        item?.stations ??
        item?.route ??
        item?.stops;

      if (
        !Array.isArray(stations) ||
        stations.length < 2
      ) {
        continue;
      }

      const converted =
        convertStations(
          stations
        );

      if (
        converted.length >= 2
      ) {
        return converted;
      }
    }

    return [];
  } catch {
    return [];
  }
}

async function enrichWithFullRoutes(
  trips: TransportTrip[]
): Promise<TransportTrip[]> {
  const result: TransportTrip[] = [];

  for (
    const trip of trips
  ) {
    if (
      !trip.vehicleNumber ||
      trip.stops.length >= 3
    ) {
      result.push(trip);
      continue;
    }

    const fullRoute =
      await fetchFullRouteForVehicle(
        trip.vehicleNumber
      );

    if (
      fullRoute.length >= 2
    ) {
      result.push({
        ...trip,
        stops: fullRoute,
      });
    } else {
      result.push(trip);
    }
  }

  return result;
}

function extractMyBusYatraDetailLinks(
  html: string
): string[] {
  const links =
    new Set<string>();

  const regex =
    /href\s*=\s*["']([^"']+)["']/gi;

  let match:
    RegExpExecArray | null;

  while (
    (match = regex.exec(html))
  ) {
    const href =
      match[1];

    if (!href) continue;

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

      if (
        !url.pathname
          .toLowerCase()
          .includes("/bus/")
      ) {
        continue;
      }

      links.add(
        url.toString()
      );
    } catch {
      continue;
    }
  }

  return Array.from(links);
}

async function fetchMyBusYatraDetail(
  url: string
): Promise<TransportTrip | null> {
  try {
    const response =
      await fetch(
        url,
        {
          cache: "no-store",
        }
      );

    if (!response.ok) {
      return null;
    }

    const html =
      await response.text();

    const route =
      parseMyBusYatraRoute(
        html
      );

    if (
      route.length < 2
    ) {
      return null;
    }

    const vehicleMatch =
      html.match(
        /vehicle\s*(?:no|number)?\s*[:\-]?\s*([A-Z0-9 -]{4,20})/i
      );

    const vehicleNumber =
      vehicleMatch?.[1]
        ?.trim();

    const titleMatch =
      html.match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      );

    const serviceName =
      titleMatch?.[1]
        ? decodeHtml(
            titleMatch[1]
          )
            .replace(
              /\s+/g,
              " "
            )
            .trim()
        : undefined;

    return {
      id:
        `mybusyatra-${slugify(
          vehicleNumber ??
            serviceName ??
            url
        )}`,
      vehicleNumber,
      serviceName,
      operator:
        serviceName
          ?.toLowerCase()
          .includes("ksrtc")
          ? "KSRTC"
          : "Private Bus",
      mode: "bus",
      source:
        "private-bus-api",
      stops: route,
      isLive: false,
    };
  } catch {
    return null;
  }
}

async function fetchFromMyBusYatra(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  try {
    const fromSlug =
      myBusYatraSlug(from);

    const toSlug =
      myBusYatraSlug(to);

    if (
      !fromSlug ||
      !toSlug
    ) {
      return [];
    }

    const timetableUrl =
      `${MYBUSYATRA_BASE_URL}/bus-timings/${fromSlug}-to-${toSlug}`;

    const response =
      await fetch(
        timetableUrl,
        {
          cache: "no-store",
        }
      );

    if (!response.ok) {
      return [];
    }

    const html =
      await response.text();

    const links =
      extractMyBusYatraDetailLinks(
        html
      );

    const trips: TransportTrip[] =
      [];

    for (
      const link of links
    ) {
      const trip =
        await fetchMyBusYatraDetail(
          link
        );

      if (!trip) {
        continue;
      }

      const matches =
        findDirectTrips(
          [trip],
          from,
          to
        );

      if (
        matches.length > 0
      ) {
        trips.push(trip);
      }
    }

    return trips;
  } catch {
    return [];
  }
}

export async function searchTransport(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const [
    datasetTrips,
    apiTrips,
    myBusTrips,
  ] =
    await Promise.all([
      fetchDataset(),
      fetchFromScheduleApi(
        from,
        to
      ),
      fetchFromMyBusYatra(
        from,
        to
      ),
    ]);

  let trips =
    dedupeTrips([
      ...datasetTrips,
      ...apiTrips,
      ...myBusTrips,
    ]);

  trips =
    await enrichWithFullRoutes(
      trips
    );

  const directJourneys =
    findDirectTrips(
      trips,
      from,
      to
    );

  return {
    from:
      resolveStopName(from),
    to:
      resolveStopName(to),
    directJourneys,
    connectingJourneys: [],
    searchedAt:
      new Date().toISOString(),
  };
}

export async function searchBuses(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  return searchTransport(
    from,
    to
  );
        }
     
