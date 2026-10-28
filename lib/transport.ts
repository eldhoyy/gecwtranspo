import type {
  ScheduledStop,
  TransportSearchResult,
  TransportStop,
  TransportTrip,
  Journey,
} from "@/lib/types";

import {
  getStopNameVariants,
  resolveStopName,
} from "./stops";
import { getKsrtcTrips } from "./sources/ksrtc";
/* =========================================================
   SOURCE TYPES
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

type DatasetBus = {
  "Vehicle Number"?: string;
  vehicle_number?: string;
  route?: string[];
  schedule?: {
    trip?: string | number;
    stations?: ApiStation[];
  }[];
};

type Dataset = {
  busSchedules?: DatasetBus[];
};

/* =========================================================
   SOURCE URLS
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
   MYBUSYATRA STOP SLUGS
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

function slugify(value: string): string {
  return normalizeName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeStopId(name: string): string {
  return `bus-${slugify(name)}`;
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
    const requested =
      normalizeName(variant);

    return (
      station === requested ||
      station.includes(requested) ||
      requested.includes(station)
    );
  });
}

/* =========================================================
   TIME HELPERS
   ========================================================= */

function timeToMinutes(
  value?: string | null
): number | null {
  if (!value) {
    return null;
  }

  const text = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

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

  const twelveHour =
    text.match(
      /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/
    );

  if (!twelveHour) {
    return null;
  }

  let hour =
    Number(twelveHour[1]);

  const minute =
    Number(twelveHour[2] ?? "0");

  const period =
    twelveHour[3];

  if (
    hour < 1 ||
    hour > 12 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  if (period === "am") {
    if (hour === 12) {
      hour = 0;
    }
  } else if (hour !== 12) {
    hour += 12;
  }

  return hour * 60 + minute;
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
      const name =
        station.station?.trim();

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
      (
        item
      ): item is ScheduledStop =>
        item !== null
    );
}

/* =========================================================
   API TRIP CONVERSION
   ========================================================= */

