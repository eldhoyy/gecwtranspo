import type { ScheduledStop, TransportTrip } from "../types";
import { getStopNameVariants } from "../stops";

const KSRTC_LIST_URL = "https://www.ksrtcedp.com/route/resultmapksrtc.php?placeid=63";
const KSRTC_BASE_URL = "https://www.ksrtcedp.com";

type KsrtcDetailLink = { url: string; id: string };

function normalize(value: string): string { return value.toLowerCase().replace(/[.,/()'’`-]+/g, " ").replace(/\s+/g, " ").trim(); }
function slugify(value: string): string { return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function decodeHtml(value: string): string { return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))); }
function cleanHtmlText(html: string): string { return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(td|th|tr|li|p|div|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n"); }
function normalizeTime(value: string): string | null { const match = value.match(/\b(\d{1,2}):(\d{2})\b/); if (!match) return null; const hour = Number(match[1]); const minute = Number(match[2]); return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}` : null; }

function equivalentStop(a: string, b: string): boolean {
  const left = new Set(getStopNameVariants(a).map(normalize));
  const right = new Set(getStopNameVariants(b).map(normalize));
  if ([...left].some((x) => right.has(x))) return true;
  const compact = (x: string) => x.replace(/[^a-z0-9]/g, "");
  return [...left].some((x) => [...right].some((y) => compact(x) === compact(y)));
}

function matchesRequested(stopName: string, requested: string): boolean {
  const actual = normalize(stopName);
  return equivalentStop(stopName, requested) || getStopNameVariants(requested).some((v) => {
    const r = normalize(v);
    return actual === r || actual.includes(r) || r.includes(actual);
  });
}

function extractDetailLinks(html: string): KsrtcDetailLink[] {
  const result: KsrtcDetailLink[] = [];
  const seen = new Set<string>();
  const regex = /href\s*=\s*["']([^"']*viewshedulepass\.php[^"']*)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html))) {
    let url = decodeHtml(match[1]);
    if (!url.startsWith("http")) url = url.startsWith("/") ? `${KSRTC_BASE_URL}${url}` : `${KSRTC_BASE_URL}/route/${url}`;
    if (seen.has(url)) continue;
    seen.add(url);
    result.push({ url, id: `ksrtc-detail-${result.length}` });
  }
  return result;
}

function extractPassingStations(html: string): ScheduledStop[] {
  const stops: ScheduledStop[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html))) {
    const cells: string[] = [];
    const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) cells.push(decodeHtml(cellMatch[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim());
    if (cells.length < 3) continue;
    if (/^sl\s*no\.?$/i.test(normalize(cells[0]))) continue;
    let place = ""; let arrival: string | null = null; let departure: string | null = null;
    for (const cell of cells) {
      const time = normalizeTime(cell);
      if (time && !arrival) { arrival = time; continue; }
      if (time && arrival && !departure) { departure = time; continue; }
      if (!place && cell && !/^\d+$/.test(cell) && !time) place = cell;
    }
    if (!place) continue;
    const ignored = new Set(["place", "arrival time", "departure time", "passing through stations", "source", "destination", "via", "bus type"]);
    if (ignored.has(normalize(place))) continue;
    stops.push({ stop: { id: `ksrtc-${slugify(place)}`, name: place, placeName: place }, sequence: stops.length, arrivalTime: arrival, departureTime: departure ?? arrival });
  }
  return stops.length >= 2 ? dedupeStops(stops) : extractPassingStationsFromText(html);
}

function extractPassingStationsFromText(html: string): ScheduledStop[] {
  const lines = cleanHtmlText(html).split("\n");
  const result: ScheduledStop[] = [];
  let started = false;
  for (const line of lines) {
    if (normalize(line).includes("passing through stations")) { started = true; continue; }
    if (!started) continue;
    if ((normalize(line) === "image" || normalize(line).includes("fare")) && result.length >= 2) break;
    const timeMatch = line.match(/\b\d{1,2}:\d{2}\b/);
    if (!timeMatch) continue;
    const time = normalizeTime(timeMatch[0]);
    const place = line.replace(/\b\d{1,2}:\d{2}\b/g, "").replace(/^\d+\s*/, "").trim();
    if (!time || !place || /^\d+$/.test(place)) continue;
    result.push({ stop: { id: `ksrtc-${slugify(place)}`, name: place, placeName: place }, sequence: result.length, arrivalTime: time, departureTime: time });
  }
  return dedupeStops(result);
}

function dedupeStops(stops: ScheduledStop[]): ScheduledStop[] {
  const seen = new Set<string>();
  return stops.filter((stop) => { const key = normalize(stop.stop.name); if (!key || seen.has(key)) return false; seen.add(key); return true; }).map((stop, index) => ({ ...stop, sequence: index }));
}

async function fetchKsrtcDetail(link: KsrtcDetailLink): Promise<TransportTrip | null> {
  try {
    const response = await fetch(link.url, { headers: { Accept: "text/html,application/xhtml+xml" }, next: { revalidate: 3600 } });
    if (!response.ok) return null;
    const stops = extractPassingStations(await response.text());
    if (stops.length < 2) return null;
    return { id: `ksrtc-${slugify(`${stops[0].stop.name}-${stops[stops.length - 1].stop.name}-${link.id}`)}`, operator: "KSRTC", mode: "bus", source: "ksrtc", stops, isLive: false, lastUpdated: new Date().toISOString() };
  } catch { return null; }
}

export async function fetchAllKsrtcTrips(): Promise<TransportTrip[]> {
  try {
    const response = await fetch(KSRTC_LIST_URL, { headers: { Accept: "text/html,application/xhtml+xml" }, next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const links = extractDetailLinks(await response.text());
    if (!links.length) return [];
    const trips: TransportTrip[] = [];
    const batchSize = 24;
    for (let i = 0; i < links.length; i += batchSize) {
      const results = await Promise.all(links.slice(i, i + batchSize).map(fetchKsrtcDetail));
      for (const trip of results) if (trip) trips.push(trip);
    }
    return trips;
  } catch { return []; }
}

let ksrtcRouteCache: { trips: TransportTrip[]; expiresAt: number } | null = null;
let ksrtcLoading: Promise<TransportTrip[]> | null = null;
const KSRTC_CACHE_TIME = 1000 * 60 * 60;

export async function getKsrtcTrips(from: string, to: string): Promise<TransportTrip[]> {
  const now = Date.now();
  if (ksrtcRouteCache && ksrtcRouteCache.expiresAt > now) return findKsrtcDirectTrips(ksrtcRouteCache.trips, from, to);
  if (!ksrtcLoading) {
    ksrtcLoading = fetchAllKsrtcTrips().then((trips) => { ksrtcRouteCache = { trips, expiresAt: Date.now() + KSRTC_CACHE_TIME }; return trips; }).finally(() => { ksrtcLoading = null; });
  }
  return findKsrtcDirectTrips(await ksrtcLoading, from, to);
}

function findKsrtcDirectTrips(trips: TransportTrip[], from: string, to: string): TransportTrip[] {
  return trips.filter((trip) => {
    if (!trip.stops || trip.stops.length < 2) return false;
    const fromIndex = trip.stops.findIndex((stop) => matchesRequested(stop.stop.name, from));
    const toIndex = trip.stops.findIndex((stop) => matchesRequested(stop.stop.name, to));
    return fromIndex >= 0 && toIndex >= 0 && fromIndex < toIndex;
  });
}
