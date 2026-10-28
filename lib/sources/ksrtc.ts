import type {
  ScheduledStop,
  TransportTrip,
} from "../types";

const KSRTC_LIST_URL =
  "https://www.ksrtcedp.com/route/resultmapksrtc.php?placeid=63";

const KSRTC_BASE_URL =
  "https://www.ksrtcedp.com";

type KsrtcDetailLink = {
  url: string;
  id: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,/()'’`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string): string {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(
        Number(code)
      )
    );
}

function cleanHtmlText(
  html: string
): string {
  return decodeHtml(
    html
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<br\s*\/?>/gi,
        "\n"
      )
      .replace(
        /<\/(td|th|tr|li|p|div|h[1-6])>/gi,
        "\n"
      )
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((line) =>
      line.replace(/\s+/g, " ").trim()
    )
    .filter(Boolean)
    .join("\n");
}

function normalizeTime(
  value: string
): string | null {
  const match = value.match(
    /\b(\d{1,2}):(\d{2})\b/
  );

  if (!match) {
    return null;
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
    return null;
  }

  return (
    `${hour.toString().padStart(2, "0")}:` +
    `${minute.toString().padStart(2, "0")}`
  );
}

function makeStop(
  name: string
): ScheduledStop {
  return {
    stop: {
      id:
        `ksrtc-${slugify(name)}`,
      name,
      placeName: name,
    },
    sequence: 0,
    arrivalTime: null,
    departureTime: null,
  };
}

/*
 * =========================================================
 * FIND OFFICIAL KSRTC DETAIL LINKS
 * =========================================================
 *
 * The main KSRTC page lists the services.
 *
 * Each service has a link similar to:
 *
 * viewshedulepass.php?... 
 *
 * That detail page contains:
 *
 * "Passing through stations"
 *
 * with the complete ordered route.
 *
 * This is the important part.
 * =========================================================
 */

function extractDetailLinks(
  html: string
): KsrtcDetailLink[] {
  const result: KsrtcDetailLink[] = [];

  const seen =
    new Set<string>();

  const regex =
    /href\s*=\s*["']([^"']*viewshedulepass\.php[^"']*)["']/gi;

  let match: RegExpExecArray | null;

  while (
    (match = regex.exec(html))
  ) {
    let url =
      decodeHtml(match[1]);

    if (
      !url.startsWith("http")
    ) {
      if (
        url.startsWith("/")
      ) {
        url =
          `${KSRTC_BASE_URL}${url}`;
      } else {
        url =
          `${KSRTC_BASE_URL}/route/${url}`;
      }
    }

    /*
     * Remove duplicate links.
     */

    if (seen.has(url)) {
      continue;
    }

    seen.add(url);

    result.push({
      url,
      id:
        `ksrtc-detail-${result.length}`,
    });
  }

  return result;
}

/*
 * =========================================================
 * EXTRACT TABLE ROWS FROM OFFICIAL DETAIL PAGE
 * =========================================================
 *
 * Official detail pages contain:
 *
 * Sl. No.
 * Place
 * Arrival Time
 * Departure Time
 *
 * Example:
 *
 * MANANTHAVADY 00:00 16:25
 * PANAMARAM    16:55 16:55
 * KALPETTA     17:10 17:10
 *
 * We parse table rows directly.
 * =========================================================
 */