function convertApiTrip(
  trip: ApiTrip,
  index: number
): TransportTrip | null {
  const stops =
    convertStations(trip.stations);

  if (stops.length < 2) {
    return null;
  }

  const vehicleNumber =
    trip.vehicle_number?.trim() ||
    trip["Vehicle Number"]?.trim() ||
    undefined;

  const tripNumber =
    trip.trip ?? index;

  const idBase =
    [
      vehicleNumber ?? "bus",
      tripNumber,
      stops
        .map(
          (item) =>
            normalizeName(
              item.stop.name
            )
        )
        .join("-"),
    ].join("-");

  return {
    id: `private-${slugify(idBase)}`,

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
   DATASET CONVERSION
   =========================================================

   Dataset structure:

   busSchedules[]
      -> Vehicle Number
      -> route[]                  // COMPLETE ORDERED ROUTE
      -> schedule[]
           -> trip
           -> stations[]          // REAL TIMED STOPS

   IMPORTANT:

   route[] is the source of truth for the complete
   ordered route.

   schedule[].stations[] is used to attach timing
   information wherever timing is available.

   We NEVER create a route based on the user's
   searched FROM/TO pair.

   Example:

   route:
   A -> B -> C -> D -> E

   Search:
   B -> D

   Result:
   Same original bus, with B before D.
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
      /*
       * -----------------------------------------------------
       * Build a timing lookup from every scheduled trip.
       *
       * A bus can have multiple trips in one day.
       * We keep the timing information separately so that
       * the complete route is never lost.
       * -----------------------------------------------------
       */

      const schedules = Array.isArray(
        bus.schedule
      )
        ? bus.schedule
        : [];

      /*
       * -----------------------------------------------------
       * Convert every scheduled trip.
       *
       * If route[] exists, it becomes the complete ordered
       * route.
       *
       * If route[] is unavailable, we fall back to the
       * scheduled stations for that particular trip.
       * -----------------------------------------------------
       */

      schedules.forEach(
        (schedule, scheduleIndex) => {
          const scheduledStations =
            Array.isArray(
              schedule.stations
            )
              ? schedule.stations
              : [];

          /*
           * Create a lookup of real timing data.
           *
           * Example:
           *
           * MANANTHAVADY -> 14:35
           * PANAMARAM    -> 15:15
           * KALPETTA     -> 15:55
           */

          const timingMap =
            new Map<
              string,
              {
                arrivalTime:
                  string | null;
                departureTime:
                  string | null;
              }
            >();

          scheduledStations.forEach(
            (station) => {
              const stationName =
                station.station?.trim();

              if (!stationName) {
                return;
              }

              timingMap.set(
                normalizeName(
                  stationName
                ),
                {
                  arrivalTime:
                    station.arrivalTime ??
                    null,

                  departureTime:
                    station.departureTime ??
                    null,
                }
              );
            }
          );

          /*
           * -------------------------------------------------
           * Use the COMPLETE route whenever available.
           * -------------------------------------------------
           */

          const completeRoute =
            Array.isArray(bus.route) &&
            bus.route.length > 0
              ? bus.route
              : scheduledStations.map(
                  (station) =>
                    station.station ??
                    ""
                );

          /*
           * Remove empty route names while preserving
           * the original order.
           */

          const routeStops =
            completeRoute
              .map((name) =>
                typeof name ===
                "string"
                  ? name.trim()
                  : ""
              )
              .filter(Boolean);

          if (
            routeStops.length < 2
          ) {
            return;
          }

          /*
           * -------------------------------------------------
           * Convert the COMPLETE route into ScheduledStop[].
           *
           * Timing is attached only when the dataset
           * actually provides it.
           *
           * We DO NOT invent missing times.
           * -------------------------------------------------
           */

          const stops: ScheduledStop[] =
            routeStops.map(
              (
                stationName,
                sequence
              ) => {
                const timing =
                  timingMap.get(
                    normalizeName(
                      stationName
                    )
                  );

                const stop: TransportStop =
                  {
                    id: makeStopId(
                      stationName
                    ),

                    name: stationName,
                  };

                return {
                  stop,

                  sequence,

                  arrivalTime:
                    timing?.arrivalTime ??
                    null,

                  departureTime:
                    timing?.departureTime ??
                    null,
                };
              }
            );

          /*
           * -------------------------------------------------
           * Create the genuine bus trip.
           * -------------------------------------------------
           */

          const vehicleNumber =
            bus.vehicle_number?.trim() ||
            bus[
              "Vehicle Number"
            ]?.trim() ||
            undefined;

          const tripNumber =
            schedule.trip ??
            scheduleIndex;

          const idBase = [
            vehicleNumber ??
              `bus-${busIndex}`,

            tripNumber,

            stops
              .map(
                (item) =>
                  normalizeName(
                    item.stop.name
                  )
              )
              .join("-"),
          ].join("-");

          trips.push({
            id:
              `private-${slugify(
                idBase
              )}`,

            vehicleNumber,

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

            stops,

            isLive: false,
          });
        }
      );

      /*
       * -----------------------------------------------------
       * Some dataset entries may contain route[] but no
       * schedule[].
       *
       * Preserve those genuine routes too.
       *
       * We DO NOT create fake timing information.
       * -----------------------------------------------------
       */

      if (
        schedules.length === 0 &&
        Array.isArray(bus.route) &&
        bus.route.length >= 2
      ) {
        const routeStops =
          bus.route
            .map((name) =>
              typeof name ===
              "string"
                ? name.trim()
                : ""
            )
            .filter(Boolean);

        if (
          routeStops.length >= 2
        ) {
          const stops: ScheduledStop[] =
            routeStops.map(
              (
                stationName,
                sequence
              ) => ({
                stop: {
                  id:
                    makeStopId(
                      stationName
                    ),

                  name:
                    stationName,
                },

                sequence,

                arrivalTime:
                  null,

                departureTime:
                  null,
              })
            );

          const vehicleNumber =
            bus.vehicle_number?.trim() ||
            bus[
              "Vehicle Number"
            ]?.trim() ||
            undefined;

          trips.push({
            id:
              `private-${slugify(
                vehicleNumber ??
                  `bus-${busIndex}`
              )}-route`,

            vehicleNumber,

            serviceName:
              undefined,

            operator:
              "Private Bus",

            mode: "bus",

            source:
              "private-bus-api",

            stops,

            isLive: false,
          });
        }
      }
    }
  );

  return trips;
}

