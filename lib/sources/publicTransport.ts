import type { TransportSearchResult, TransportTrip } from "@/lib/types";
import { createSearchResult } from "../normalize";

const MYBUSYATRA_BASE_URL = "https://www.mybusyatra.in";

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[.,/()\-–—]+/g, " ").replace(/\s+/g, " ");
}

function slugify(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function stopSlug(value: string): string {
  const n = normalize(value);
  const overrides: Record<string, string> = {
    gecw: "thalappuzha",
    "gec wayanad": "thalappuzha",
    thalapuzha: "thalappuzha",
    thalappuzha: "thalappuzha",
    "sulthan bathery": "sulthan-bathery",
    "sultan bathery": "sulthan-bathery",
    kozhikode: "kozhikode",
    calicut: "kozhikode",
  };
  return overrides[n] ?? slugify(value);
}

function timetableUrl(from: string, to: string): string {
  return `${MYBUSYATRA_BASE_URL}/bus-timing-from-${stopSlug(from)}-to-${stopSlug(to)}`;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToLines(value: string): string[] {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<style[\s\S]*?<\/style>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p|li|tr|td|th|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/*
 * IMPORTANT SOURCE RULE:
 *
 * This timetable is only accepted when the service itself
 * explicitly identifies the operator as KSRTC or Private Bus.
 *
 * We never treat an unknown service as a private bus.
 * This prevents a KSRTC service such as 16:05 from becoming
 * a fake private bus at 16:05.
 */
function buildTrip(
  from: string,
  to: string,
  departure: string,
  arrival: string,
  title: string,
  index: number
): TransportTrip | null {
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  const isKsrtc = /\bksrtc\b/i.test(cleanTitle);
  const isPrivate = /\bprivate\s+bus\b/i.test(cleanTitle);

  if (!isKsrtc && !isPrivate) {
    return null;
  }

  return {
    id: `mybusyatra-${slugify(cleanTitle || "bus")}-${departure.replace(":", "")}-${arrival.replace(":", "")}-${index}`,
    serviceName: cleanTitle || (isKsrtc ? "KSRTC Bus" : "Private Bus"),
    operator: isKsrtc ? "KSRTC" : "Private Bus",
    mode: "bus",
    source: isKsrtc ? "ksrtc" : "private-bus-api",
    stops: [
      {
        stop: { id: `from-${slugify(from)}`, name: from },
        sequence: 0,
        arrivalTime: departure,
        departureTime: departure,
      },
      {
        stop: { id: `to-${slugify(to)}`, name: to },
        sequence: 1,
        arrivalTime: arrival,
        departureTime: arrival,
      },
    ],
    isLive: false,
  };
}

function extractTrips(
  html: string,
  from: string,
  to: string
): TransportTrip[] {
  const trips: TransportTrip[] = [];
  const seen = new Set<string>();

  const add = (
    departure: string,
    arrival: string,
    title: string
  ) => {
    const clean = title.replace(/\s+/g, " ").trim();
    const trip = buildTrip(
      from,
      to,
      departure,
      arrival,
      clean,
      trips.length
    );

    if (!trip) return;

    const key = `${trip.operator}|${departure}|${arrival}|${clean}`.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    trips.push(trip);
  };

  const linkRegex = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let link: RegExpExecArray | null;

  while ((link = linkRegex.exec(html))) {
    const text = decodeHtml(link[1].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();

    const match = text.match(
      /(\d{1,2}:\d{2})\s*[➔→]\s*(\d{1,2}:\d{2})\s*(?:\d+\s*m)?\s*(.*)$/i
    );

    if (match) add(match[1], match[2], match[3]);
  }

  for (const line of htmlToLines(html)) {
    const match = line.match(
      /(\d{1,2}:\d{2})\s*[➔→]\s*(\d{1,2}:\d{2})\s*(?:\d+\s*m)?\s*(.*)$/i
    );

    if (match) add(match[1], match[2], match[3]);
  }

  return trips;
}

export async function searchPublicTransport(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  const searchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(timetableUrl(from, to), {
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 GECW-Go/1.0",
      },
      next: { revalidate: 300 },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { from, to, directJourneys: [], connectingJourneys: [], searchedAt };
    }

    const trips = extractTrips(await response.text(), from, to);
    return { ...createSearchResult(from, to, trips), searchedAt };
  } catch (error) {
    console.warn("Verified timetable source failed:", error);
    return { from, to, directJourneys: [], connectingJourneys: [], searchedAt };
  } finally {
    clearTimeout(timer);
  }
}
