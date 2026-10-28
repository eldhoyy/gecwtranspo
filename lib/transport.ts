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

const SCHEDULE_API_URL =
  "https://busapi.amithv.xyz/api/v1/schedules";

const DATASET_URL =
  "https://raw.githubusercontent.com/amith-vp/Kerala-Private-Bus-Timing/main/wayanad.json";

const MYBUSYATRA_BASE_URL =
  "https://www.mybusyatra.in";

/*
 * MyBusYatra uses slightly different
 * spellings in its URLs.
 */
const MYBUS_SLUG_OVERRIDES: Record<
  string,
  string
> = {
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
    .replace(
      /[.,/()\-\u2013\u2014]+/g,
      " "
    )
    .replace(/\s+/g, " ");
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
 * ORDERED STATION CONVERSION
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
                  bus["Vehicle Number"],

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
 * A trip contains its COMPLETE
 * ordered route.
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
 * returns the same bus.
 *
 * We never create a fake
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
 * PRIVATE BUS SCHEDULE API
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

  try {
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
      return [];
    }

    const data: unknown =
      await response.json();

    if (
      !Array.isArray(data)
    ) {
      return [];
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
  } catch {
    return [];
  }
}

/*
 * ----------------------------------------------------
 * PRIVATE WAYANAD DATASET
 * ----------------------------------------------------
 */

async function fetchFromDataset(): Promise<
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

          next: {
            revalidate:
              3600,
          },
        }
      );

    if (!response.ok) {
      return [];
    }

    const data:
      Dataset =
      await response.json();

    return convertDataset(
      data
    );
  } catch {
    return [];
  }
}

/*
 * ----------------------------------------------------
 * MYBUSYATRA HELPERS
 * ----------------------------------------------------
 */

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

/*
 * Decode common HTML entities.
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

/*
 * Convert HTML to readable text.
 */
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
        /<\/(div|p|li|article|section|header|footer|h1|h2|h3|h4|h5|h6|br|main|nav|tr)>/gi,
        "\n"
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(
      /\r/g,
      ""
    )
    .replace(
      /[ \t]+/g,
      " "
    )
    .replace(
      /\n\s*\n+/g,
      "\n"
    )
    .trim();
}

/*
 * Convert HTML to individual readable lines.
 */