/* =========================================================
   DIRECT TRIP MATCHING
   =========================================================

   This function checks the REAL ordered route.

   Example genuine route:

   MANANTHAVADY
   NALAM MILE
   PANAMARAM
   KAMBALAKKAD
   KALPETTA

   MANANTHAVADY -> NALAM MILE
   = valid

   NALAM MILE -> PANAMARAM
   = valid

   PANAMARAM -> KAMBALAKKAD
   = valid

   MANANTHAVADY -> KALPETTA
   = valid

   KALPETTA -> MANANTHAVADY
   = invalid

   No searched-pair trip is created.
   ========================================================= */

function findDirectTrips(
  trips: TransportTrip[],
  from: string,
  to: string
): TransportTrip[] {
  if (
    !from.trim() ||
    !to.trim()
  ) {
    return [];
  }

  const fromName =
    resolveStopName(from);

  const toName =
    resolveStopName(to);

  if (
    !fromName ||
    !toName ||
    normalizeName(fromName) ===
      normalizeName(toName)
  ) {
    return [];
  }

  return trips.filter(
    (trip) => {
      if (
        trip.mode !== "bus" ||
        !Array.isArray(
          trip.stops
        ) ||
        trip.stops.length < 2
      ) {
        return false;
      }

      const fromIndex =
        trip.stops.findIndex(
          (stop) =>
            stationMatches(
              stop.stop.name,
              fromName
            )
        );

      const toIndex =
        trip.stops.findIndex(
          (stop) =>
            stationMatches(
              stop.stop.name,
              toName
            )
        );

      return (
        fromIndex >= 0 &&
        toIndex >= 0 &&
        fromIndex < toIndex
      );
    }
  );
}

/* =========================================================
   JOURNEY CONVERSION
   ========================================================= */

