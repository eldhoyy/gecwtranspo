import type { ScheduledStop, TransportTrip } from "@/lib/types";
import { getStopNameVariants } from "@/lib/stops";

const BASE = "https://evidebus.com";

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[.,/()\-–—]+/g, " ").replace(/\s+/g, " ");
}

function slug(value: string): string {
  return norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function time(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  if (!match[3]) return `${String(hour).padStart(2, "0")}:${match[2]}`;
  let h = hour % 12;
  if (match[3].toLowerCase() === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${match[2]}`;
}

function stopMatches(actual: string, requested: string): boolean {
  const a = norm(actual);
  return getStopNameVariants(requested).some((candidate) => {
    const b = norm(candidate);
    return a === b || a.includes(b) || b.includes(a) || a.replace(/[^a-z0-9]/g, "") === b.replace(/[^a-z0-9]/g, "");
  });
}

function makeStop(name: string, sequence: number, arrival: unknown, departure: unknown): ScheduledStop {
  return {
    stop: { id: `evidebus-${slug(name)}`, name: name.trim() },
    sequence,
    arrivalTime: time(arrival),
    departureTime: time(departure),
  };
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseTableRows(html: string): { name: string; arrival: string | null; departure: string | null }[] {
  const rows: { name: string; arrival: string | null; departure: string | null }[] = [];
  const trMatches = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];

  for (const row of trMatches) {
    const cells = (row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) ?? []).map(stripHtml).filter(Boolean);
    if (cells.length < 2) continue;

    const times = cells.map(time).filter((v): v is string => Boolean(v));
    if (!times.length) continue;

    // Evidebus currently exposes stop-by-stop schedules as Stop Name + Time.
    // If a future page exposes separate arrival/departure columns, retain both.
    const nameCell = cells.find((cell) => !time(cell));
    if (!nameCell) continue;

    rows.push({
      name: nameCell,
      arrival: times[0] ?? null,
      departure: times[1] ?? times[0] ?? null,
    });
  }

  return rows;
}

function parseTextSchedule(html: string): { name: string; arrival: string | null; departure: string | null }[] {
  const text = stripHtml(html);
  const rows: { name: string; arrival: string | null; departure: string | null }[] = [];
  const pattern = /(?:^|\s)([A-Z][A-Z0-9 .'-]{2,80}?)(?:\s+)(\d{1,2}:\d{2}\s*(?:AM|PM)?)(?=\s|$)/gi;

  for (const match of text.matchAll(pattern)) {
    const name = match[1].trim();
    const t = time(match[2]);
    if (!t || /^(STOP ORDER|STOP NAME|ARRIVAL TIME|DEPARTURE|ROUTE)$/i.test(name)) continue;
    rows.push({ name, arrival: t, departure: t });
  }

  return rows;
}

function parseRoutePage(html: string, from: string, to: string, requestedUrl: string): TransportTrip[] {
  const parsed = parseTableRows(html);
  const rows = parsed.length >= 2 ? parsed : parseTextSchedule(html);
  if (rows.length < 2) return [];

  const unique: typeof rows = [];
  for (const row of rows) {
    if (!unique.some((x) => norm(x.name) === norm(row.name) && x.arrival === row.arrival && x.departure === row.departure)) {
      unique.push(row);
    }
  }

  const fi = unique.findIndex((x) => stopMatches(x.name, from));
  const ti = unique.findIndex((x) => stopMatches(x.name, to));
  if (fi < 0 || ti < 0 || fi >= ti) return [];

  const pageText = stripHtml(html);
  const heading = pageText.match(/(?:KSRTC|Private)[^|]{0,120}/i)?.[0]?.trim();
  const isKsrtc = /KSRTC/i.test(pageText) && !/Private Bus/i.test(heading || "");

  return [{
    id: `evidebus-${slug(requestedUrl)}`,
    serviceName: heading || (isKsrtc ? "KSRTC service" : "Private Bus service"),
    operator: isKsrtc ? "KSRTC" : "Private Bus",
    mode: "bus",
    source: "evidebus",
    stops: unique.map((x, i) => makeStop(x.name, i, x.arrival, x.departure)),
    isLive: /live status|live tracking|live arrival/i.test(pageText),
    lastUpdated: new Date().toISOString(),
  }];
}

async function fetchPage(url: string, from: string, to: string): Promise<TransportTrip[]> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml" },
      next: { revalidate: 900 },
    });
    if (!response.ok) return [];
    return parseRoutePage(await response.text(), from, to, url);
  } catch {
    return [];
  }
}

function routeUrls(from: string, to: string): string[] {
  const f = slug(from);
  const t = slug(to);
  // The /bus/ pages are indexed by Evidebus and contain complete stop-by-stop
  // schedules. Search pages are kept as fallbacks because their URL structure
  // can change independently of the individual bus pages.
  return [
    `${BASE}/bus-timing-from-${f}-to-${t}`,
    `${BASE}/bus-timing-from-${f}-to-${t}`.replace(/-thalapuzha-/g, "-thalappuzha-"),
  ];
}

export async function getEvidebusTrips(from: string, to: string): Promise<TransportTrip[]> {
  const trips = (await Promise.all(routeUrls(from, to).map((url) => fetchPage(url, from, to)))).flat();
  const seen = new Set<string>();
  return trips.filter((trip) => {
    const key = `${trip.operator}|${trip.serviceName}|${trip.stops.map((s) => `${norm(s.stop.name)}:${s.departureTime ?? ""}`).join(">")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