function htmlToLines(
  html: string
): string[] {
  return htmlToText(
    html
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
 * MYBUSYATRA TIMETABLE DETAIL LINKS
 * ----------------------------------------------------
 */

function extractMyBusYatraDetailLinks(
  html: string
): string[] {
function extractMyBusYatraDetailLinks(
  html: string
): string[] {
  const links: string[] = [];

  /*
   * MyBusYatra can expose service links
   * in slightly different formats.
   *
   * Do not restrict this to /bus/ksrtc.
   * The timetable may contain service URLs
   * with different slugs.
   */
  const regex =
    /href\s*=\s*["']([^"']+)["']/gi;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    const href = decodeHtml(match[1]);

    if (!href) {
      continue;
    }

    try {
      const url = new URL(
        href,
        MYBUSYATRA_BASE_URL
      );

      const base = new URL(
        MYBUSYATRA_BASE_URL
      );

      if (url.hostname !== base.hostname) {
        continue;
      }

      const pathname =
        url.pathname.toLowerCase();

      if (!pathname.startsWith("/bus/")) {
        continue;
      }

      /*
       * Ignore the timetable/listing page itself.
       *
       * Example:
       * /bus/mananthavady-to-nalam-mile
       */
      const slug =
        pathname
          .replace(/^\/bus\//, "")
          .replace(/\/+$/, "");

      if (!slug) {
        continue;
      }

      /*
       * A service-detail URL normally contains
       * more information than the simple
       * "from-to" timetable URL.
       *
       * Keep every /bus/ link here and let
       * fetchMyBusYatraService() validate it.
       */
      links.push(url.toString());
    } catch {
      continue;
    }
  }

  return Array.from(
    new Set(links)
  );
}

/*
 * ----------------------------------------------------
 * TIME HELPERS
 * ----------------------------------------------------
 */

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

  const hour =
    Number(match[1]);

  const minute =
    Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return value.trim();
  }

  return `${String(hour).padStart(
    2,
    "0"
  )}:${String(minute).padStart(
    2,
    "0"
  )}`;
}

/*
 * Clean station names extracted
 * from the MyBusYatra page.
 */
function cleanRouteStation(
  value: string
): string | null {
  let station =
    value
      .replace(
        /[|•]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  station =
    station.replace(
      /^\d+\s*[.)-]\s*/,
      ""
    );

  station =
    station.replace(
      /\s*(arrival|departure)\s*$/i,
      ""
    );

  if (
    !station ||
    station.length > 80
  ) {
    return null;
  }

  const lower =
    station.toLowerCase();

  if (
    [
      "route schedule",
      "schedule",
      "timings",
      "time",
      "arrival",
      "departure",
      "bus timing",
      "route",
    ].includes(lower)
  ) {
    return null;
  }

  if (
    /^(mon|tue|wed|thu|fri|sat|sun)/i.test(
      station
    )
  ) {
    return null;
  }

  return station;
}

/*
 * ----------------------------------------------------
 * ROUTE PARSER
 * ----------------------------------------------------
 *
 * MyBusYatra service pages show a
 * complete ordered route.
 *
 * We try several formats because
 * the website markup can vary.
 * ----------------------------------------------------
 */

function extractMyBusYatraRoute(
  html: string
): MyBusYatraRouteStop[] {
  const lines =
    htmlToLines(html);

  const route:
    MyBusYatraRouteStop[] = [];

  /*
   * First pass:
   *
   * "MANANTHAVADY 14:35"
   */
  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i];

    const match =
      line.match(
        /^(.+?)\s+(\d{1,2}:\d{2})$/
      );

    if (!match) {
      continue;
    }

    const station =
      cleanRouteStation(
        match[1]
      );

    if (!station) {
      continue;
    }

    const time =
      normalizeTime(
        match[2]
      );

    if (
      !isTime(time)
    ) {
      continue;
    }

    const previous =
      route[
        route.length - 1
      ];

    if (
      previous &&
      normalizeName(
        previous.name
      ) ===
        normalizeName(
          station
        )
    ) {
      continue;
    }

    route.push({
      name: station,
      arrival: time,
      departure: time,
    });
  }

  /*
   * Second pass:
   *
   * Some pages may separate
   * station and time into
   * neighbouring text lines.
   */
  if (
    route.length < 2
  ) {
    route.length = 0;

    for (
      let i = 0;
      i < lines.length - 1;
      i++
    ) {
      const station =
        cleanRouteStation(
          lines[i]
        );

      if (!station) {
        continue;
      }

      const time =
        lines[i + 1];

      if (
        !isTime(time)
      ) {
        continue;
      }

      const normalizedTime =
        normalizeTime(
          time
        );

      const previous =
        route[
          route.length - 1
        ];

      if (
        previous &&
        normalizeName(
          previous.name
        ) ===
          normalizeName(
            station
          )
      ) {
        continue;
      }

      route.push({
        name: station,
        arrival:
          normalizedTime,
        departure:
          normalizedTime,
      });
    }
  }

  /*
   * Third pass:
   *
   * Use recognized GECW Go stops
   * as anchors when the page text
   * combines station and time
   * unexpectedly.
   */
  if (
    route.length < 2
  ) {
    route.length = 0;

    const knownStops = [
      "MANANTHAVADY",
      "NALAM MILE",
      "4TH MILE",
      "PANAMARAM",
      "KAMBALAKKAD",
      "KALPETTA",
      "MEENANGADI",
      "SULTHAN BATHERY",
      "PULPALLY",
      "VYTHIRI",
      "THAMARASSERY",
      "MUKKAM",
      "NILAMBUR",
      "MANJERI",
      "MALAPPURAM",
      "KOZHIKODE",
      "KANNUR",
      "THALASSERY",
      "VADAKARA",
      "PERAMBRA",
      "KALIKAVU",
      "MUVATTUPUZHA",
      "PERUMBAVOOR",
      "ALUVA",
      "ERNAKULAM",
    ];

    const fullText =
      htmlToText(html);

    for (
      const stop of knownStops
    ) {
      const escaped =
        stop.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );
function extractMyBusYatraRoute(
  html: string
): MyBusYatraRouteStop[] {
  const lines = htmlToLines(html);

  const route: MyBusYatraRouteStop[] = [];

  function addRouteStop(
    name: string,
    time: string
  ) {
    const station =
      cleanRouteStation(name);

    if (!station) {
      return;
    }

    const normalizedTime =
      normalizeTime(time);

    if (!isTime(normalizedTime)) {
      return;
    }

    const previous =
      route[route.length - 1];

    if (
      previous &&
      normalizeName(previous.name) ===
        normalizeName(station)
    ) {
      return;
    }

    route.push({
      name: station,
      arrival: normalizedTime,
      departure: normalizedTime,
    });
  }

  /*
   * --------------------------------------------------
   * FORMAT 1
   *
   * MANANTHAVADY 14:35
   * PANAMARAM 15:15
   * --------------------------------------------------
   */
  for (const line of lines) {
    const match =
      line.match(
        /^(.+?)\s+(\d{1,2}:\d{2})$/
      );

    if (!match) {
      continue;
    }

    addRouteStop(
      match[1],
      match[2]
    );
  }

  /*
   * --------------------------------------------------
   * FORMAT 2
   *
   * 14:35 MANANTHAVADY
   * 15:15 PANAMARAM
   * --------------------------------------------------
   */
  if (route.length < 2) {
    route.length = 0;

    for (const line of lines) {
      const match =
        line.match(
          /^(\d{1,2}:\d{2})\s+(.+?)$/
        );

      if (!match) {
        continue;
      }

      addRouteStop(
        match[2],
        match[1]
      );
    }
  }

  /*
   * --------------------------------------------------
   * FORMAT 3
   *
   * Station and time on neighbouring lines.
   *
   * MANANTHAVADY
   * 14:35
   * PANAMARAM
   * 15:15
   * --------------------------------------------------
   */
  if (route.length < 2) {
    route.length = 0;

    for (
      let i = 0;
      i < lines.length - 1;
      i++
    ) {
      const station =
        cleanRouteStation(lines[i]);

      if (!station) {
        continue;
      }

      if (!isTime(lines[i + 1])) {
        continue;
      }

      addRouteStop(
        station,
        lines[i + 1]
      );
    }
  }

  /*
   * --------------------------------------------------
   * FORMAT 4
   *
   * Time and station on neighbouring lines.
   *
   * 14:35
   * MANANTHAVADY
   * --------------------------------------------------
   */
  if (route.length < 2) {
    route.length = 0;

    for (
      let i = 0;
      i < lines.length - 1;
      i++
    ) {
      if (!isTime(lines[i])) {
        continue;
      }

      const station =
        cleanRouteStation(lines[i + 1]);

      if (!station) {
        continue;
      }

      addRouteStop(
        station,
        lines[i]
      );
    }
  }

  /*
   * --------------------------------------------------
   * FORMAT 5
   *
   * Use known GECW Go stops as anchors.
   *
   * Example:
   *
   * MANANTHAVADY 14:35
   * PANAMARAM 15:15
   * KALPETTA 15:55
   * --------------------------------------------------
   */
  if (route.length < 2) {
    route.length = 0;

    const knownStops = [
      "MANANTHAVADY",
      "NALAM MILE",
      "4TH MILE",
      "PANAMARAM",
      "KAMBALAKKAD",
      "KALPETTA",
      "MEENANGADI",
      "SULTHAN BATHERY",
      "PULPALLY",
      "VYTHIRI",
      "THAMARASSERY",
      "MUKKAM",
      "NILAMBUR",
      "MANJERI",
      "MALAPPURAM",
      "KOZHIKODE",
      "KANNUR",
      "THALASSERY",
      "VADAKARA",
      "PERAMBRA",
      "KALIKAVU",
      "MUVATTUPUZHA",
      "PERUMBAVOOR",
      "ALUVA",
      "ERNAKULAM",
    ];

    const fullText =
      htmlToText(html);

    for (const stop of knownStops) {
      const escaped =
        stop.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

      /*
       * Station -> time
       */
      const afterRegex =
        new RegExp(
          `${escaped}\\s*(?:[-|:>→➔]*)?\\s*(\\d{1,2}:\\d{2})`,
          "i"
        );

      const afterMatch =
        fullText.match(afterRegex);

      if (afterMatch) {
        addRouteStop(
          stop,
          afterMatch[1]
        );
        continue;
      }

      /*
       * Time -> station
       */
      const beforeRegex =
        new RegExp(
          `(\\d{1,2}:\\d{2})\\s*(?:[-|:>→➔]*)?\\s*${escaped}`,
          "i"
        );

      const beforeMatch =
        fullText.match(beforeRegex);

      if (beforeMatch) {
        addRouteStop(
          stop,
          beforeMatch[1]
        );
      }
    }
  }

  /*
   * Remove duplicate consecutive stops.
   */
  const cleaned:
    MyBusYatraRouteStop[] = [];

  for (const stop of route) {
    const previous =
      cleaned[cleaned.length - 1];

    if (
      previous &&
      normalizeName(previous.name) ===
        normalizeName(stop.name)
    ) {
      continue;
    }

    cleaned.push(stop);
  }

  return cleaned;
}
/*
 * ----------------------------------------------------
 * SERVICE INFORMATION PARSER
 * ----------------------------------------------------
 */

function extractMyBusYatraService(
  html: string
): MyBusYatraService | null {
  const text =
    htmlToText(html);

  let serviceName =
    "KSRTC Bus";

  /*
   * Common service names:
   *
   * KSRTC Fast Passenger
   * KSRTC Super Fast
   * KSRTC Town to Town Ordinary
   */
  const servicePatterns = [
    /KSRTC\s+(FAST PASSENGER)/i,
    /KSRTC\s+(SUPER FAST)/i,
    /KSRTC\s+(TOWN TO TOWN ORDINARY)/i,
    /KSRTC\s+(ORDINARY)/i,
    /KSRTC\s+(SUPER EXPRESS)/i,
    /KSRTC\s+(LIMITED STOP)/i,
  ];

  for (
    const pattern of servicePatterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      serviceName =
        `KSRTC ${match[1]
          .trim()
          .replace(
            /\s+/g,
            " "
          )}`;

      break;
    }
  }

  /*
   * Vehicle number.
   *
   * Example:
   *
   * Vehicle No: AX627
   */
  const vehicleMatch =
    text.match(
      /Vehicle\s*(?:No\.?|Number)\s*[:\-]?\s*([A-Z0-9-]+)/i
    );

  const vehicleNumber =
    vehicleMatch?.[1]
      ?.trim();

  /*
   * Route:
   *
   * MANANTHAVADY → NILAMBUR
   *
   * Also support:
   *
   * MANANTHAVADY - NILAMBUR
   */
  const routeMatch =
    text.match(
      /([A-Z][A-Z .'-]{2,50})\s*(?:→|➔|->|-)\s*([A-Z][A-Z .'-]{2,50})/
    );

  let routeName:
    | string
    | undefined;

  let direction:
    | string
    | undefined;

  if (routeMatch) {
    const from =
      cleanRouteStation(
        routeMatch[1]
      );

    const to =
      cleanRouteStation(
        routeMatch[2]
      );

    if (
      from &&
      to
    ) {
      routeName =
        `${from} → ${to}`;

      direction =
        `${from} → ${to}`;
    }
  }

  return {
    serviceName,
    vehicleNumber,
    routeName,
    direction,
  };
}

