import { NextRequest, NextResponse } from "next/server";
import { searchBuses } from "../../../../lib/transport";
import { searchPublicTransport } from "../../../../lib/sources/publicTransport";
import type { Journey } from "../../../../lib/types";

function journeyKey(journey: Journey): string {
  const segment = journey.segments?.[0];
  const trip = segment?.trip;
  return [trip?.operator ?? "", trip?.vehicleNumber ?? "", journey.departureTime ?? "", journey.arrivalTime ?? "", segment?.from?.stop?.name ?? "", segment?.to?.stop?.name ?? ""].join("|").toLowerCase();
}

function mergeJourneys(primary: Journey[], secondary: Journey[]): Journey[] {
  const result: Journey[] = []; const seen = new Set<string>();
  for (const journey of [...primary, ...secondary]) { const key = journeyKey(journey); if (seen.has(key)) continue; seen.add(key); result.push(journey); }
  return result.sort((a, b) => (a.departureTime ?? "99:99").localeCompare(b.departureTime ?? "99:99"));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  if (!from || !to) return NextResponse.json({ success: false, error: "Both 'from' and 'to' are required." }, { status: 400 });
  if (from.toLowerCase() === to.toLowerCase()) return NextResponse.json({ success: false, error: "Starting point and destination cannot be the same." }, { status: 400 });
  try {
    const [primary, publicSource] = await Promise.all([searchBuses(from, to), searchPublicTransport(from, to)]);
    const directJourneys = mergeJourneys(primary.directJourneys, publicSource.directJourneys);
    const connectingJourneys = mergeJourneys(primary.connectingJourneys, publicSource.connectingJourneys);
    return NextResponse.json({ success: true, from: primary.from || publicSource.from, to: primary.to || publicSource.to, directJourneys, connectingJourneys, searchedAt: new Date().toISOString(), totalDirectBuses: directJourneys.length, totalConnectingJourneys: connectingJourneys.length });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ success: false, error: "Unable to search transport data right now." }, { status: 500 });
  }
}