function extractPassingStations(
  html: string
): ScheduledStop[] {
  const stops: ScheduledStop[] = [];

  /*
   * First try actual <tr> rows.
   */

  const rowRegex =
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch: RegExpExecArray | null;

  while (
    (rowMatch =
      rowRegex.exec(html))
  ) {
    const rowHtml =
      rowMatch[1];

    const cells: string[] = [];

    const cellRegex =
      /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;

    let cellMatch:
      | RegExpExecArray
      | null;

    while (
      (cellMatch =
        cellRegex.exec(rowHtml))
    ) {
      const text =
        decodeHtml(
          cellMatch[1]
            .replace(
              /<[^>]+>/g,
              " "
            )
        )
          .replace(/\s+/g, " ")
          .trim();

      cells.push(text);
    }

    if (
      cells.length < 3
    ) {
      continue;
    }

    /*
     * Ignore header rows.
     */

    const firstCell =
      normalize(cells[0]);

    if (
      firstCell === "sl no" ||
      firstCell === "sl no."
    ) {
      continue;
    }

    /*
     * Usually:
     *
     * [0] serial
     * [1] place
     * [2] arrival
     * [3] departure
     *
     * But some pages may omit serial.
     *
     * Detect the place/time positions.
     */

    let place =
      "";
    let arrival:
      string | null = null;
    let departure:
      string | null = null;

    for (
      let i = 0;
      i < cells.length;
      i++
    ) {
      const time =
        normalizeTime(
          cells[i]
        );

      if (
        time &&
        !arrival
      ) {
        arrival = time;
        continue;
      }

      if (
        time &&
        arrival &&
        !departure
      ) {
        departure = time;
        continue;
      }

      if (
        !place &&
        cells[i] &&
        !/^\d+$/.test(
          cells[i]
        ) &&
        !normalizeTime(
          cells[i]
        )
      ) {
        place = cells[i];
      }
    }

    if (!place) {
      continue;
    }

    /*
     * Avoid accidentally interpreting the service
     * header as a station.
     */

    const ignored = [
      "place",
      "arrival time",
      "departure time",
      "passing through stations",
      "source",
      "destination",
      "via",
      "bus type",
    ];

    if (
      ignored.includes(
        normalize(place)
      )
    ) {
      continue;
    }

    stops.push({
      stop: {
        id:
          `ksrtc-${slugify(
            place
          )}`,
        name: place,
        placeName: place,
      },

      sequence:
        stops.length,

      arrivalTime:
        arrival,

      departureTime:
        departure ?? arrival,
    });
  }

  /*
   * If table parsing didn't work, use the text
   * representation as a fallback.
   */

  if (
    stops.length < 2
  ) {
    return extractPassingStationsFromText(
      html
    );
  }

  return dedupeStops(
    stops
  );
}

function extractPassingStationsFromText(
  html: string
): ScheduledStop[] {
  const text =
    cleanHtmlText(html);

  const lines =
    text
      .split("\n")
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  const result:
    ScheduledStop[] = [];

  let started =
    false;

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i];

    if (
      normalize(line).includes(
        "passing through stations"
      )
    ) {
      started = true;
      continue;
    }

    if (!started) {
      continue;
    }

    /*
     * Stop reading when the page moves
     * to another major section.
     */

    if (
      normalize(line) ===
        "image" ||
      normalize(line).includes(
        "fare"
      )
    ) {
      if (
        result.length >= 2
      ) {
        break;
      }
    }

    const timeMatches =
      [
        ...line.matchAll(
          /\b(\d{1,2}):(\d{2})\b/g
        ),
      ];

    if (
      timeMatches.length === 0
    ) {
      continue;
    }

    const time =
      normalizeTime(
        timeMatches[0][0]
      );

    if (!time) {
      continue;
    }

    const place =
      line
        .replace(
          /\b\d{1,2}:\d{2}\b/g,
          ""
        )
        .replace(
          /^\d+\s*/,
          ""
        )
        .trim();

    if (
      !place ||
      /^\d+$/.test(place)
    ) {
      continue;
    }

    result.push({
      stop: {
        id:
          `ksrtc-${slugify(
            place
          )}`,
        name: place,
        placeName: place,
      },

      sequence:
        result.length,

      arrivalTime: time,

      departureTime: time,
    });
  }

  return dedupeStops(
    result
  );
}

