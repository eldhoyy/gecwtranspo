"use client";

import { useState } from "react";

type BusStop = {
  station: string;
  arrivalTime: string | null;
  departureTime: string | null;
};

type BusTrip = {
  vehicleNumber: string;
  trip: string;
  stations: BusStop[];
};

const quickRoutes = [
  ["GECW / Thalapuzha", "Mananthavady"],
  ["Mananthavady", "GECW / Thalapuzha"],
  ["GECW / Thalapuzha", "Sulthan Bathery"],
  ["Sulthan Bathery", "GECW / Thalapuzha"],
  ["GECW / Thalapuzha", "Kannur"],
  ["GECW / Thalapuzha", "Thalassery"],
];

export default function Home() {
  const [transport, setTransport] = useState("Bus");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [results, setResults] = useState<BusTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const searchRoute = async (searchFrom = from, searchTo = to) => {
    if (!searchFrom.trim() || !searchTo.trim()) {
      setError("Please enter both your starting point and destination.");
      return;
    }

    setLoading(true);
    setSearched(true);
    setError("");
    setResults([]);

    try {
      const response = await fetch(
        `/api/buses/search?from=${encodeURIComponent(
          searchFrom
        )}&to=${encodeURIComponent(searchTo)}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Search failed.");
      }

      setResults(data.directBuses || []);
    } catch (err) {
      console.error(err);
      setError("Unable to find buses right now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const useQuickRoute = (routeFrom: string, routeTo: string) => {
    setTransport("Bus");
    setFrom(routeFrom);
    setTo(routeTo);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    searchRoute(routeFrom, routeTo);
  };

  const getStop = (trip: BusTrip, place: string) => {
    return (
      trip.stations.find(
        (stop) =>
          stop.station.toLowerCase().includes(place.toLowerCase()) ||
          place.toLowerCase().includes(stop.station.toLowerCase())
      ) || null
    );
  };

  return (
    <main className="gcw-page">
      <header className="gcw-header">
        <div className="gcw-brand">
          <div className="gcw-logo">G</div>

          <div>
            <h1>GECW Go</h1>
            <p>Government Engineering College Wayanad</p>
          </div>
        </div>
      </header>

      <section className="gcw-hero">
        <div className="transport-selector">
          {[
            { name: "Bus", icon: "🚌" },
            { name: "Auto", icon: "🛺" },
            { name: "Jeep", icon: "🚙" },
          ].map((item) => (
            <button
              key={item.name}
              className={`transport-option ${
                transport === item.name ? "active" : ""
              }`}
              onClick={() => setTransport(item.name)}
            >
              {item.icon} {item.name}
            </button>
          ))}
        </div>

        {transport === "Bus" ? (
          <>
            <h2>
              Find your route.
              <br />
              <span>Make your journey.</span>
            </h2>

            <p>
              Find buses and simple connections from GECW, nearby stops,
              towns and destinations across Kerala.
            </p>

            <div className="search-card">
              <div className="search-fields">
                <div className="search-field">
                  <label>From</label>
                  <input
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder="Search any stop or place"
                  />
                </div>

                <div className="search-field">
                  <label>To</label>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="Where are you going?"
                  />
                </div>

                <button
                  className="find-button"
                  onClick={() => searchRoute()}
                  disabled={loading}
                >
                  {loading ? "Searching..." : "Find Buses"}
                </button>
              </div>

              {error && <p className="search-error">{error}</p>}
            </div>
          </>
        ) : (
          <>
            <h2>
              {transport === "Auto"
                ? "Need an auto?"
                : "Need a local jeep?"}
              <br />
              <span>We're building it.</span>
            </h2>

            <p>
              {transport === "Auto"
                ? "A verified local auto directory for students is coming soon."
                : "A local jeep directory for students is coming soon."}
            </p>
          </>
        )}
      </section>

      {transport === "Bus" && (
        <>
          <section className="gcw-section">
            <div className="section-heading">
              <h3>Quick GECW Routes</h3>
              <p>Common journeys students make from and around campus.</p>
            </div>

            <div className="quick-routes">
              {quickRoutes.map(([routeFrom, routeTo], index) => (
                <button
                  key={index}
                  className="route-card"
                  onClick={() => useQuickRoute(routeFrom, routeTo)}
                >
                  <div className="route-icon">🚌</div>

                  <strong>
                    {routeFrom} → {routeTo}
                  </strong>

                  <span>Search buses for this route</span>
                </button>
              ))}
            </div>
          </section>

          {searched && (
            <section className="gcw-section results-section">
              <div className="section-heading">
                <h3>
                  {results.length > 0
                    ? `${results.length} direct bus${
                        results.length === 1 ? "" : "es"
                      } found`
                    : "No direct buses found"}
                </h3>

                <p>
                  {from} → {to}
                </p>
              </div>

              {loading && (
                <div className="result-empty">
                  <div className="result-icon">🚌</div>
                  <strong>Searching transport data...</strong>
                  <p>Checking available bus routes.</p>
                </div>
              )}

              {!loading && results.length === 0 && (
                <div className="result-empty">
                  <div className="result-icon">🔎</div>
                  <strong>No direct bus found</strong>
                  <p>
                    We couldn't find a direct bus for this search yet.
                    Transfer planning will be added next.
                  </p>
                </div>
              )}

              {!loading &&
                results.map((trip, index) => {
                  const fromStop = getStop(trip, from);
                  const toStop = getStop(trip, to);

                  return (
                    <div className="bus-result" key={`${trip.vehicleNumber}-${index}`}>
                      <div className="bus-result-top">
                        <div>
                          <span className="direct-badge">
                            DIRECT BUS
                          </span>

                          <h4>
                            🚌 {trip.vehicleNumber || "Bus"}
                          </h4>

                          <p>{trip.trip || "Scheduled service"}</p>
                        </div>
                      </div>

                      <div className="journey-times">
                        <div>
                          <span>Departure</span>
                          <strong>
                            {fromStop?.departureTime ||
                              fromStop?.arrivalTime ||
                              "—"}
                          </strong>
                          <small>{fromStop?.station || from}</small>
                        </div>

                        <div className="journey-line">
                          <span>→</span>
                        </div>

                        <div>
                          <span>Arrival</span>
                          <strong>
                            {toStop?.arrivalTime ||
                              toStop?.departureTime ||
                              "—"}
                          </strong>
                          <small>{toStop?.station || to}</small>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </section>
          )}
        </>
      )}

      <section className="gcw-section">
        <div className="section-heading">
          <h3>More ways to travel</h3>
          <p>Local transport options we plan to bring together.</p>
        </div>

        <div className="future-grid">
          <div className="future-card">
            <span className="future-badge">Coming soon</span>
            <h4>🛺 Verified Auto Network</h4>
            <p>
              Find trusted local auto drivers around GECW, Thalapuzha and
              Mananthavady.
            </p>
          </div>

          <div className="future-card">
            <span className="future-badge">Coming soon</span>
            <h4>🚙 Local Jeep Network</h4>
            <p>
              A student-friendly directory for local jeep services when
              you need an alternative to waiting for a bus.
            </p>
          </div>
        </div>
      </section>

      <footer className="gcw-footer">
        Bus timings and route information are provided for student
        convenience and may change due to traffic, operational changes,
        holidays, weather or other circumstances.
        <br />
        Please verify important journeys before travelling.
      </footer>
    </main>
  );
}