/*
 * ----------------------------------------------------
 * FETCH ONE COMPLETE MYBUSYATRA SERVICE
 * ----------------------------------------------------
 *
 * This opens the actual service page and
 * reads the complete ordered route.
 *
 * We do NOT create a fake:
 *
 * MANANTHAVADY → NALAM MILE
 *
 * trip.
 *
 * Instead, the actual bus route is retained.
 */
async function fetchMyBusYatraService(
  url: string,
  from: string,
  to: string
): Promise<TransportTrip | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    const service =
      extractMyBusYatraService(html);

    if (!service) {
      return null;
    }

    const route =
      extractMyBusYatraRoute(html);

    if (route.length < 2) {
      return null;
    }

    /*
     * Find the requested origin and
     * destination in the REAL route.
     */
    const fromIndex =
      route.findIndex((stop) =>
        stationMatches(
          stop.name,
          from
        )
      );

    const toIndex =
      route.findIndex((stop) =>
        stationMatches(
          stop.name,
          to
        )
      );

    /*
     * Direction matters.
     *
     * The bus must actually travel
     * FROM → TO.
     */
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= toIndex
    ) {
      return null;
    }

    /*
     * Select only the requested
     * portion of the actual route.
     */
    const selectedRoute =
      route.slice(
        fromIndex,
        toIndex + 1
      );

    if (
      selectedRoute.length < 2
    ) {
      return null;
    }

    const firstStop =
      selectedRoute[0];

    const lastStop =
      selectedRoute[
        selectedRoute.length - 1
      ];

    const departure =
      firstStop.departure ??
      firstStop.arrival ??
      "";

    const arrival =
      lastStop.arrival ??
      lastStop.departure ??
      "";

    /*
     * Preserve the REAL service
     * endpoints.
     *
     * Example:
     *
     * KSRTC Fast Passenger
     * MANANTHAVADY → NILAMBUR
     *
     * even if the user searches:
     *
     * MANANTHAVADY → NALAM MILE
     */
    const fullFirst =
      route[0]?.name ?? from;

    const fullLast =
      route[
        route.length - 1
      ]?.name ?? to;

    const id =
      [
        "mybusyatra",
        service.vehicleNumber ||
          service.serviceName,
        fullFirst,
        fullLast,
        departure,
      ]
        .join("-")
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          "-"
        );

    return {
      id,

      vehicleNumber:
        service.vehicleNumber,

      serviceName:
        service.serviceName,

      operator:
        "KSRTC",

      mode:
        "bus",

      source:
        "public-transport-api",

      stops:
        selectedRoute.map(
          (
            stop,
            index
          ) => {
            const transportStop:
              TransportStop = {
              id:
                makeStopId(
                  stop.name
                ),
              name:
                stop.name,
            };

            return {
              stop:
                transportStop,

              sequence:
                index,

              arrivalTime:
                stop.arrival ??
                null,

              departureTime:
                stop.departure ??
                null,
            };
          }
        ),

      isLive: false,
    };
  } catch {
    return null;
  }
}

