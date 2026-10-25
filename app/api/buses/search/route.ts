import { NextRequest, NextResponse } from "next/server";
import { searchBuses } from "../../../../lib/transport";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();

  if (!from || !to) {
    return NextResponse.json(
      {
        success: false,
        error: "Both 'from' and 'to' are required.",
      },
      { status: 400 }
    );
  }

  if (from.toLowerCase() === to.toLowerCase()) {
    return NextResponse.json(
      {
        success: false,
        error: "Starting point and destination cannot be the same.",
      },
      { status: 400 }
    );
  }

  try {
    const result = await searchBuses(from, to);

    return NextResponse.json({
      success: true,
      ...result,
      totalDirectBuses: result.directJourneys.length,
      totalConnectingJourneys:
        result.connectingJourneys.length,
    });
  } catch (error) {
    console.error("Search error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to search transport data right now.",
      },
      { status: 500 }
    );
  }
}
