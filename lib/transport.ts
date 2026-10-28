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
 * MyBusYatra uses different spellings for
 * some places in its URLs.
 */
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

/*
 * ---------------------------------------------------------
 * BASIC HELPERS
 * ---------------------------------------------------------
 */

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

  const variants = getStopNameVariants(requestedName);

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

  const twentyFourHour = text.match(
    /^(\d{1,2}):(\d{2})$/
  );

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

  const twelveHour = text.match(
    /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/
  );

  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? "0");
    const period = twelveHour[3];

    if (
      hour >= 1 &&
      hour <= 12 &&
      minute >= 0 &&
      minute <= 59
    ) {
      if (period === "am") {
        if (hour === 12) hour = 0;
      } else if (hour !== 12) {
        hour += 12;
      }

      return hour * 60 + minute;
    }
  }

  return null;
}

/*
 * ---------------------------------------------------------
 * ORDERED STATION CONVERSION
 * ---------------------------------------------------------
 */

function convertStations(
  stations: ApiStation[] | undefined
): ScheduledStop[] {
  if (!Array.isArray(stations)) {
    return [];
  }

  return stations
    .map((station, sequence) => {
      const name = station.station?.trim();

      if (!name) return null;

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

/*
 * ---------------------------------------------------------
 * PRIVATE BUS API
 * ---------------------------------------------------------
 */

function convertApiTrip(
  trip: ApiTrip,
  index: number
): TransportTrip | null {
  const stops = convertStations(trip.stations);

  if (stops.length < 2) {
    return null;
  }

  const vehicleNumber =
    trip.vehicle_number?.trim() ||
    trip["Vehicle Number"]?.trim() ||
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

/*
 * ---------------------------------------------------------
 * WAYANAD DATASET
 * ---------------------------------------------------------
 */

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
          vehicle_number: bus.vehicle_number,
          "Vehicle Number": bus["Vehicle Number"],
          trip: schedule.trip,
          stations: schedule.stations,
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

/*
 * ---------------------------------------------------------
 * DIRECT ROUTE MATCHING
 *
 * IMPORTANT:
 *
 * We use the COMPLETE ordered route.
 *
 * Example:
 *
 * MANANTHAVADY
 * NALAM MILE
 * PANAMARAM
 * KAMBALAKKAD
 * KALPETTA
 *
 * Searching:
 *
 * MANANTHAVADY -> NALAM MILE
 *
 * returns the same complete bus.
 *
 * We DO NOT create a fake bus whose route
 * starts at MANANTHAVADY and ends at NALAM MILE.
 * ---------------------------------------------------------
 */

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
 * ---------------------------------------------------------
 * PRIVATE BUS SCHEDULE API
 * ---------------------------------------------------------
 */

async function fetchFromScheduleApi(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const url =
    `${SCHEDULE_API_URL}?departure=${encodeURIComponent(
      from
    )}&destination=${encodeURIComponent(to)}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const data: unknown = await response.json();

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
        (trip): trip is TransportTrip =>
          trip !== null
      );
  } catch (error) {
    console.warn(
      "Private bus API failed:",
      error
    );

    return [];
  }
}

/*
 * ---------------------------------------------------------
 * WAYANAD DATASET FETCH
 * ---------------------------------------------------------
 */

async function fetchFromDataset(): Promise<
  TransportTrip[]
> {
  try {
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

/*
 * ---------------------------------------------------------
 * MYBUSYATRA
 * ---------------------------------------------------------
 */

function myBusYatraSlug(
  value: string
): string {
  const resolved = resolveStopName(value);
  const normalized = resolved.toUpperCase();

  const override =
    MYBUS_SLUG_OVERRIDES[normalized];

  if (override) {
    return override;
  }

  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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

/*
 * Decode common HTML entities.
 */

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

/*
 * Convert HTML to text.
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
    .replace(/\n\s*\n+/g, "\n")
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

/*
 * ---------------------------------------------------------
 * MYBUSYATRA SERVICE LINKS
 * ---------------------------------------------------------
 */

function extractMyBusYatraDetailLinks(
  html: string
): string[] {
  const links = new Set<string>();

  const regex =
    /href\s*=\s*["']([^"']+)["']/gi;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    const href = decodeHtml(match[1]);

    if (!href) continue;

    try {
      const url = new URL(
        href,
        MYBUSYATRA_BASE_URL
      );

      const base = new URL(
        MYBUSYATRA_BASE_URL
      );

      if (
        url.hostname !==
        base.hostname
      ) {
        continue;
      }

      const path =
        url.pathname.toLowerCase();

      if (
        !path.startsWith("/bus/")
      ) {
        continue;
      }

      /*
       * Keep the URL, but remove fragments.
       */
      url.hash = "";

      links.add(url.toString());
    } catch {
      // Ignore malformed links.
    }
  }

  return Array.from(links);
}

/*
 * ---------------------------------------------------------
 * MYBUSYATRA ROUTE PARSER
 *
 * Supports common forms such as:
 *
 * MANANTHAVADY 14:35
 * PANAMARAM 15:15
 *
 * and:
 *
 * 14:35 MANANTHAVADY
 * 15:15 PANAMARAM
 *
 * and HTML where station/time are
 * next to each other.
 * ---------------------------------------------------------
 */

function extractMyBusYatraRoute(
  html: string
): MyBusYatraRouteStop[] {
  const lines = htmlToLines(html);

  const route: MyBusYatraRouteStop[] = [];

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
  ) {
    const cleaned =
      cleanStation(name);

    if (
      !cleaned ||
      cleaned.length < 2
    ) {
      return;
    }

    const lower =
      cleaned.toLowerCase();

    if (ignored.has(lower)) {
      return;
    }

    /*
     * Ignore obvious non-stop labels.
     */
    if (
      /^(to|from|via|continues|bus|service|route)$/i.test(
        cleaned
      )
    ) {
      return;
    }

    /*
     * Avoid adding the same stop repeatedly
     * when HTML contains duplicate visual elements.
     */
    const existingIndex =
      route.findIndex(
        (item) =>
          normalizeName(
            item.name
          ) === normalizeName(cleaned)
      );

    if (
      existingIndex !== -1
    ) {
      if (time) {
        route[existingIndex].arrival ??=
          time;
        route[existingIndex].departure ??=
          time;
      }

      return;
    }

    route.push({
      name: cleaned,
      arrival: time,
      departure: time,
    });
  }

  /*
   * Format:
   *
   * MANANTHAVADY 14:35
   */
  for (const line of lines) {
    const match =
      line.match(timeRegex);

    if (!match) {
      continue;
    }

    const time = match[0].trim();

    const before =
      line.slice(
        0,
        match.index
      ).trim();

    const after =
      line
        .slice(
          (match.index ?? 0) +
            match[0].length
        )
        .trim();

    /*
     * Station before time.
     */
    if (
      before &&
      before.length >= 2
    ) {
      addStop(
        before,
        time
      );
    }

    /*
     * Station after time.
     */
    if (
      after &&
      after.length >= 2
    ) {
      /*
       * Don't treat long service-description
       * text as a station.
       */
      const station =
        after
          .split(/\s{2,}|\|/)
          [0];

      if (
        station &&
        station.length < 80
      ) {
        addStop(
          station,
          time
        );
      }
    }
  }

  /*
   * If the HTML parser has merged several stations
   * into one line, try matching known stop names
   * against that line.
   */
  const knownNames = [
    "MANANTHAVADY",
    "NALAM MILE",
    "PANAMARAM",
    "KAMBALAKKAD",
    "KALPETTA",
    "VYTHIRI",
    "THAMARASSERY",
    "ADIVAARAM",
    "MUKKAM",
    "AREEKODE",
    "NILAMBUR",
    "MEENANGADI",
    "SULTHAN BATHERY",
    "PULPALLY",
    "KANNUR",
    "THALASSERY",
    "KOZHIKODE",
    "MALAPPURAM",
    "MANJERI",
  ];

  for (const line of lines) {
    const timeMatches =
      Array.from(
        line.matchAll(
          /\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b/gi
        )
      );

    for (const stopName of knownNames) {
      const index =
        line
          .toLowerCase()
          .indexOf(
            stopName.toLowerCase()
          );

      if (index === -1) {
        continue;
      }

      let closestTime:
        string | undefined;

      let closestDistance =
        Number.MAX_SAFE_INTEGER;

      for (const timeMatch of timeMatches) {
        const timeIndex =
          timeMatch.index ?? 0;

        const distance =
          Math.abs(
            timeIndex - index
          );

        if (
          distance <
          closestDistance
        ) {
          closestDistance =
            distance;

          closestTime =
            timeMatch[0];
        }
      }

      addStop(
        stopName,
        closestTime
      );
    }
  }

  /*
   * Remove accidental duplicate consecutive
   * stations while preserving route order.
   */
  return route.filter(
    (stop, index) => {
      if (index === 0) {
        return true;
      }

      return (
        normalizeName(
          stop.name
        ) !==
        normalizeName(
          route[index - 1].name
        )
      );
    }
  );
}

/*
 * ---------------------------------------------------------
 * MYBUSYATRA SERVICE INFORMATION
 * ---------------------------------------------------------
 */

function extractMyBusYatraService(
  html: string
): MyBusYatraService | null {
  const text =
    htmlToText(html);

  const lines =
    htmlToLines(html);

  let serviceName =
    "KSRTC";

  let vehicleNumber:
    | string
    | undefined;

  let routeName:
    | string
    | undefined;

  let direction:
    | string
    | undefined;

  /*
   * Vehicle number.
   */
  const vehicleMatch =
    text.match(
      /vehicle\s*(?:no|number)?\s*[:#-]?\s*([A-Z0-9 -]{5,20})/i
    );

  if (vehicleMatch) {
    vehicleNumber =
      vehicleMatch[1].trim();
  }

  /*
   * Common MyBusYatra service names.
   */
  const servicePatterns = [
    /KSRTC\s+(?:SUPER DELUXE AIR BUS|PREMIUM SUPERFAST|SUPER FAST|FAST PASSENGER|LIMITED STOP FAST PASSENGER|LIMITED STOP ORDINARY|TOWN TO TOWN ORDINARY|MINNAL DELUXE|ORDINARY|AC SEATER)/i,

    /KSRTC\.\s*(?:SUPER FAST|FAST PASSENGER|PREMIUM SUPERFAST)/i,

    /[A-Z][A-Z .-]{4,}\s+(?:PRIVATE BUS|PRIVATE)/i,
  ];

  for (
    const pattern of servicePatterns
  ) {
    const match =
      text.match(pattern);

    if (match) {
      serviceName =
        match[0]
          .replace(
            /\s+/g,
            " "
          )
          .trim();

      break;
    }
  }

  /*
   * Try route/direction information.
   */
  const directionMatch =
    text.match(
      /([A-Za-z .'-]{2,})\s*→\s*([A-Za-z .'-]{2,})/i
    );

  if (directionMatch) {
    direction =
      `${directionMatch[1].trim()} → ${directionMatch[2].trim()}`;

    routeName =
      direction;
  }

  /*
   * If no service was found from the page,
   * inspect individual lines.
   */
  if (
    serviceName === "KSRTC"
  ) {
    for (const line of lines) {
      if (
        /KSRTC/i.test(line) ||
        /Private Bus/i.test(line)
      ) {
        serviceName =
          line
            .replace(
              /\s+/g,
              " "
            )
            .trim()
            .slice(0, 120);

        break;
      }
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
 * ---------------------------------------------------------
 * CREATE TRIP FROM MYBUSYATRA ROUTE
 * ---------------------------------------------------------
 */

function createMyBusYatraTrip(
  route: MyBusYatraRouteStop[],
  service: MyBusYatraService,
  index: number
): TransportTrip | null {
  if (
    route.length < 2
  ) {
    return null;
  }

  const stops: ScheduledStop[] =
    route.map(
      (item, sequence) => ({
        stop: {
          id: makeStopId(
            item.name
          ),
          name: item.name,
        },

        sequence,

        arrivalTime:
          item.arrival ?? null,

        departureTime:
          item.departure ?? null,
      })
    );

  const isKsrtc =
    /ksrtc|kerala state road/i.test(
      service.serviceName
    ) ||
    /ksrtc/i.test(
      service.routeName ?? ""
    );

  return {
    id:
      `mybusyatra-${service.vehicleNumber || "service"}-${index}-${service.serviceName}`
          .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        "-"
      ),

    vehicleNumber:
      service.vehicleNumber,

    serviceName:
      service.serviceName,

    operator:
      isKsrtc
        ? "KSRTC"
        : "Private Bus",

    mode: "bus",

    source:
      "mybusyatra",

    stops,

    isLive: false,
  };
}

/*
 * ---------------------------------------------------------
 * FETCH ONE MYBUSYATRA SERVICE PAGE
 * ---------------------------------------------------------
 */

async function fetchMyBusYatraService(
  url: string,
  index: number
): Promise<TransportTrip | null> {
  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            Accept:
              "text/html,application/xhtml+xml",
            "User-Agent":
              "Mozilla/5.0",
          },
          cache:
            "no-store",
        }
      );

    if (!response.ok) {
      return null;
    }

    const html =
      await response.text();

    const route =
      extractMyBusYatraRoute(
        html
      );

    if (
      route.length < 2
    ) {
      return null;
    }

    const service =
      extractMyBusYatraService(
        html
      );

    if (!service) {
      return null;
    }

    return createMyBusYatraTrip(
      route,
      service,
      index
    );
  } catch (error) {
    console.warn(
      "MyBusYatra service failed:",
      error
    );

    return null;
  }
}

/*
 * ---------------------------------------------------------
 * PARSE MYBUSYATRA TIMETABLE ROWS
 * ---------------------------------------------------------
 */

function parseMyBusYatraTimetableRows(
  html: string,
  from: string,
  to: string
): TransportTrip[] {
  const lines =
    htmlToLines(html);

  const trips: TransportTrip[] =
    [];

  const timePattern =
    /\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b/gi;

  let index = 0;

  for (const line of lines) {
    const times =
      line.match(timePattern);

    if (
      !times ||
      times.length < 2
    ) {
      continue;
    }

    const hasBusIndicator =
      /KSRTC|PRIVATE BUS|BUS/i.test(
        line
      );

    if (!hasBusIndicator) {
      continue;
    }

    const fromName =
      resolveStopName(from);

    const toName =
      resolveStopName(to);

    let serviceName =
      "Bus Service";

    const serviceMatch =
      line.match(
        /(KSRTC[^|]+|[^|]+PRIVATE BUS[^|]*)/i
      );

    if (serviceMatch) {
      serviceName =
        serviceMatch[1]
          .replace(
            /\s+/g,
            " "
          )
          .trim()
          .slice(0, 120);
    }

    const isKsrtc =
      /KSRTC/i.test(
        serviceName
      );

    const departure =
      times[0];

    const arrival =
      times[1];

    const stops: ScheduledStop[] =
      [
        {
          stop: {
            id: makeStopId(
              fromName
            ),
            name: fromName,
          },

          sequence: 0,

          arrivalTime:
            departure,

          departureTime:
            departure,
        },

        {
          stop: {
            id: makeStopId(
              toName
            ),
            name: toName,
          },

          sequence: 1,

          arrivalTime:
            arrival,

          departureTime:
            arrival,
        },
      ];

    const vehicleMatch =
      line.match(
        /\b(KL\s*[-A-Z0-9]{5,})\b/i
      );

    trips.push({
      id:
        `mybusyatra-row-${index++}-${departure}-${arrival}-${serviceName}`
          .toLowerCase()
          .replace(
            /[^a-z0-9]+/g,
            "-"
          ),

      vehicleNumber:
        vehicleMatch?.[1],

      serviceName,

      operator:
        isKsrtc
          ? "KSRTC"
          : "Private Bus",

      mode: "bus",

      source:
        "mybusyatra",

      stops,

      isLive: false,
    });
  }

  return trips;
}

/*
 * ---------------------------------------------------------
 * MYBUSYATRA FETCH
 * ---------------------------------------------------------
 */

async function fetchFromMyBusYatra(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const timetableUrl =
    myBusYatraTimetableUrl(
      from,
      to
    );

  try {
    const response =
      await fetch(
        timetableUrl,
        {
          headers: {
            Accept:
              "text/html,application/xhtml+xml",
            "User-Agent":
              "Mozilla/5.0",
          },
          cache:
            "no-store",
        }
      );

    if (!response.ok) {
      return [];
    }

    const html =
      await response.text();

    const trips: TransportTrip[] =
      [];

    /*
     * First parse service/detail links.
     */
    const detailLinks =
      extractMyBusYatraDetailLinks(
        html
      );

    /*
     * Limit requests so Vercel is not
     * overloaded.
     */
    const limitedLinks =
      detailLinks.slice(0, 40);

    const detailResults =
      await Promise.all(
        limitedLinks.map(
          (url, index) =>
            fetchMyBusYatraService(
              url,
              index
            )
        )
      );

    for (const trip of detailResults) {
      if (trip) {
        trips.push(trip);
      }
    }

    /*
     * Also parse the timetable itself.
     *
     * This gives us a fallback when a
     * service-detail link cannot be found.
     */
    const rowTrips =
      parseMyBusYatraTimetableRows(
        html,
        from,
        to
      );

    trips.push(
      ...rowTrips
    );

    /*
     * Only return buses that actually
     * contain the searched stops in
     * the correct order.
     */
    return findDirectTrips(
      trips,
      from,
      to
    );
  } catch (error) {
    console.warn(
      "MyBusYatra timetable failed:",
      error
    );

    return [];
  }
}

/*
 * ---------------------------------------------------------
 * DEDUPLICATION
 * ---------------------------------------------------------
 */

function dedupeTrips(
  trips: TransportTrip[]
): TransportTrip[] {
  const seen =
    new Set<string>();

  const result:
    TransportTrip[] = [];

  for (const trip of trips) {
    const firstStop =
      trip.stops[0];

    const lastStop =
      trip.stops[
        trip.stops.length - 1
      ];

    const departure =
      firstStop?.departureTime ??
      firstStop?.arrivalTime ??
      "";

    const arrival =
      lastStop?.arrivalTime ??
      lastStop?.departureTime ??
      "";

    const route =
      trip.stops
        .map(
          (stop) =>
            `${stop.stop.name}:${stop.arrivalTime ?? ""}:${stop.departureTime ?? ""}`
        )
        .join("|");

    const key = [
      trip.operator ?? "",
      trip.vehicleNumber ?? "",
      trip.serviceName ?? "",
      trip.source ?? "",
      departure,
      arrival,
      route,
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
 * ---------------------------------------------------------
 * MAIN SEARCH
 * ---------------------------------------------------------
 */

export async function searchTransport(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const resolvedFrom =
    resolveStopName(from);

  const resolvedTo =
    resolveStopName(to);

  if (
    !resolvedFrom ||
    !resolvedTo
  ) {
    return {
      from: resolvedFrom,
      to: resolvedTo,
      directJourneys: [],
      connectingJourneys: [],
      searchedAt:
        new Date().toISOString(),
    };
  }

  if (
    normalizeName(
      resolvedFrom
    ) ===
    normalizeName(
      resolvedTo
    )
  ) {
    return {
      from: resolvedFrom,
      to: resolvedTo,
      directJourneys: [],
      connectingJourneys: [],
      searchedAt:
        new Date().toISOString(),
    };
  }

  /*
   * Fetch all sources independently.
   *
   * If one source fails, the other
   * sources still work.
   */
  const [
    apiTrips,
    datasetTrips,
    myBusYatraTrips,
  ] = await Promise.all([
    fetchFromScheduleApi(
      resolvedFrom,
      resolvedTo
    ),

    fetchFromDataset(),

    fetchFromMyBusYatra(
      resolvedFrom,
      resolvedTo
    ),
  ]);

  /*
   * Dataset contains complete routes.
   */
  const privateDatasetTrips =
    findDirectTrips(
      datasetTrips,
      resolvedFrom,
      resolvedTo
    );

  /*
   * Validate API results too.
   */
  const privateApiDirectTrips =
    findDirectTrips(
      apiTrips,
      resolvedFrom,
      resolvedTo
    );

  /*
   * Validate MyBusYatra results.
   */
  const ksrtcTrips =
    findDirectTrips(
      myBusYatraTrips,
      resolvedFrom,
      resolvedTo
    );

  const allTrips =
    dedupeTrips([
      ...privateApiDirectTrips,
      ...privateDatasetTrips,
      ...ksrtcTrips,
    ]);

  console.log(
    "GECW Go search:",
    `${resolvedFrom} -> ${resolvedTo}`,
    {
      privateApi:
        privateApiDirectTrips.length,

      privateDataset:
        privateDatasetTrips.length,

      myBusYatra:
        ksrtcTrips.length,

      total:
        allTrips.length,
    }
  );

  return createSearchResult(
    resolvedFrom,
    resolvedTo,
    allTrips
  );
}

/*
 * ---------------------------------------------------------
 * COMPATIBILITY EXPORT
 * ---------------------------------------------------------
 */

export async function searchBuses(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  return searchTransport(
    from,
    to
  );
}
