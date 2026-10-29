import type { ScheduledStop, TransportTrip } from "../types";

const KBUS_BASE_URL = "https://www.kbuses.in/v3/Find/source";
const CACHE_TTL_MS = 15 * 60 * 1000;

let cache: {
  key: string;
  trips: TransportTrip[];
  expiresAt: number;
} | null = null;

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,/()'’`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: string): string {
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
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function textLines(html: string): string[] {
  const text = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/\s*(p|div|li|tr|td|th|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );

  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function timeToMinutes(value: string): number | null {
  const match = value.trim().toLowerCase().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (match[3] === "am" && hour === 12) hour = 0;
  if (match[3] === "pm" && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

function format24(value: string): string | null {
  const minutes = timeToMinutes(value);
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function routeNames(value: string): string[] {
  return value
    .split(/[⤞➜→]/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^route\s*/i, "").trim())
    .filter(Boolean);
}

function makeStops(names: string[], departure: string | null, arrival: string | null): ScheduledStop[] {
  return names.map((name, sequence) => ({
    stop: {
      id: `kbuses-${slug(name)}`,
      name,
      placeName: name,
    },
    sequence,
    arrivalTime: sequence === 0 ? departure : sequence === names.length - 1 ? arrival : null,
    departureTime: sequence === 0 ? departure : sequence === names.length - 1 ? arrival : null,
  }));
}

function isTimeLine(line: string): boolean {
  return /^\d{1,2}:\d{2}\s*(am|pm)\b/i.test(line.trim());
}

function parseTrips(html: string, requestedFrom: string, requestedTo: string): TransportTrip[] {
  const lines = textLines(html);
  const trips: TransportTrip[] = [];
  const fromNorm = normalize(requestedFrom);
  const toNorm = normalize(requestedTo);

  for (let i = 0; i < lines.length; i += 1) {
    if (!isTimeLine(lines[i])) continue;

    const departure = format24(lines[i].match(/^\d{1,2}:\d{2}\s*(?:am|pm)/i)?.[0] ?? "");
    if (!departure) continue;

    let arrival: string | null = null;
    const pair = lines[i].match(/^(\d{1,2}:\d{2}\s*(?:am|pm))\s*[➜→-]\s*(\d{1,2}:\d{2}\s*(?:am|pm))/i);
    if (pair) arrival = format24(pair[2]);

    let operatorLine = "";
    let serviceLine = "";
    let routeLine = "";

    for (let j = i + 1; j < Math.min(lines.length, i + 12); j += 1) {
      const line = lines[j];
      if (!operatorLine && /\bKSRTC\b|\bprivate\s+bus\b/i.test(line)) {
        operatorLine = line;
      }
      if (!routeLine && /⤞|➜|→/.test(line)) {
        routeLine = line.replace(/^Route\s*/i, "").trim();
        break;
      }
      if (!serviceLine && /(ordinary|fast|super|limited|express|deluxe|private)/i.test(line)) {
        serviceLine = line;
      }
    }

    if (!routeLine) continue;

    const names = routeNames(routeLine);
    if (names.length < 2) continue;

    const fromIndex = names.findIndex((name) => normalize(name) === fromNorm || normalize(name).includes(fromNorm) || fromNorm.includes(normalize(name)));
    const toIndex = names.findIndex((name) => normalize(name) === toNorm || normalize(name).includes(toNorm) || toNorm.includes(normalize(name)));
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= toIndex) continue;

    const operatorIsKsrtc = /\bKSRTC\b/i.test(operatorLine) || /\bKSRTC\b/i.test(serviceLine);
    const operator = operatorIsKsrtc ? "KSRTC" : (operatorLine || "Private Bus");
    const source = operatorIsKsrtc ? "ksrtc" : "private-bus-api";

    const serviceName = (operatorLine || serviceLine || "Bus service")
      .replace(/\s+/g, " ")
      .trim();

    const stops = makeStops(names, departure, arrival);
    const routeKey = names.map(normalize).join(">");
    const id = `kbuses-${slug(`${operator}-${departure}-${serviceName}-${routeKey}`)}`;

    trips.push({
      id,
      vehicleNumber: undefined,
      serviceName,
      operator,
      mode: "bus",
      source,
      stops,
      isLive: false,
    });
  }

  return dedupe(trips);
}

function dedupe(trips: TransportTrip[]): TransportTrip[] {
  const seen = new Set<string>();
  return trips.filter((trip) => {
    const key = [
      trip.source,
      trip.operator,
      trip.serviceName,
      trip.stops.map((s) => `${normalize(s.stop.name)}:${s.departureTime ?? ""}:${s.arrivalTime ?? ""}`).join("|"),
    ].join("###");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function urlPart(value: string): string {
  return slug(value);
}

export async function getKbusesTrips(from: string, to: string): Promise<TransportTrip[]> {
  const fromPart = urlPart(from);
  const toPart = urlPart(to);
  const key = `${fromPart}->${toPart}`;
  const now = Date.now();

  if (cache && cache.key === key && cache.expiresAt > now) return cache.trips;

  const url = `${KBUS_BASE_URL}/${encodeURIComponent(fromPart)}/destination/${encodeURIComponent(toPart)}/type/all/timing/now`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml" },
      cache: "no-store",
    });
    if (!response.ok) return [];
    const html = await response.text();
    const trips = parseTrips(html, from, to);
    cache = { key, trips, expiresAt: now + CACHE_TTL_MS };
    return trips;
  } catch (error) {
    console.warn("KBuses source failed:", error);
    return [];
  }
}
