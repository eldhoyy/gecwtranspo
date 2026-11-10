import { NextRequest, NextResponse } from "next/server";
import { searchVerifiedTransport } from "../../../../lib/verifiedSearch";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const requests = new Map<string, { count: number; resetAt: number }>();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";
  if (!from || !to || from.length > 80 || to.length > 80) {
    return NextResponse.json({ success: false, error: "Enter a starting point and destination (up to 80 characters)." }, { status: 400 });
  }
  if (from.toLocaleLowerCase() === to.toLocaleLowerCase()) {
    return NextResponse.json({ success: false, error: "Starting point and destination cannot be the same." }, { status: 400 });
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || "unknown";
  const now = Date.now();
  const bucket = requests.get(key);
  if (bucket && bucket.resetAt > now && bucket.count >= MAX_REQUESTS) {
    return NextResponse.json({ success: false, error: "Too many searches. Please wait a minute." }, { status: 429, headers: { "Retry-After": "60" } });
  }
  requests.set(key, bucket && bucket.resetAt > now ? { ...bucket, count: bucket.count + 1 } : { count: 1, resetAt: now + WINDOW_MS });
  try {
    const result = await searchVerifiedTransport(from, to);
    return NextResponse.json({ success: true, ...result, totalDirectBuses: result.directJourneys.length, totalConnectingJourneys: result.connectingJourneys.length });
  } catch (error) {
    console.error("Verified search error:", error);
    return NextResponse.json({ success: false, error: "Unable to search transport data right now." }, { status: 500 });
  }
}
