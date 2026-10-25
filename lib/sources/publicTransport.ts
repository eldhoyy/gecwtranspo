import type {
  TransportSearchResult,
  TransportTrip,
} from "@/lib/types";

const PUBLIC_TRANSPORT_API =
  "https://raw.githubusercontent.com/razinahmed/kerala-public-transport-api/main";

export async function searchPublicTransport(
  from: string,
  to: string
): Promise<TransportSearchResult> {
  /*
   * This connector is intentionally isolated from the rest of GECW Go.
   *
   * The public-transport project contains schedule, route and tracking
   * components, but its repository data is not a guaranteed production
   * API endpoint for every Kerala location.
   *
   * We therefore return an empty normalized result until a stable,
   * permitted endpoint/feed is configured.
   */

  const emptyResult: TransportSearchResult = {
    from,
    to,
    directJourneys: [],
    connectingJourneys: [],
    searchedAt: new Date().toISOString(),
  };

  try {
    // Reserved for the verified public-transport endpoint.
    // Keeping the source isolated means we can activate it later
    // without changing the journey planner or frontend.
    void PUBLIC_TRANSPORT_API;

    return emptyResult;
  } catch (error) {
    console.error("Public transport source failed:", error);
    return emptyResult;
  }
}
