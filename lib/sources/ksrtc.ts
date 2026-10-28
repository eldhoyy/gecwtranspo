import type {
  ScheduledStop,
  TransportTrip,
} from "../types";

const KSRTC_BASE_URL =
  "https://www.ksrtcedp.com";

const KSRTC_ROUTE_URL =
  `${KSRTC_BASE_URL}/route/resultmapksrtc.php?placeid=63`;

type KsrtcRow = {
  id: string;
  departure: string;
  origin: string;
  serviceType: string;
  destination: string;
  phone?: string;
  via?: string;
  returnTime?: string;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[().,'’`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/\|/g, "")
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

function extractTime(value: string): string | null {
  const match = value.match(
    /\b([01]?\d|2[0-3]):([0-5]\d)\b/
  );

  if (!match) {
    return null;
  }

  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function extractRows(html: string): KsrtcRow[] {
  const rows: KsrtcRow[] = [];

  /*
   * The official KSRTC page is rendered as repeated
   * service blocks. We deliberately parse only the
   * information that the official listing actually exposes.
   *
   * We do NOT invent intermediate stops here.
   */

  const blockRegex =
    /<h5[^>]*>\s*([^<]+?)\s*<\/h5>[\s\S]{0,2500}?<h6[^>]*>\s*([^<]+?)\s*<\/h6>[\s\S]{0,2500}?<h6[^>]*>\s*([^<]+?)\s*<\/h6>/gi;

  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = blockRegex.exec(html))) {
    const first = clean(match[1]);
    const serviceType = clean(match[2]);
    const second = clean(match[3]);

    const departure =
      extractTime(first);

    if (!departure) {
      continue;
    }

    /*
     * The official page structure can vary slightly.
     * Therefore try to identify origin/destination
     * from the surrounding block.
     */

    const surrounding =
      html.slice(
        Math.max(0, match.index - 200),
        Math.min(
          html.length,
          match.index + match[0].length + 2200
        )
      );

    const times = [
      ...surrounding.matchAll(
        /\b([01]?\d|2[0-3]):([0-5]\d)\b/g
      ),
    ];

    const uniqueTimes = [
      ...new Set(
        times.map(
          (x) =>
            `${x[1].padStart(2, "0")}:${x[2]}`
        )
      ),
    ];

    const destinationCandidate =
      second
        .replace(
          /\b([01]?\d|2[0-3]):([0-5]\d)\b/g,
          ""
        )
        .trim();

    if (!first || !destinationCandidate) {
      continue;
    }

    rows.push({
      id:
        `ksrtc-official-${index++}-` +
        `${normalize(first)}-` +
        `${normalize(destinationCandidate)}`,
      departure,
      origin: first
        .replace(
          /\b([01]?\d|2[0-3]):([0-5]\d)\b/g,
          ""
        )
        .trim(),
      serviceType,
      destination:
        destinationCandidate,
      via:
        surrounding
          .match(
            /([A-Z][A-Z0-9 .&-]{2,})\s*\|\s*[A-Z0-9-]+(?:-[A-Z0-9-]+)+/
          )?.[1]
          ?.trim(),
      returnTime:
        uniqueTimes.length > 1
          ? uniqueTimes[uniqueTimes.length - 1]
          : undefined,
    });
  }

  return rows;
}

function rowToTrip(
  row: KsrtcRow
): TransportTrip {
  const originStop = {
    id:
      `ksrtc-${normalize(row.origin)
        .replace(/\s+/g, "-")}`,
    name: row.origin,
    placeName: row.origin,
  };

  const destinationStop = {
    id:
      `ksrtc-${normalize(row.destination)
        .replace(/\s+/g, "-")}`,
    name: row.destination,
    placeName: row.destination,
  };

  const stops: ScheduledStop[] = [
    {
      stop: originStop,
      sequence: 0,
      arrivalTime: null,
      departureTime: row.departure,
    },
    {
      stop: destinationStop,
      sequence: 1,
      arrivalTime: row.returnTime ?? null,
      departureTime: null,
    },
  ];

  return {
    id: row.id,
    vehicleNumber: undefined,
    serviceName:
      `${row.origin} → ${row.destination}`,
    operator: "KSRTC",
    mode: "bus",
    source: "ksrtc",
    stops,
    isLive: false,
  };
}

async function fetchOfficialKsrtcPage(): Promise<string> {
  const response = await fetch(
    KSRTC_ROUTE_URL,
    {
      cache: "no-store",
      headers: {
        Accept:
          "text/html,application/xhtml+xml",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `KSRTC request failed: ${response.status}`
    );
  }

  return response.text();
}

export async function fetchAllKsrtcTrips(): Promise<
  TransportTrip[]
> {
  try {
    const html =
      await fetchOfficialKsrtcPage();

    const rows =
      extractRows(html);

    return rows.map(rowToTrip);
  } catch (error) {
    console.error(
      "KSRTC source error:",
      error
    );

    return [];
  }
}

export async function getKsrtcTrips(
  from: string,
  to: string
): Promise<TransportTrip[]> {
  const trips =
    await fetchAllKsrtcTrips();

  return trips.filter((trip) => {
    const fromIndex =
      trip.stops.findIndex((stop) =>
        matchesStop(
          stop.stop.name,
          from
        )
      );

    const toIndex =
      trip.stops.findIndex((stop) =>
        matchesStop(
          stop.stop.name,
          to
        )
      );

    return (
      fromIndex >= 0 &&
      toIndex >= 0 &&
      fromIndex < toIndex
    );
  });
}
