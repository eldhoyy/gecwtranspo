import type { TransportSearchResult, TransportTrip } from "@/lib/types";
import { createSearchResult } from "../normalize";

const MYBUSYATRA_BASE_URL = "https://www.mybusyatra.in";

function normalize(value: string): string { return value.trim().toLowerCase().replace(/[.,/()\-–—]+/g, " ").replace(/\s+/g, " "); }
function slugify(value: string): string { return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function stopSlug(value: string): string {
  const n = normalize(value);
  const overrides: Record<string, string> = { gecw: "thalappuzha", "gec wayanad": "thalappuzha", thalapuzha: "thalappuzha", "sulthan bathery": "sulthan-bathery", "sultan bathery": "sulthan-bathery", kozhikode: "kozhikode", calicut: "kozhikode" };
  return overrides[n] ?? slugify(value);
}
function timetableUrl(from: string, to: string): string { return `${MYBUSYATRA_BASE_URL}/bus-timing-from-${stopSlug(from)}-to-${stopSlug(to)}`; }
function decodeHtml(value: string): string { return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">"); }
function htmlToLines(value: string): string[] {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, "\n").replace(/<style[\s\S]*?<\/style>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:div|p|li|tr|td|th|h[1-6])>/gi, "\n").replace(/<[^>]+>/g, " ")).split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}
function parseTime(value: string): number | null { const m = value.match(/^(\d{1,2}):(\d{2})$/); if (!m) return null; const h = Number(m[1]); const min = Number(m[2]); return h <= 23 && min <= 59 ? h * 60 + min : null; }
function buildTrip(from: string, to: string, departure: string, arrival: string, title: string, index: number): TransportTrip {
  const isKsrtc = /\bksrtc\b/i.test(title);
  return { id: `mybusyatra-${slugify(title || "bus")}-${departure.replace(":", "")}-${arrival.replace(":", "")}-${index}`, serviceName: title || "Bus Service", operator: isKsrtc ? "KSRTC" : "Private Bus", mode: "bus", source: isKsrtc ? "ksrtc" : "private-bus-api", stops: [{ stop: { id: `from-${slugify(from)}`, name: from }, sequence: 0, arrivalTime: departure, departureTime: departure }, { stop: { id: `to-${slugify(to)}`, name: to }, sequence: 1, arrivalTime: arrival, departureTime: arrival }], isLive: false };
}
function extractTrips(html: string, from: string, to: string): TransportTrip[] {
  const trips: TransportTrip[] = []; const seen = new Set<string>();
  const add = (departure: string, arrival: string, title: string) => { const clean = title.replace(/\s+/g, " ").trim(); const key = `${departure}|${arrival}|${clean}`; if (seen.has(key)) return; seen.add(key); trips.push(buildTrip(from, to, departure, arrival, clean, trips.length)); };
  const linkRegex = /<a\b[^>]*>([\s\S]*?)<\/a>/gi; let link: RegExpExecArray | null;
  while ((link = linkRegex.exec(html))) { const text = decodeHtml(link[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(); const m = text.match(/(\d{1,2}:\d{2})\s*[➔→]\s*(\d{1,2}:\d{2})\s*(?:\d+\s*m)?\s*(.*)$/i); if (m) add(m[1], m[2], m[3]); }
  for (const line of htmlToLines(html)) { const m = line.match(/(\d{1,2}:\d{2})\s*[➔→]\s*(\d{1,2}:\d{2})\s*(?:\d+\s*m)?\s*(.*)$/i); if (m) add(m[1], m[2], m[3]); }
  return trips;
}
export async function searchPublicTransport(from: string, to: string): Promise<TransportSearchResult> {
  const searchedAt = new Date().toISOString();
  try {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(timetableUrl(from, to), { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 GECW-Go/1.0" }, next: { revalidate: 300 }, signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) return { from, to, directJourneys: [], connectingJourneys: [], searchedAt };
    const trips = extractTrips(await response.text(), from, to);
    return { ...createSearchResult(from, to, trips), searchedAt };
  } catch (error) { console.warn("MyBusYatra timetable source failed:", error); return { from, to, directJourneys: [], connectingJourneys: [], searchedAt }; }
}
void parseTime;