function dedupeStops(
  stops: ScheduledStop[]
): ScheduledStop[] {
  const seen =
    new Set<string>();

  return stops
    .filter((stop) => {
      const key =
        normalize(
          stop.stop.name
        );

      if (
        !key ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map(
      (stop, index) => ({
        ...stop,
        sequence: index,
      })
    );
}

/*
 * =========================================================
 * SERVICE METADATA
 * =========================================================
 */

function extractServiceMetadata(
  html: string
) {
  const text =
    cleanHtmlText(html);

  const lines =
    text
      .split("\n")
      .map((line) =>
        line.trim()
      )
      .filter(Boolean);

  let source = "";
  let destination = "";
  let via = "";
  let busType = "";

  const scheduleLine =
    lines.find((line) =>
      /\bMANANTHAVADY\b/i.test(
        line
      )
    );

  /*
   * Look around the "Schedule information"
   * section instead of depending on one exact
   * HTML layout.
   */

  const scheduleIndex =
    lines.findIndex((line) =>
      normalize(line).includes(
        "shedule information"
      )
    );

  if (
    scheduleIndex >= 0
  ) {
    const area =
      lines.slice(
        scheduleIndex,
        scheduleIndex + 20
      );

    const timeIndex =
      area.findIndex((line) =>
        /\b\d{1,2}:\d{2}\b/.test(
          line
        )
      );

    if (
      timeIndex >= 0
    ) {
      /*
       * The detailed table itself will give us
       * the authoritative first and last stop,
       * so metadata here is only supplementary.
       */

      source =
        area
          .find(
            (line) =>
              normalize(
                line
              ) ===
              "source"
          ) ??
        "";

      destination =
        area
          .find(
            (line) =>
              normalize(
                line
              ) ===
              "destination"
          ) ??
        "";
    }
  }

  /*
   * Service type is usually visible as:
   *
   * FAST
   * SUPER FAST
   * SUPER EXPRESS
   * ORDINARY
   * etc.
   */

  const serviceTypes = [
    "SUPER DELUXE",
    "SUPER EXPRESS",
    "SUPER FAST",
    "SILVER LINE JET",
    "PREMIUM SUPERFAST",
    "L S SUPER FAST",
    "LS FAST",
    "FAST PASSENGER",
    "FAST",
    "ORDINARY",
  ];

  for (
    const type of serviceTypes
  ) {
    if (
      new RegExp(
        `\\b${type.replace(
          / /g,
          "\\s+"
        )}\\b`,
        "i"
      ).test(text)
    ) {
      busType = type;
      break;
    }
  }

  return {
    source,
    destination,
    via,
    busType,
    scheduleLine,
  };
}

/*
 * =========================================================
 * DETAIL PAGE -> TRANSPORT TRIP
 * =========================================================
 */

async function fetchKsrtcDetail(
  link: KsrtcDetailLink
): Promise<TransportTrip | null> {
  try {
    const response =
      await fetch(
        link.url,
        {
          headers: {
            Accept:
              "text/html,application/xhtml+xml",
          },
          cache: "no-store",
        }
      );

    if (!response.ok) {
      return null;
    }

    const html =
      await response.text();

    const stops =
      extractPassingStations(
        html
      );

    /*
     * A valid KSRTC detail page should have
     * at least two ordered stations.
     */

    if (
      stops.length < 2
    ) {
      return null;
    }

    const metadata =
      extractServiceMetadata(
        html
      );

    const firstStop =
      stops[0]?.stop.name ??
      "KSRTC";

    const lastStop =
      stops[
        stops.length - 1
      ]?.stop.name ??
      "Service";

    /*
     * Try to obtain the official schedule
     * departure time from the first stop.
     */

    const departure =
      stops[0]
        ?.departureTime ??
      null;

    const routeKey =
      stops
        .map(
          (stop) =>
            normalize(
              stop.stop.name
            )
        )
        .join("-");

    return {
      id:
        `ksrtc-${slugify(
          `${firstStop}-${lastStop}-${routeKey}-${link.id}`
        )}`,

      vehicleNumber:
        undefined,

      serviceName:
        `${firstStop} → ${lastStop}`,

      operator:
        "KSRTC",

      mode:
        "bus",

      source:
        "ksrtc",

      stops,

      isLive:
        false,

      lastUpdated:
        new Date().toISOString(),
    };
  } catch (error) {
    console.warn(
      "KSRTC detail failed:",
      link.url,
      error
    );

    return null;
  }
}

/*
 * =========================================================
 * GET ALL OFFICIAL KSRTC TRIPS
 * =========================================================
 */

export async function fetchAllKsrtcTrips(): Promise<
  TransportTrip[]
> {
  try {
    const response =
      await fetch(
        KSRTC_LIST_URL,
        {
          headers: {
            Accept:
              "text/html,application/xhtml+xml",
          },
          cache: "no-store",
        }
      );

    if (!response.ok) {
      console.warn(
        "KSRTC list status:",
        response.status
      );

      return [];
    }

    const html =
      await response.text();

    const links =
      extractDetailLinks(
        html
      );

    console.log(
      "KSRTC official detail links:",
      links.length
    );

    if (
      links.length === 0
    ) {
      console.warn(
        "No KSRTC detail links found."
      );

      return [];
    }

    /*
     * Fetch detail pages concurrently,
     * but in controlled batches.
     *
     * 288 services does NOT mean we should
     * fire 288 requests simultaneously.
     */

    const trips:
      TransportTrip[] = [];

    const batchSize =
      8;

    for (
      let i = 0;
      i < links.length;
      i += batchSize
    ) {
      const batch =
        links.slice(
          i,
          i + batchSize
        );

      const results =
        await Promise.all(
          batch.map(
            (link) =>
              fetchKsrtcDetail(
                link
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

    console.log(
      "KSRTC parsed trips:",
      trips.length
    );

    return trips;
  } catch (error) {
    console.error(
      "KSRTC source error:",
      error
    );

    return [];
  }
}

/*
 * =========================================================
 * SEARCH KSRTC TRIPS
 * =========================================================
 *
 * IMPORTANT:
 *
 * We search the COMPLETE official route.
 *
 * Therefore:
 *
 * MANANTHAVADY -> KALPETTA
 *
 * works when:
 *
 * MANANTHAVADY
 * PANAMARAM
 * KALPETTA
 *
 * exists in the official route.
 *
 * The same mechanism works for EVERY intermediate stop
 * present in the official KSRTC schedule.
 * =========================================================
 */
let ksrtcRouteCache: {
  trips: TransportTrip[];
  expiresAt: number;
} | null = null;

let ksrtcLoading: Promise<TransportTrip[]> | null = null;

const KSRTC_CACHE_TIME = 1000 * 60 * 60; // 1 hour

export async function getKsrtcTrips(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const now = Date.now();

  // Use the already-loaded complete KSRTC route database.
  if (
    ksrtcRouteCache &&
    ksrtcRouteCache.expiresAt > now
  ) {
    return findKsrtcDirectTrips(
      ksrtcRouteCache.trips,
      from,
      to
    );
  }

  // Prevent multiple searches from downloading
  // the complete KSRTC database simultaneously.
  if (!ksrtcLoading) {
    ksrtcLoading = fetchAllKsrtcTrips()
      .then((trips) => {
        ksrtcRouteCache = {
          trips,
          expiresAt:
            Date.now() +
            KSRTC_CACHE_TIME,
        };

        return trips;
      })
      .finally(() => {
        ksrtcLoading = null;
      });
  }

  const trips = await ksrtcLoading;

  return findKsrtcDirectTrips(
    trips,
    from,
    to
  );
}
function findKsrtcDirectTrips(
  trips: TransportTrip[],
  from: string,
  to: string
): TransportTrip[] {
  const fromName = normalize(from);
  const toName = normalize(to);

  return trips.filter((trip) => {
    if (
      !trip.stops ||
      trip.stops.length < 2
    ) {
      return false;
    }

    const fromIndex =
      trip.stops.findIndex(
        (stop) =>
          normalize(
            stop.stop.name
          ) === fromName ||
          normalize(
            stop.stop.name
          ).includes(fromName) ||
          fromName.includes(
            normalize(
              stop.stop.name
            )
          )
      );

    const toIndex =
      trip.stops.findIndex(
        (stop) =>
          normalize(
            stop.stop.name
          ) === toName ||
          normalize(
            stop.stop.name
          ).includes(toName) ||
          toName.includes(
            normalize(
              stop.stop.name
            )
          )
      );

    return (
      fromIndex >= 0 &&
      toIndex >= 0 &&
      fromIndex < toIndex
    );
  });
}