/*
 * ----------------------------------------------------
 * FETCH MYBUSYATRA TIMETABLE
 * ----------------------------------------------------
 */

async function fetchFromMyBusYatra(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const slugFrom =
    myBusYatraSlug(from);

  const slugTo =
    myBusYatraSlug(to);

  if (
    !slugFrom ||
    !slugTo
  ) {
    return [];
  }

  const url =
    `${MYBUSYATRA_BASE_URL}/bus/${slugFrom}-to-${slugTo}`;

  try {
    const response = await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return [];
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

    const trips:
      TransportTrip[] = [];

    /*
     * Process a few service pages
     * at a time instead of requesting
     * everything simultaneously.
     */
    const maxConcurrent = 8;

    for (
      let i = 0;
      i < detailLinks.length;
      i += maxConcurrent
    ) {
      const batch =
        detailLinks.slice(
          i,
          i + maxConcurrent
        );

      const results =
        await Promise.all(
          batch.map(
            (detailLink) =>
              fetchMyBusYatraService(
                detailLink,
                from,
                to
              )
          )
        );

      for (
        const trip of results
      ) {
        if (trip) {
          trips.push(trip);
        }
      }
    }

    return trips;
  } catch {
    return [];
  }
}

/*
 * ----------------------------------------------------
 * DEDUPLICATE TRIPS
 * ----------------------------------------------------
 */