function tripToJourney(
  trip: TransportTrip,
  from: string,
  to: string
): Journey | null {
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

  if (
    fromIndex < 0 ||
    toIndex < 0 ||
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

  const arrivalMinutes =
    timeToMinutes(
      arrivalTime
    );

  let duration:
    | number
    | undefined;

  if (
    departureMinutes !== null &&
    arrivalMinutes !== null
  ) {
    duration =
      arrivalMinutes >=
      departureMinutes
        ? arrivalMinutes -
          departureMinutes
        : arrivalMinutes +
          24 * 60 -
          departureMinutes;
  }

  return {
    segments: [
      {
        trip,
        from: fromStop,
        to: toStop,
      },
    ],

    transfers: 0,

    totalDurationMinutes:
      duration,

    waitingTimeMinutes: 0,

    departureTime,

    arrivalTime,

    isLive:
      trip.isLive ?? false,

    isPast: false,
  };
}

/* =========================================================
   SCHEDULE API
   =========================================================

   Official endpoint:

   /api/v1/schedules

   Parameters:
   departure
   destination
   restrict

   The API may return a route containing
   stations beyond the searched destination.
   We preserve those stations.
   ========================================================= */

async function fetchFromScheduleApi(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  try {
    const departure =
      resolveStopName(from);

    const destination =
      resolveStopName(to);

    if (
      !departure ||
      !destination
    ) {
      return [];
    }

    const params =
      new URLSearchParams({
        departure,
        destination,
        restrict: "false",
      });

    const response =
      await fetch(
        `${SCHEDULE_API_URL}?${params.toString()}`,
        {
          headers: {
            Accept:
              "application/json",
          },

          cache: "no-store",
        }
      );

    if (!response.ok) {
      console.warn(
        "Schedule API status:",
        response.status
      );

      return [];
    }

    const data: unknown =
      await response.json();

    const rawTrips: unknown[] =
      Array.isArray(data)
        ? data
        : data &&
            typeof data ===
              "object" &&
            "data" in data &&
            Array.isArray(
              (
                data as {
                  data?: unknown;
                }
              ).data
            )
          ? (
              data as {
                data: unknown[];
              }
            ).data
          : data &&
              typeof data ===
                "object" &&
              "schedules" in data &&
              Array.isArray(
                (
                  data as {
                    schedules?: unknown;
                  }
                ).schedules
              )
            ? (
                data as {
                  schedules: unknown[];
                }
              ).schedules
            : [];

    return rawTrips
      .map(
        (item, index) =>
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
      "Schedule API failed:",
      error
    );

    return [];
  }
}

/* =========================================================
   FULL ROUTE API
   =========================================================

   This endpoint is used only with a genuine
   vehicle number obtained from the schedule API.

   It returns the full ordered route for that bus.
   ========================================================= */

async function fetchFullRouteForVehicle(
  vehicleNumber: string
): Promise<TransportTrip[]> {
  if (!vehicleNumber.trim()) {
    return [];
  }

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
          headers: {
            Accept:
              "application/json",
          },

          cache: "no-store",
        }
      );

    if (!response.ok) {
      return [];
    }

    const data: unknown =
      await response.json();

    const rawRoutes: unknown[] =
      Array.isArray(data)
        ? data
        : data &&
            typeof data ===
              "object" &&
            "data" in data &&
            Array.isArray(
              (
                data as {
                  data?: unknown;
                }
              ).data
            )
          ? (
              data as {
                data: unknown[];
              }
            ).data
          : data &&
              typeof data ===
                "object" &&
              "schedules" in data &&
              Array.isArray(
                (
                  data as {
                    schedules?: unknown;
                  }
                ).schedules
              )
            ? (
                data as {
                  schedules: unknown[];
                }
              ).schedules
            : [];

    return rawRoutes
      .map(
        (item, index) =>
          convertApiTrip(
            {
              vehicle_number:
                vehicleNumber,

              "Vehicle Number":
                vehicleNumber,

              trip:
                (
                  item as ApiTrip
                ).trip,

              stations:
                (
                  item as ApiTrip
                ).stations,
            },

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
      "Full route API failed:",
      error
    );

    return [];
  }
}

/* =========================================================
   DATASET FETCH
   ========================================================= */

async function fetchDataset(): Promise<
  TransportTrip[]
> {
  try {
    const response =
      await fetch(
        DATASET_URL,
        {
          headers: {
            Accept:
              "application/json",
          },

          cache: "no-store",
        }
      );

    if (!response.ok) {
      console.warn(
        "Dataset status:",
        response.status
      );

      return [];
    }

    const data: Dataset =
      await response.json();

    return convertDataset(data);
  } catch (error) {
    console.warn(
      "Dataset fetch failed:",
      error
    );

    return [];
  }
}

/* =========================================================
   HTML / TEXT HELPERS
   ========================================================= */

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
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /&apos;/gi,
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
          /<br\s*\/?>/gi,
          "\n"
        )
        .replace(
          /<\/(div|p|li|article|section|header|footer|h1|h2|h3|h4|h5|h6|tr|td|th)>/gi,
          "\n"
        )
        .replace(
          /<[^>]+>/g,
          " "
        )
    );

  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(
          /\s+/g,
          " "
        )
        .trim()
    )
    .filter(Boolean);
}

/* =========================================================
   MYBUSYATRA SLUG
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

  return slugify(
    normalized
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
   MYBUSYATRA DETAIL LINK EXTRACTION
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

  const base =
    new URL(
      MYBUSYATRA_BASE_URL
    );

  while (
    (match = regex.exec(html))
  ) {
    const href =
      decodeHtml(
        match[1]
      );

    if (!href) {
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
      continue;
    }
  }

  return Array.from(
    links
  );
}

/* =========================================================
   MYBUSYATRA ROUTE PARSER
   ========================================================= */

