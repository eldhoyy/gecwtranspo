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

function walk(value: unknown, out: unknown[], seen = new Set<unknown>()) {
  if (value === null || value === undefined || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out, seen);
    return;
  }
  const record = value as Record<string, unknown>;
  const name = record.name ?? record.station ?? record.stop ?? record.stopName ?? record.place;
  const departure = record.departure ?? record.departureTime ?? record.depTime ?? record.time;
  const arrival = record.arrival ?? record.arrivalTime ?? record.arrTime;
  if (typeof name === "string" && (time(departure) || time(arrival))) out.push(record);
  for (const child of Object.values(record)) walk(child, out, seen);
}

function parseRoutePage(html: string, from: string, to: string, requestedUrl: string): TransportTrip[] {
  const jsonBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const candidates: unknown[] = [];
  for (const block of jsonBlocks) {
    try { candidates.push(JSON.parse(block)); } catch { /* ignore malformed JSON-LD */ }
  }

  const rows: unknown[] = [];
  for (const candidate of candidates) walk(candidate, rows);

  const flat = rows.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      name: String(r.name ?? r.station ?? r.stop ?? r.stopName ?? "").trim(),
      arrival: r.arrival ?? r.arrivalTime ?? r.arrTime,
      departure: r.departure ?? r.departureTime ?? r.depTime ?? r.time,
    };
  }).filter((r) => r.name && (time(r.arrival) || time(r.departure)));

  if (flat.length < 2) return [];

  const unique: typeof flat = [];
  for (const row of flat) {
    if (!unique.some((x) => norm(x.name) === norm(row.name) && time(x.departure) === time(row.departure) && time(x.arrival) === time(row.arrival))) unique.push(row);
  }

  const fi = unique.findIndex((x) => stopMatches(x.name, from));
  const ti = unique.findIndex((x) => stopMatches(x.name, to));
  if (fi < 0 || ti < 0 || fi >= ti) return [];

  const relevant = unique.slice(0, unique.length);
  const vehicle = flat.find((x) => /private|ksrtc|super fast|fast passenger/i.test(x.name))?.name;
  return [{
    id: `evidebus-public-${slug(requestedUrl)}-${fi}-${ti}`,
    serviceName: vehicle || "Evidebus service",
    operator: /ksrtc/i.test(vehicle || "") ? "KSRTC" : "Private Bus",
    mode: "bus",
    source: "evidebus",
    stops: relevant.map((x, i) => makeStop(x.name, i, x.arrival, x.departure)),
    isLive: false,
    lastUpdated: new Date().toISOString(),
  }];
}

async function fetchPage(url: string, from: string, to: string): Promise<TransportTrip[]> {
  try {
    const response = await fetch(url, { headers: { Accept: "text/html,application/xhtml+xml" }, next: { revalidate: 900 } });
    if (!response.ok) return [];
    return parseRoutePage(await response.text(), from, to, url);
  } catch {
    return [];
  }
}

function routeUrls(from: string, to: string): string[] {
  const f = slug(from);
  const t = slug(to);
  const urls = [
    `${BASE}/bus-timing-from-${f}-to-${t}`,
    `${BASE}/buses/${f}-to-${t}`,
    `${BASE}/search/${f}/${t}`,
  ];
  return Array.from(new Set(urls));
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
