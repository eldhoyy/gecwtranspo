"use client";

import { useEffect, useRef, useState } from "react";

import {
  searchStops,
  type SearchStop,
} from "../lib/stops";

type ScheduledStop = {
  stop: {
    id: string;
    name: string;
  };
  sequence: number;
  arrivalTime: string | null;
  departureTime: string | null;
};

type TransportTrip = {
  id: string;
  vehicleNumber?: string;
  serviceName?: string;
  operator?: string;
  mode: string;
  source: string;
  stops: ScheduledStop[];
  isLive?: boolean;
};

type JourneySegment = {
  trip: TransportTrip;
  from: ScheduledStop;
  to: ScheduledStop;
};

type Journey = {
  segments: JourneySegment[];
  transfers: number;
  departureTime?: string;
  arrivalTime?: string;
  waitingTimeMinutes?: number;
  isLive?: boolean;
};

const quickRoutes = [
  ["THALAPUZHA", "MANANTHAVADY"],
  ["MANANTHAVADY", "THALAPUZHA"],
  ["THALAPUZHA", "SULTHAN BATHERY"],
  ["SULTHAN BATHERY", "THALAPUZHA"],
  ["THALAPUZHA", "KANNUR"],
  ["THALAPUZHA", "THALASSERY"],
];

function LocationInput({
  label,
  value,
  placeholder,
  onChange,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSelect: (stop: SearchStop) => void;
}) {
  const [suggestions, setSuggestions] =
    useState<SearchStop[]>([]);

  const [showSuggestions, setShowSuggestions] =
    useState(false);

  const wrapperRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (
      event: MouseEvent
    ) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(
          event.target as Node
        )
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, []);

  const handleChange = (
    nextValue: string
  ) => {
    onChange(nextValue);

    const matches =
      searchStops(nextValue);

    setSuggestions(matches);
    setShowSuggestions(true);
  };

  const handleFocus = () => {
    const matches =
      searchStops(value);

    setSuggestions(matches);
    setShowSuggestions(true);
  };

  const handleSelect = (
    stop: SearchStop
  ) => {
    onSelect(stop);
    setShowSuggestions(false);
  };

  return (
    <div
      className="search-field location-field"
      ref={wrapperRef}
    >
      <label>{label}</label>

      <input
        value={value}
        onChange={(event) =>
          handleChange(event.target.value)
        }
        onFocus={handleFocus}
        placeholder={placeholder}
        autoComplete="off"
      />

      {showSuggestions &&
        suggestions.length > 0 && (
          <div className="location-suggestions">
            {suggestions.map((stop) => (
              <button
                type="button"
                className="location-suggestion"
                key={stop.id}
                onMouseDown={(event) =>
                  event.preventDefault()
                }
                onClick={() =>
                  handleSelect(stop)
                }
              >
                <span className="suggestion-icon">
                  📍
                </span>

                <span>
                  <strong>
                    {stop.name}
                  </strong>

                  {stop.aliases &&
                    stop.aliases.length > 0 && (
                      <small>
                        {stop.aliases[0]}
                      </small>
                    )}
                </span>
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

export default function Home() {
  const [transport, setTransport] =
    useState("Bus");

  const [from, setFrom] =
    useState("");

  const [to, setTo] =
    useState("");

  const [results, setResults] =
    useState<Journey[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [searched, setSearched] =
    useState(false);

  const [error, setError] =
    useState("");

  const searchRoute = async (
    searchFrom = from,
    searchTo = to
  ) => {
    if (
      !searchFrom.trim() ||
      !searchTo.trim()
    ) {
      setError(
        "Please select both your starting point and destination."
      );
      return;
    }

    if (
      searchFrom.trim().toLowerCase() ===
      searchTo.trim().toLowerCase()
    ) {
      setError(
        "Starting point and destination cannot be the same."
      );
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
        )}&to=${encodeURIComponent(
          searchTo
        )}`
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            "Search failed."
        );
      }

      setResults(
        data.directJourneys || []
      );
    } catch (err) {
      console.error(err);

      setError(
        "Unable to find buses right now. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const useQuickRoute = (
    routeFrom: string,
    routeTo: string
  ) => {
    setTransport("Bus");
    setFrom(routeFrom);
    setTo(routeTo);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    searchRoute(
      routeFrom,
      routeTo
    );
  };

  return (
    <main className="gcw-page">
      <header className="gcw-header">
        <div className="gcw-brand">
          <div className="gcw-logo">
            G
          </div>

          <div>
            <h1>GECW Go</h1>

            <p>
              Government Engineering College
              Wayanad
            </p>
          </div>
        </div>
      </header>

      <section className="gcw-hero">
        <div className="transport-selector">
          {[
            {
              name: "Bus",
              icon: "🚌",
            },
            {
              name: "Auto",
              icon: "🛺",
            },
            {
              name: "Jeep",
              icon: "🚙",
            },
          ].map((item) => (
            <button
              type="button"
              key={item.name}
              className={`transport-option ${
                transport === item.name
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setTransport(
                  item.name
                )
              }
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
              <span>
                Make your journey.
              </span>
            </h2>

            <p>
              Find buses and simple
              connections from GECW,
              nearby stops, towns and
              destinations across Kerala.
            </p>

            <div className="search-card">
              <div className="search-fields">
                <LocationInput
                  label="From"
                  value={from}
                  onChange={setFrom}
                  onSelect={(stop) =>
                    setFrom(stop.name)
                  }
                  placeholder="Search any stop or place"
                />

                <LocationInput
                  label="To"
                  value={to}
                  onChange={setTo}
                  onSelect={(stop) =>
                    setTo(stop.name)
                  }
                  placeholder="Where are you going?"
                />

                <button
                  type="button"
                  className="find-button"
                  onClick={() =>
                    searchRoute()
                  }
                  disabled={loading}
                >
                  {loading
                    ? "Searching..."
                    : "Find Buses"}
                </button>
              </div>

              {error && (
                <p className="search-error">
                  {error}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <h2>
              {transport === "Auto"
                ? "Need an auto?"
                : "Need a local jeep?"}
              <br />
              <span>
                We're building it.
              </span>
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
              <h3>
                Quick GECW Routes
              </h3>

              <p>
                Common journeys students
                make from and around
                campus.
              </p>
            </div>

            <div className="quick-routes">
              {quickRoutes.map(
                (
                  [routeFrom, routeTo],
                  index
                ) => (
                  <button
                    type="button"
                    key={index}
                    className="route-card"
                    onClick={() =>
                      useQuickRoute(
                        routeFrom,
                        routeTo
                      )
                    }
                  >
                    <div className="route-icon">
                      🚌
                    </div>

                    <strong>
                      {routeFrom} →{" "}
                      {routeTo}
                    </strong>

                    <span>
                      Search buses for
                      this route
                    </span>
                  </button>
                )
              )}
            </div>
          </section>

          {searched && (
            <section className="gcw-section results-section">
              <div className="section-heading">
                <h3>
                  {results.length > 0
                    ? `${results.length} upcoming direct bus${
                        results.length === 1
                          ? ""
                          : "es"
                      }`
                    : "No upcoming direct buses found"}
                </h3>

                <p>
                  {from} → {to}
                </p>
              </div>

              {loading && (
                <div className="result-empty">
                  <div className="result-icon">
                    🚌
                  </div>

                  <strong>
                    Searching transport
                    data...
                  </strong>

                  <p>
                    Checking available
                    bus routes.
                  </p>
                </div>
              )}

              {!loading &&
                results.length === 0 && (
                  <div className="result-empty">
                    <div className="result-icon">
                      🔎
                    </div>

                    <strong>
                      No upcoming direct bus found
                    </strong>

                    <p>
                      There may be no
                      scheduled bus remaining
                      for this route today.
                    </p>
                  </div>
                )}

              {!loading &&
                results.map(
                  (
                    journey,
                    index
                  ) => {
                    const segment =
                      journey.segments[0];

                    if (!segment) {
                      return null;
                    }

                    const bus =
                      segment.trip;

                    return (
                      <div
                        className="bus-result"
                        key={`${bus.id}-${index}`}
                      >
                        <div className="bus-result-top">
                          <span className="direct-badge">
                            DIRECT BUS
                          </span>

                          <h4>
                            🚌{" "}
                            {bus.vehicleNumber ||
                              "Bus"}
                          </h4>

                          <p>
                            {bus.serviceName ||
                              "Scheduled service"}
                          </p>
                        </div>

                        <div className="journey-times">
                          <div>
                            <span>
                              Departure
                            </span>

                            <strong>
                              {journey.departureTime ||
                                "—"}
                            </strong>

                            <small>
                              {
                                segment
                                  .from.stop
                                  .name
                              }
                            </small>
                          </div>

                          <div className="journey-line">
                            →
                          </div>

                          <div>
                            <span>
                              Arrival
                            </span>

                            <strong>
                              {journey.arrivalTime ||
                                "—"}
                            </strong>

                            <small>
                              {
                                segment
                                  .to.stop
                                  .name
                              }
                            </small>
                          </div>
                        </div>

                        {journey.waitingTimeMinutes !==
                          undefined &&
                          journey.waitingTimeMinutes >=
                            0 && (
                            <div className="journey-waiting">
                              {journey.waitingTimeMinutes ===
                              0
                                ? "🟢 Leaving now"
                                : `🟢 Leaves in ${journey.waitingTimeMinutes} min`}
                            </div>
                          )}

                        {journey.isLive && (
                          <div className="live-badge">
                            ● LIVE
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
            </section>
          )}
        </>
      )}

      <section className="gcw-section">
        <div className="section-heading">
          <h3>
            More ways to travel
          </h3>

          <p>
            Local transport options we
            plan to bring together.
          </p>
        </div>

        <div className="future-grid">
          <div className="future-card">
            <span className="future-badge">
              Coming soon
            </span>

            <h4>
              🛺 Verified Auto Network
            </h4>

            <p>
              Find trusted local auto
              drivers around GECW,
              Thalapuzha and
              Mananthavady.
            </p>
          </div>

          <div className="future-card">
            <span className="future-badge">
              Coming soon
            </span>

            <h4>
              🚙 Local Jeep Network
            </h4>

            <p>
              A student-friendly
              directory for local jeep
              services.
            </p>
          </div>
        </div>
      </section>

      <footer className="gcw-footer">
        Bus timings and route information
        are provided for student convenience
        and may change due to traffic,
        operational changes, holidays,
        weather or other circumstances.
        <br />
        Please verify important journeys
        before travelling.
      </footer>
    </main>
  );
}