function parseMyBusYatraRoute(
  html: string
): ScheduledStop[] {
  const lines =
    htmlToLines(html);

  const result: ScheduledStop[] = [];

  const timePattern =
    /\b(\d{1,2}:\d{2})(?:\s*(am|pm))?\b/i;

  const ignored = new Set([
    "arrival",
    "departure",
    "time",
    "schedule",
    "route",
    "station",
    "duration",
    "bus timing",
    "bus timetable",
  ]);

  function addStation(
    name: string,
    time: string
  ): void {
    const cleaned =
      name
        .replace(
          /\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b/gi,
          " "
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    if (
      !cleaned ||
      cleaned.length < 2 ||
      cleaned.length > 80
    ) {
      return;
    }

    const normalized =
      normalizeName(cleaned);

    if (
      ignored.has(normalized)
    ) {
      return;
    }

    if (
      /^(arrival|departure|time|schedule|route|station|bus|service)$/i.test(
        normalized
      )
    ) {
      return;
    }

    const exists =
      result.some(
        (item) =>
          normalizeName(
            item.stop.name
          ) === normalized
      );

    if (exists) {
      return;
    }

    result.push({
      stop: {
        id:
          `mybusyatra-${slugify(
            cleaned
          )}`,
        name: cleaned,
      },
      sequence:
        result.length,
      arrivalTime: time,
      departureTime: time,
    });
  }

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i];

    const timeMatch =
      line.match(
        timePattern
      );

    if (!timeMatch) {
      continue;
    }

    const time =
      timeMatch[0];

    const withoutTime =
      line
        .replace(
          time,
          " "
        )
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    if (
      withoutTime
    ) {
      addStation(
        withoutTime,
        time
      );

      continue;
    }

    const next =
      lines[i + 1];

    if (
      next &&
      !timePattern.test(next)
    ) {
      addStation(
        next,
        time
      );
    }
  }

  return result;
}

/* =========================================================
   MYBUSYATRA SERVICE DETAIL
   ========================================================= */

async function fetchMyBusYatraDetail(
  url: string
): Promise<TransportTrip | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    const stops = parseMyBusYatraRoute(html);

    if (stops.length < 2) {
      return null;
    }

    const vehicleMatch = html.match(
      /vehicle\s*(?:no|number)?\s*[:\-]?\s*([A-Z0-9 -]{4,20})/i
    );

    const vehicleNumber =
      vehicleMatch?.[1]?.trim() || undefined;

    const titleMatch = html.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i
    );

    const serviceName = titleMatch?.[1]
      ? decodeHtml(titleMatch[1])
          .replace(/\s+/g, " ")
          .trim()
      : undefined;

    const isKsrtc =
      serviceName?.toLowerCase().includes("ksrtc") ||
      html.toLowerCase().includes("ksrtc");

    return {
      id: `mybusyatra-${slugify(
        vehicleNumber ?? serviceName ?? url
      )}`,

      vehicleNumber,

      serviceName,

      operator: isKsrtc
        ? "KSRTC"
        : "Private Bus",

      mode: "bus",

      // IMPORTANT:
      // Keep KSRTC separate from private-bus data.
      source: isKsrtc
        ? "ksrtc"
        : "private-bus-api",

      stops,

      isLive: false,
    };
  } catch (error) {
    console.warn(
      "MyBusYatra detail failed:",
      error
    );

    return null;
  }
}

/* =========================================================
   MYBUSYATRA SEARCH
   ========================================================= */

