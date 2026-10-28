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

function convertApiTrip(
  trip: ApiTrip,
  index: number
): TransportTrip | null {
  const stops =
    convertStations(
      trip.stations
    );

  if (stops.length < 2) {
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
 * Find direct trips in the correct direction.
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
    await fetch(url, {
      headers: {
        Accept:
          "application/json",
      },
      cache:
        "no-store",
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
 * KSRTC + PRIVATE BUS
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
        /<\/(div|p|li|article|section|header|footer|h1|h2|h3|h4|h5|h6|br)>/gi,
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
    );
}

function extractMyBusYatraRows(
  html: string,
  from: string,
  to: string
): TransportTrip[] {
  const text =
    htmlToText(html);

  /*
   * MyBusYatra timetable rows use:
   *
   * 06:30➔06:50
   *
   * We capture each row until the
   * next timetable row.
   */
  const rowRegex =
    /(\d{1,2}:\d{2})\s*[➔→]\s*(\d{1,2}:\d{2})([\s\S]*?)(?=\d{1,2}:\d{2}\s*[➔→]|\n##|\Z)/g;

  const trips:
    TransportTrip[] = [];

  let match:
    RegExpExecArray | null;

  let index = 0;

  while (
    (match =
      rowRegex.exec(text))
  ) {
    const departureTime =
      match[1];

    const arrivalTime =
      match[2];

    const row =
      match[3]
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    if (!row) {
      continue;
    }

    const upper =
      row.toUpperCase();

    const isKsrtc =
      upper.includes(
        "KSRTC"
      );

    const isPrivate =
      upper.includes(
        "PRIVATE BUS"
      );

    /*
     * Ignore other operators for now.
     *
     * GECW Go currently promises
     * KSRTC + Private Bus.
     */
    if (
      !isKsrtc &&
      !isPrivate
    ) {
      continue;
    }

    let operator:
      string;

    let serviceName:
      string;

    if (isKsrtc) {
      operator =
        "KSRTC";

      const ksrtcIndex =
        upper.indexOf(
          "KSRTC"
        );

      const beforeKsrtc =
        row
          .slice(
            0,
            ksrtcIndex
          )
          .trim();

      /*
       * Usually the service name
       * starts with KSRTC itself.
       */
      serviceName =
        beforeKsrtc ||
        row
          .slice(
            0,
            Math.min(
              row.length,
              80
            )
          )
          .trim();

      if (
        !serviceName
      ) {
        serviceName =
          "KSRTC Bus";
      }
    } else {
      operator =
        "Private Bus";

      const privateIndex =
        upper.indexOf(
          "PRIVATE BUS"
        );

      serviceName =
        row
          .slice(
            0,
            privateIndex
          )
          .trim();

      if (
        !serviceName
      ) {
        serviceName =
          "Private Bus";
      }
    }

    /*
     * Clean service labels.
     */
    serviceName =
      serviceName
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    /*
     * Some KSRTC rows contain:
     *
     * KSRTC ORDINARY
     * KSRTC (Mananthavady Depot)
     *
     * Keep the useful service type.
     */
    if (
      isKsrtc &&
      !serviceName
        .toUpperCase()
        .includes(
          "KSRTC"
        )
    ) {
      serviceName =
        `KSRTC ${serviceName}`;
    }

    const fromStop:
      TransportStop = {
      id:
        makeStopId(
          from
        ),
      name:
        resolveStopName(
          from
        ),
    };

    const toStop:
      TransportStop = {
      id:
        makeStopId(
          to
        ),
      name:
        resolveStopName(
          to
        ),
    };

    trips.push({
      id:
        `mybusyatra-${operator}-${from}-${to}-${departureTime}-${arrivalTime}-${index}`
          .toLowerCase()
          .replace(
            /[^a-z0-9]+/g,
            "-"
          ),

      serviceName,

      operator,

      mode:
        "bus",

      source:
        "public-transport-api",

      stops: [
        {
          stop:
            fromStop,

          sequence: 0,

          arrivalTime:
            departureTime,

          departureTime:
            departureTime,
        },

        {
          stop:
            toStop,

          sequence: 1,

          arrivalTime:
            arrivalTime,

          departureTime:
            arrivalTime,
        },
      ],

      isLive:
        false,
    });

    index += 1;
  }

  return trips;
}

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

        /*
         * Don't request the
         * page on every search.
         */
        next: {
          revalidate:
            900,
        },
      }
    );

  if (!response.ok) {
    throw new Error(
      `MyBusYatra returned ${response.status}`
    );
  }

  const html =
    await response.text();

  return extractMyBusYatraRows(
    html,
    from,
    to
  );
}

/*
 * ----------------------------------------------------
 * DEDUPLICATION
 * ----------------------------------------------------
 */

function deduplicateTrips(
  trips: TransportTrip[]
): TransportTrip[] {
  const seen =
    new Set<string>();

  return trips.filter(
    (trip) => {
      const stopsKey =
        trip.stops
          .map(
            (stop) =>
              `${normalizeName(
                stop.stop.name
              )}:${stop.departureTime ?? ""}:${stop.arrivalTime ?? ""}`
          )
          .join("|");

      /*
       * IMPORTANT:
       *
       * Operator is part of the key.
       *
       * Therefore:
       *
       * 06:00 KSRTC
       * 06:00 Private
       *
       * are NEVER treated as duplicates.
       */
      const key =
        [
          trip.operator ??
            "",
          trip.vehicleNumber ??
            "",
          trip.serviceName ??
            "",
          stopsKey,
        ].join("|");

      if (
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

/*
 * ----------------------------------------------------
 * MAIN SEARCH
 * ----------------------------------------------------
 */

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
     * Search all sources together.
     *
     * 1. Existing private API
     * 2. Wayanad private dataset
     * 3. MyBusYatra
     *    -> KSRTC + private
     */
    const [
      apiResult,
      datasetResult,
      publicResult,
    ] =
      await Promise.allSettled([
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

    let allTrips:
      TransportTrip[] = [];

    if (
      apiResult.status ===
      "fulfilled"
    ) {
      allTrips.push(
        ...apiResult.value
      );
    } else {
      console.warn(
        "Private schedule API failed:",
        apiResult.reason
      );
    }

    if (
      datasetResult.status ===
      "fulfilled"
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

    if (
      publicResult.status ===
      "fulfilled"
    ) {
      allTrips.push(
        ...publicResult.value
      );
    } else {
      console.warn(
        "MyBusYatra source failed:",
        publicResult.reason
      );
    }

    /*
     * Remove genuine duplicates,
     * but NEVER merge KSRTC and
     * private services merely because
     * they have the same time.
     */
    allTrips =
      deduplicateTrips(
        allTrips
      );

    /*
     * Correct direction.
     */
    const directTrips =
      findDirectTrips(
        allTrips,
        resolvedFrom,
        resolvedTo
      );

    console.log(
      `GECW Go search: ${resolvedFrom} -> ${resolvedTo}`,
      `| source trips: ${allTrips.length}`,
      `| direct buses: ${directTrips.length}`
    );

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
      from:
        resolvedFrom,

      to:
        resolvedTo,

      directJourneys: [],

      connectingJourneys: [],

      searchedAt:
        new Date().toISOString(),
    };
  }
}