function dedupeTrips(
  trips: TransportTrip[]
): TransportTrip[] {
  const seen = new Set<string>();
  const result: TransportTrip[] = [];

  for (const trip of trips) {
    const firstStop = trip.stops[0];
    const lastStop = trip.stops[trip.stops.length - 1];

    const departure =
      firstStop?.departureTime ??
      firstStop?.arrivalTime ??
      "";

    const arrival =
      lastStop?.arrivalTime ??
      lastStop?.departureTime ??
      "";

    const key = [
      trip.operator ?? "",
      trip.vehicleNumber ?? "",
      trip.serviceName ?? "",
      departure,
      arrival,
      trip.stops
        .map((stop) => stop.stop.name)
        .join("|"),
    ].join("::");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trip);
  }

  return result;
}
/*
 * ----------------------------------------------------
 * MAIN TRANSPORT SEARCH
 * ----------------------------------------------------
 */

export async function searchTransport(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const fromStop =
    resolveStopName(from);

  const toStop =
    resolveStopName(to);

  if (
    !fromStop ||
    !toStop
  ) {
    return createSearchResult(
      from,
      to,
      []
    );
  }

  /*
   * Fetch all available sources.
   *
   * A failure in one source should
   * not break the complete search.
   */
  const [
    apiTrips,
    datasetTrips,
    myBusTrips,
  ] = await Promise.all([
    fetchFromScheduleApi(
      fromStop,
      toStop
    ),

    fetchFromDataset(),

    fetchFromMyBusYatra(
      fromStop,
      toStop
    ),
  ]);

  /*
   * Combine and remove duplicates.
   */
  const allTrips =
    dedupeTrips([
      ...apiTrips,
      ...datasetTrips,
      ...myBusTrips,
    ]);

  /*
   * IMPORTANT:
   *
   * A bus is considered direct only
   * when FROM appears before TO in
   * the same complete route.
   */
  const directTrips =
    findDirectTrips(
      allTrips,
      fromStop,
      toStop
    );

  return createSearchResult(
    fromStop,
    toStop,
    directTrips
  );
} 
/**
 * Backward-compatible API used by /api/buses/search
 */
export async function searchBuses(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  return searchTransport(from, to);
}