async function fetchFromMyBusYatra(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  try {
    const timetableUrl =
      myBusYatraTimetableUrl(
        from,
        to
      );

    const response = await fetch(
      timetableUrl,
      {
        headers: {
          Accept: "text/html",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.warn(
        "MyBusYatra timetable status:",
        response.status,
        timetableUrl
      );

      return [];
    }

    const html =
      await response.text();

    const links =
      extractMyBusYatraDetailLinks(
        html
      );

    if (links.length === 0) {
      console.warn(
        "No MyBusYatra detail links:",
        timetableUrl
      );

      return [];
    }

    const trips: TransportTrip[] = [];

    /*
     * Don't request 40 pages one-by-one.
     * Fetch them concurrently in small batches.
     */
    const limitedLinks = links;

    const batchSize = 8;

    for (
      let i = 0;
      i < limitedLinks.length;
      i += batchSize
    ) {
      const batch =
        limitedLinks.slice(
          i,
          i + batchSize
        );

      const results =
        await Promise.all(
          batch.map((link) =>
            fetchMyBusYatraDetail(
              link
            )
          )
        );

      for (
        const trip of results
      ) {
        if (!trip) {
          continue;
        }

        /*
         * Check the actual complete route.
         * This is what allows intermediate stops.
         */
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
    }

    console.log(
      "MyBusYatra trips:",
      trips.length,
      "KSRTC:",
      trips.filter(
        (trip) =>
          trip.source === "ksrtc"
      ).length
    );

    return trips;
  } catch (error) {
    console.warn(
      "MyBusYatra failed:",
      error
    );

    return [];
  }
}

/* =========================================================
   DEDUPLICATION
   ========================================================= */

function dedupeTrips(
  trips: TransportTrip[]
): TransportTrip[] {
  const seen =
    new Set<string>();

  const result:
    TransportTrip[] = [];

  for (
    const trip of trips
  ) {
    if (
      !trip.stops ||
      trip.stops.length < 2
    ) {
      continue;
    }

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

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(trip);
  }

  return result;
}

/* =========================================================
   FULL ROUTE ENRICHMENT
   ========================================================= */

async function enrichWithFullRoutes(
  trips: TransportTrip[]
): Promise<TransportTrip[]> {
  const result:
    TransportTrip[] = [];

  const cache =
    new Map<
      string,
      TransportTrip[]
    >();

  for (
    const trip of trips
  ) {
    const vehicle =
      trip.vehicleNumber?.trim();

    /*
     * A route with 3+ real stops is already
     * sufficiently detailed.
     */
    if (
      !vehicle ||
      trip.stops.length >= 3
    ) {
      result.push(trip);
      continue;
    }

    const cacheKey =
      vehicle
        .toUpperCase()
        .replace(
          /\s+/g,
          ""
        );

    let fullRoutes =
      cache.get(cacheKey);

    if (
      !fullRoutes
    ) {
      fullRoutes =
        await fetchFullRouteForVehicle(
          vehicle
        );

      cache.set(
        cacheKey,
        fullRoutes
      );
    }

    if (
      fullRoutes.length === 0
    ) {
      result.push(trip);
      continue;
    }

    const matchingRoute =
      fullRoutes.find(
        (route) =>
          route.stops.length >= 2
      );

    if (!matchingRoute) {
      result.push(trip);
      continue;
    }

    result.push({
      ...trip,

      stops:
        matchingRoute.stops,

      serviceName:
        trip.serviceName ??
        matchingRoute.serviceName,

      vehicleNumber:
        trip.vehicleNumber ??
        matchingRoute.vehicleNumber,
    });
  }

  return result;
}

/* =========================================================
   SEARCH
   ========================================================= */

export async function searchTransport(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const fromName = resolveStopName(from);
  const toName = resolveStopName(to);

  if (
    !fromName ||
    !toName ||
    normalizeName(fromName) ===
      normalizeName(toName)
  ) {
    return {
      from: fromName,
      to: toName,
      directJourneys: [],
      connectingJourneys: [],
      searchedAt:
        new Date().toISOString(),
    };
  }

  const withTimeout = async <T>(
    promise: Promise<T>,
    milliseconds: number,
    fallback: T
  ): Promise<T> => {
    let timer:
      | ReturnType<typeof setTimeout>
      | undefined;

    const timeout = new Promise<T>(
      (resolve) => {
        timer = setTimeout(
          () => resolve(fallback),
          milliseconds
        );
      }
    );

    try {
      return await Promise.race([
        promise,
        timeout,
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  /*
   * =======================================================
   * LOAD ALL PRIMARY SOURCES IN PARALLEL
   *
   * 1. Private-bus dataset
   * 2. Private-bus API
   * 3. KSRTC official source
   *
   * KSRTC is independent from the private-bus system.
   * =======================================================
   */

  const [
  datasetTrips,
  apiTrips,
  ksrtcTrips,
] = await Promise.all([
  /*
   * PRIVATE BUS:
   * Complete Wayanad route dataset.
   */
  withTimeout(
    fetchDataset(),
    15000,
    []
  ),

  /*
   * PRIVATE BUS:
   * Live/public schedule API.
   */
  withTimeout(
    fetchFromScheduleApi(
      fromName,
      toName
    ),
    15000,
    []
  ),

  /*
   * KSRTC:
   * Official KSRTC route database/scraper.
   *
   * This returns complete ordered routes
   * and then finds FROM -> TO on those routes.
   */
  withTimeout(
    getKsrtcTrips(
      fromName,
      toName
    ),
    45000,
    []
  ),
]);

  /*
   * =======================================================
   * PRIVATE BUS TRIPS
   * =======================================================
   */

  let privateTrips =
    dedupeTrips([
      ...datasetTrips,
      ...apiTrips,
    ]);

  /*
   * Enrich short private-bus API results with their
   * genuine complete vehicle route.
   *
   * No fake searched-pair routes are created.
   */

  privateTrips =
    await withTimeout(
      enrichWithFullRoutes(
        privateTrips
      ),
      10000,
      privateTrips
    );

  /*
   * =======================================================
   * MYBUSYATRA
   * =======================================================
   *
   * Keep it as a secondary source.
   *
   * It may contain both KSRTC and private buses.
   */

  const myBusTrips =
    await withTimeout(
      fetchFromMyBusYatra(
        fromName,
        toName
      ),
      12000,
      []
    );

  /*
   * =======================================================
   * COMBINE PRIVATE SOURCES
   * =======================================================
   */

  privateTrips =
    dedupeTrips([
      ...privateTrips,
      ...myBusTrips,
    ]);

  /*
   * =======================================================
   * COMBINE PRIVATE + KSRTC
   * =======================================================
   *
   * KSRTC is kept as genuine KSRTC data because its
   * source is "ksrtc".
   */

  const allTrips =
  dedupeTrips([
    /*
     * Private bus dataset
     */
    ...privateTrips,

    /*
     * Official KSRTC
     */
    ...ksrtcTrips,
  ]);

  /*
   * =======================================================
   * FIND DIRECT JOURNEYS
   * =======================================================
   *
   * The matcher checks the actual ordered route:
   *
   * A -> B -> C -> D
   *
   * Search:
   * B -> D
   *
   * Result:
   * same genuine bus.
   *
   * We never create:
   * B -> D
   *
   * as a fake route.
   * =======================================================
   */

  const directTrips =
    findDirectTrips(
      allTrips,
      fromName,
      toName
    );

  /*
   * =======================================================
   * CONVERT TO JOURNEYS
   * =======================================================
   */

  const directJourneys =
    directTrips
      .map((trip) =>
        tripToJourney(
          trip,
          fromName,
          toName
        )
      )
      .filter(
        (
          journey
        ): journey is Journey =>
          journey !== null
      );

  /*
   * =======================================================
   * SORT BY DEPARTURE TIME
   * =======================================================
   */

  directJourneys.sort(
    (a, b) => {
      const aTime =
        timeToMinutes(
          a.departureTime
        );

      const bTime =
        timeToMinutes(
          b.departureTime
        );

      if (
        aTime === null &&
        bTime === null
      ) {
        return 0;
      }

      if (aTime === null) {
        return 1;
      }

      if (bTime === null) {
        return -1;
      }

      return aTime - bTime;
    }
  );

  /*
   * =======================================================
   * RETURN
   * =======================================================
   */

  return {
    from: fromName,
    to: toName,

    directJourneys,

    /*
     * Transfer routing will be implemented after
     * direct-route coverage is stable.
     */

    connectingJourneys: [],

    searchedAt:
      new Date().toISOString(),
  };
}
/* =========================================================
   COMPATIBILITY EXPORT
   ========================================================= */

export async function searchBuses(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  return searchTransport(
    from,
    to
  );
}
