"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  searchStops,
  type SearchStop,
} from "../lib/stops";

import type {
  Journey,
  ScheduledStop,
  TransportTrip,
} from "../lib/types";

/* =========================================================
   TYPES
   ========================================================= */

type QuickRoute = {
  from: string;
  to: string;
};

type LocationInputProps = {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
};

type BusResultProps = {
  journey: Journey;
  from: string;
  to: string;
  index: number;
  selected: boolean;
  onToggleRoute: () => void;
};

/* =========================================================
   WELCOME MESSAGES
   ========================================================= */

const welcomeMessages = [
  "നിങ്ങളുടെ യാത്ര ഇവിടെ തുടങ്ങാം.",
  "Find your route. Make your journey.",
  "നിങ്ങൾ പോകേണ്ട സ്ഥലം കണ്ടെത്താം.",
  "Your journey, made simpler.",
  "യാത്ര എളുപ്പമാക്കാം.",
];

/* =========================================================
   QUICK ROUTES
   ========================================================= */

const quickRoutes: QuickRoute[] = [
  {
    from: "THALAPUZHA",
    to: "MANANTHAVADY",
  },
  {
    from: "MANANTHAVADY",
    to: "THALAPUZHA",
  },
  {
    from: "THALAPUZHA",
    to: "SULTHAN BATHERY",
  },
  {
    from: "SULTHAN BATHERY",
    to: "THALAPUZHA",
  },
  {
    from: "THALAPUZHA",
    to: "KANNUR",
  },
  {
    from: "THALAPUZHA",
    to: "THALASSERY",
  },
];

/* =========================================================
   LOCATION INPUT
   ========================================================= */

function LocationInput({
  label,
  value,
  placeholder,
  onChange,
  onSelect,
}: LocationInputProps) {
  const [focused, setFocused] =
    useState(false);

  const suggestions = useMemo(() => {
    if (!value.trim()) {
      return [];
    }

    return searchStops(value).slice(0, 6);
  }, [value]);

  return (
    <div className="location-field">
      <label>{label}</label>

      <div className="location-input-wrap">
        <span className="location-dot" />

        <input
          value={value}
          placeholder={placeholder}
          onChange={(event) =>
            onChange(event.target.value)
          }
          onFocus={() =>
            setFocused(true)
          }
          onBlur={() => {
            window.setTimeout(
              () => setFocused(false),
              150
            );
          }}
          autoComplete="off"
        />
      </div>

      {focused &&
        value.trim() &&
        suggestions.length > 0 && (
          <div className="location-suggestions">
            {suggestions.map(
              (suggestion: SearchStop) => (
                <button
                  type="button"
                  key={suggestion.id}
                  onMouseDown={(event) =>
                    event.preventDefault()
                  }
                  onClick={() =>
                    onSelect(
                      suggestion.name
                    )
                  }
                >
                  <strong>
                    {suggestion.name}
                  </strong>

                  {suggestion.placeName && (
                    <small>
                      {suggestion.placeName}
                    </small>
                  )}
                </button>
              )
            )}
          </div>
        )}
    </div>
  );
}

/* =========================================================
   HELPERS
   ========================================================= */

function getBusType(
  trip: TransportTrip
): string {
  if (
    trip.operator
      ?.toLowerCase()
      .includes("ksrtc")
  ) {
    return "KSRTC";
  }

  return "Private Bus";
}

function formatTime(
  value?: string | null
): string {
  if (!value) {
    return "--:--";
  }

  const match =
    value
      .trim()
      .match(
        /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i
      );

  if (!match) {
    return value;
  }

  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem =
    match[3]?.toUpperCase();

  if (meridiem) {
    if (meridiem === "AM") {
      if (hour === 12) {
        hour = 0;
      }
    } else if (
      meridiem === "PM" &&
      hour !== 12
    ) {
      hour += 12;
    }
  }

  return `${String(hour).padStart(
    2,
    "0"
  )}:${minute}`;
}

function getJourneyStops(
  journey: Journey
): ScheduledStop[] {
  const segment =
    journey.segments?.[0];

  if (!segment?.trip?.stops) {
    return [];
  }

  const stops =
    segment.trip.stops;

  const fromSequence =
    segment.from.sequence;

  const toSequence =
    segment.to.sequence;

  return stops
    .filter(
      (stop) =>
        stop.sequence >=
          fromSequence &&
        stop.sequence <=
          toSequence
    )
    .sort(
      (a, b) =>
        a.sequence - b.sequence
    );
}

/* =========================================================
   BUS RESULT CARD
   ========================================================= */

function BusResultCard({
  journey,
  from,
  to,
  index,
  selected,
  onToggleRoute,
}: BusResultProps) {
  const segment =
    journey.segments?.[0];

  const bus =
    segment?.trip;

  const isPast =
    journey.isPast === true;

  const isLive =
    bus?.isLive === true;

  const transfers =
    journey.transfers ?? 0;

  const journeyStops =
    getJourneyStops(journey);

  const stopCount =
    journeyStops.length;

  return (
    <article
      className={`bus-result-card ${
        isPast ? "past-bus" : ""
      } ${
        selected
          ? "selected-bus"
          : ""
      }`}
      key={`${bus?.id || "bus"}-${index}`}
    >
      <div className="bus-result-top">
        <div className="bus-type">
          <span className="bus-icon">
            🚌
          </span>

          <div>
            <strong>
              {bus
                ? getBusType(bus)
                : "Bus"}
            </strong>

            <small>
              {bus?.operator ||
                "Transport service"}
            </small>
          </div>
        </div>

        <span
          className={`bus-status ${
            isPast
              ? "departed"
              : isLive
              ? "live"
              : ""
          }`}
        >
          {isPast
            ? "Departed"
            : isLive
            ? "LIVE"
            : "Scheduled"}
        </span>
      </div>

      {(bus?.vehicleNumber ||
        bus?.serviceName) && (
        <div className="bus-service-info">
          {bus?.serviceName && (
            <span>
              {bus.serviceName}
            </span>
          )}

          {bus?.vehicleNumber && (
            <span>
              Bus No.{" "}
              {bus.vehicleNumber}
            </span>
          )}
        </div>
      )}

      <div className="bus-time-row">
        <div>
          <strong>
            {formatTime(
              journey.departureTime ||
                segment?.from
                  .departureTime
            )}
          </strong>

          <span>
            {segment?.from.stop.name ||
              from}
          </span>
        </div>

        <div className="bus-route-line">
          <span />
          <div />
          <span />
        </div>

        <div className="bus-time-destination">
          <strong>
            {formatTime(
              journey.arrivalTime ||
                segment?.to
                  .arrivalTime
            )}
          </strong>

          <span>
            {segment?.to.stop.name ||
              to}
          </span>
        </div>
      </div>

      <div className="bus-result-bottom">
        <span>
          {journey.totalDurationMinutes
            ? `${journey.totalDurationMinutes} min`
            : "Duration unavailable"}
        </span>

        <span>
          {transfers === 0
            ? "Direct bus"
            : `${transfers} transfer${
                transfers === 1
                  ? ""
                  : "s"
              }`}
        </span>

        {stopCount > 0 && (
          <span>
            {stopCount} stop
            {stopCount !== 1
              ? "s"
              : ""}
          </span>
        )}
      </div>

      <div className="bus-card-actions">
        <button
          type="button"
          className="route-details-button"
          onClick={onToggleRoute}
        >
          {selected
            ? "Hide route"
            : "View route"}
        </button>
      </div>

      {selected && (
        <div className="journey-route-details">
          <div className="journey-route-header">
            <strong>
              Route details
            </strong>

            <span>
              {stopCount} stop
              {stopCount !== 1
                ? "s"
                : ""}
            </span>
          </div>

          {journeyStops.length > 0 ? (
            <div className="journey-stops">
              {journeyStops.map(
                (
                  stop,
                  stopIndex
                ) => {
                  const isFirst =
                    stopIndex === 0;

                  const isLast =
                    stopIndex ===
                    journeyStops.length -
                      1;

                  const time =
                    stop.departureTime ||
                    stop.arrivalTime;

                  return (
                    <div
                      className="journey-stop"
                      key={`${stop.stop.id}-${stop.sequence}`}
                    >
                      <div className="journey-stop-marker">
                        <span
                          className={
                            isFirst
                              ? "start"
                              : isLast
                              ? "end"
                              : ""
                          }
                        />
                      </div>

                      <div className="journey-stop-name">
                        <strong>
                          {stop.stop.name}
                        </strong>

                        {isFirst && (
                          <small>
                            Boarding point
                          </small>
                        )}

                        {isLast && (
                          <small>
                            Destination
                          </small>
                        )}
                      </div>

                      <div className="journey-stop-time">
                        {time
                          ? formatTime(
                              time
                            )
                          : "—"}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          ) : (
            <p>
              Detailed stop information
              is not available for this
              service.
            </p>
          )}
        </div>
      )}

      {isPast && (
        <div className="departed-message">
          This bus has already departed.
        </div>
      )}
    </article>
  );
}

/* =========================================================
   HOME
   ========================================================= */

export default function Home() {
  const [transport, setTransport] =
    useState("Bus");

  const [from, setFrom] =
    useState("");

  const [to, setTo] =
    useState("");

  const [results, setResults] =
    useState<Journey[]>([]);

  const [selectedJourney, setSelectedJourney] =
    useState<Journey | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [searched, setSearched] =
    useState(false);

  const [error, setError] =
    useState("");

  const [clock, setClock] =
    useState("");

  const [darkMode, setDarkMode] =
    useState(false);

  const [welcomeIndex, setWelcomeIndex] =
    useState(0);

  const resultsRef =
    useRef<HTMLElement>(null);

  /* =======================================================
     THEME
     ======================================================= */

  useEffect(() => {
    const savedTheme =
      window.localStorage.getItem(
        "gecw-go-theme"
      );

    if (savedTheme === "dark") {
      setDarkMode(true);

      document.documentElement.classList.add(
        "dark-theme"
      );
    } else if (
      savedTheme === "light"
    ) {
      setDarkMode(false);

      document.documentElement.classList.remove(
        "dark-theme"
      );
    } else {
      const prefersDark =
        window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;

      setDarkMode(prefersDark);

      if (prefersDark) {
        document.documentElement.classList.add(
          "dark-theme"
        );
      }
    }
  }, []);

  /* =======================================================
     CLOCK
     ======================================================= */

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Intl.DateTimeFormat(
          "en-IN",
          {
            timeZone:
              "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          }
        ).format(new Date())
      );
    };

    updateClock();

    const timer =
      window.setInterval(
        updateClock,
        1000
      );

    return () =>
      window.clearInterval(timer);
  }, []);

  /* =======================================================
     WELCOME ROTATION
     ======================================================= */

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setWelcomeIndex(
          (current) =>
            (current + 1) %
            welcomeMessages.length
        );
      }, 3000);

    return () =>
      window.clearInterval(timer);
  }, []);

  /* =======================================================
     THEME TOGGLE
     ======================================================= */

  const toggleTheme = () => {
    const changeTheme = () => {
      const next =
        !darkMode;

      setDarkMode(next);

      if (next) {
        document.documentElement.classList.add(
          "dark-theme"
        );

        window.localStorage.setItem(
          "gecw-go-theme",
          "dark"
        );
      } else {
        document.documentElement.classList.remove(
          "dark-theme"
        );

        window.localStorage.setItem(
          "gecw-go-theme",
          "light"
        );
      }
    };

    const documentWithTransition =
      document as Document & {
        startViewTransition?: (
          callback: () => void
        ) => void;
      };

    if (
      typeof documentWithTransition.startViewTransition ===
      "function"
    ) {
      documentWithTransition.startViewTransition(
        changeTheme
      );
    } else {
      changeTheme();
    }
  };

  /* =======================================================
     SEARCH
     ======================================================= */

  const searchRoute = async (
    searchFrom = from,
    searchTo = to
  ) => {
    const cleanFrom =
      searchFrom.trim();

    const cleanTo =
      searchTo.trim();

    if (!cleanFrom || !cleanTo) {
      setError(
        "Please select both places."
      );
      return;
    }

    if (
      cleanFrom.toLowerCase() ===
      cleanTo.toLowerCase()
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
    setSelectedJourney(null);

    try {
      const response =
        await fetch(
          `/api/buses/search?from=${encodeURIComponent(
            cleanFrom
          )}&to=${encodeURIComponent(
            cleanTo
          )}`,
          {
            method: "GET",
            headers: {
              Accept:
                "application/json",
            },
            cache: "no-store",
          }
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

      const directJourneys: Journey[] =
        Array.isArray(
          data.directJourneys
        )
          ? data.directJourneys
          : [];

      const connectingJourneys: Journey[] =
        Array.isArray(
          data.connectingJourneys
        )
          ? data.connectingJourneys
          : [];

      const allJourneys = [
        ...directJourneys,
        ...connectingJourneys,
      ];

      const sortedJourneys =
        allJourneys.sort(
          (a, b) => {
            const aPast =
              a.isPast === true;

            const bPast =
              b.isPast === true;

            if (
              aPast !== bPast
            ) {
              return aPast
                ? 1
                : -1;
            }

            const aTransfers =
              a.transfers ?? 0;

            const bTransfers =
              b.transfers ?? 0;

            if (
              aTransfers !==
              bTransfers
            ) {
              return (
                aTransfers -
                bTransfers
              );
            }

            const aDeparture =
              a.departureTime ||
              "99:99";

            const bDeparture =
              b.departureTime ||
              "99:99";

            return aDeparture.localeCompare(
              bDeparture
            );
          }
        );

      setResults(
        sortedJourneys
      );
    } catch (searchError) {
      console.error(
        "GECW Go search error:",
        searchError
      );

      setResults([]);

      setError(
        "Unable to find buses right now. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /* =======================================================
     SWAP
     ======================================================= */

  const swapLocations = () => {
    setFrom(to);
    setTo(from);
  };

  /* =======================================================
     QUICK ROUTE
     ======================================================= */

  const useQuickRoute = (
    routeFrom: string,
    routeTo: string
  ) => {
    setTransport("Bus");
    setFrom(routeFrom);
    setTo(routeTo);
    setError("");

    searchRoute(
      routeFrom,
      routeTo
    );
  };

  /* =======================================================
     SCROLL TO RESULTS
     ======================================================= */

  useEffect(() => {
    if (
      searched &&
      !loading &&
      resultsRef.current
    ) {
      window.setTimeout(() => {
        resultsRef.current?.scrollIntoView(
          {
            behavior: "smooth",
            block: "start",
          }
        );
      }, 100);
    }
  }, [
    searched,
    loading,
    results.length,
  ]);

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <main className="site-shell">
      {/* HEADER */}
      <header className="site-header">
        <div className="header-brand">
          <div>
            <h1>
              GECW GO
            </h1>

            <span>
              GECW · Smart Campus Mobility
            </span>
          </div>
        </div>

        <div className="header-actions">
          {clock && (
            <span className="header-clock">
              {clock}
            </span>
          )}

                    <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={
              darkMode
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
          >
            {darkMode ? "☀️" : "🌙"}
          </button>

          <button
            type="button"
            className="header-link"
            onClick={() =>
              alert(
                "Login will be available soon."
              )
            }
          >
            Login
          </button>

          <button
            type="button"
            className="header-link primary"
            onClick={() =>
              alert(
                "Sign Up will be available soon."
              )
            }
          >
            Sign Up
          </button>

          <button
            type="button"
            className="header-help"
            onClick={() =>
              alert(
                "GECW Go Help will be available soon."
              )
            }
          >
            Help
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="hero-section">
        <div className="hero-copy">
          <span className="section-eyebrow">
            GECW TRANSPORT
          </span>

          <h2>
            {welcomeMessages[welcomeIndex]}
          </h2>

          <p>
            Find buses and plan your
            journey around GECW and
            beyond.
          </p>
        </div>

        <div className="kerala-scene">
          <video
            className="gecw-travel-video"
            src="/gecw-go-travel.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-label="Bus travelling through Kerala greenery"
          />
        </div>
      </section>

      {/* TRANSPORT SELECTOR */}
      <section className="transport-selector">
        <button
          type="button"
          className={
            transport === "Bus"
              ? "transport-option active"
              : "transport-option"
          }
          onClick={() => setTransport("Bus")}
        >
          <span>🚌</span>
          Bus Timings
        </button>

        <button
          type="button"
          className={
            transport === "Auto"
              ? "transport-option active"
              : "transport-option"
          }
          onClick={() => setTransport("Auto")}
        >
          <span>🛺</span>
          Auto
        </button>

        <button
          type="button"
          className={
            transport === "Jeep"
              ? "transport-option active"
              : "transport-option"
          }
          onClick={() => setTransport("Jeep")}
        >
          <span>🚙</span>
          Jeep
        </button>

        <button
          type="button"
          className="transport-more"
          onClick={() =>
            alert(
              "More transport options will be added soon."
            )
          }
          aria-label="More transport options"
        >
          ⋯
        </button>
      </section>

      {transport === "Bus" ? (
        <>
          {/* QUICK ROUTES */}
          <section className="quick-routes-section">
            <div className="section-heading">
              <span className="section-eyebrow">
                QUICK ROUTES
              </span>

              <h2>
                Popular journeys
              </h2>
            </div>

            <div className="quick-routes-grid">
              {quickRoutes.map((route) => (
                <button
                  type="button"
                  className="quick-route-card"
                  key={`${route.from}-${route.to}`}
                  onClick={() =>
                    useQuickRoute(
                      route.from,
                      route.to
                    )
                  }
                >
                  <span>
                    {route.from}
                  </span>

                  <strong>→</strong>

                  <span>
                    {route.to}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* JOURNEY PLANNER */}
          <section className="planner-section">
            <div className="section-heading">
              <span className="section-eyebrow">
                JOURNEY PLANNER
              </span>

              <h2>
                Where are you going?
              </h2>

              <p>
                Search for a bus between
                any recognized stop or
                town.
              </p>
            </div>

            <div className="planner-card">
              <LocationInput
                label="From"
                value={from}
                placeholder="Starting point"
                onChange={(value) => {
                  setFrom(value);
                  setError("");
                }}
                onSelect={(value) => {
                  setFrom(value);
                  setError("");
                }}
              />

              <button
                type="button"
                className="swap-button"
                onClick={swapLocations}
                aria-label="Swap locations"
              >
                ⇅
              </button>

              <LocationInput
                label="To"
                value={to}
                placeholder="Destination"
                onChange={(value) => {
                  setTo(value);
                  setError("");
                }}
                onSelect={(value) => {
                  setTo(value);
                  setError("");
                }}
              />

              <button
                type="button"
                className="search-button"
                onClick={() => searchRoute()}
                disabled={loading}
              >
                {loading
                  ? "Searching..."
                  : "Find buses"}
              </button>

              {error && (
                <div
                  className="search-message"
                  role="status"
                >
                  {error}
                </div>
              )}
            </div>
          </section>

          {/* RESULTS */}
          <section
            ref={resultsRef}
            className="results-section"
          >
            {loading && (
              <div className="results-state">
                <div className="loading-spinner" />

                <h3>
                  Finding your buses...
                </h3>

                <p>
                  Checking available
                  direct routes.
                </p>
              </div>
            )}

            {!loading &&
              searched &&
              results.length === 0 && (
                <div className="results-state empty-results">
                  <div className="empty-icon">
                    🚌
                  </div>

                  <h3>
                    No buses found
                  </h3>

                  <p>
                    We couldn't find a
                    bus between {from} and{" "}
                    {to} right now.
                  </p>

                  <small>
                    Try another nearby
                    stop or route.
                    Connecting journeys
                    will appear here once
                    the journey engine is
                    enabled.
                  </small>
                </div>
              )}

            {!loading &&
              results.length > 0 && (
                <>
                  <div className="results-title-row">
                    <div>
                      <span className="section-eyebrow">
                        RESULTS
                      </span>

                      <h2>
                        {from} → {to}
                      </h2>
                    </div>

                    <span className="result-count">
                      {results.length} bus
                      {results.length !== 1
                        ? "es"
                        : ""}
                    </span>
                  </div>

                  <div className="results-list">
                    {results.map(
                      (journey, index) => (
                        <BusResultCard
                          key={`${
                            journey.segments?.[0]
                              ?.trip?.id ||
                            "bus"
                          }-${index}`}
                          journey={journey}
                          from={from}
                          to={to}
                          index={index}
                          selected={
                            selectedJourney ===
                            journey
                          }
                          onToggleRoute={() =>
                            setSelectedJourney(
                              selectedJourney ===
                                journey
                                ? null
                                : journey
                            )
                          }
                        />
                      )
                    )}
                  </div>
                </>
              )}
          </section>

          {/* INFORMATION */}
          <section className="info-card">
            <div className="info-icon">
              ℹ
            </div>

            <div>
              <strong>
                About GECW Go
              </strong>

              <p>
                GECW Go helps students
                discover available bus
                routes around Government
                Engineering College
                Wayanad.
              </p>
            </div>
          </section>
        </>
      ) : (
        /* AUTO / JEEP */
        <section className="coming-soon-card">
          <div className="coming-soon-icon">
            {transport === "Auto"
              ? "🛺"
              : "🚙"}
          </div>

          <span className="section-eyebrow">
            COMING SOON
          </span>

          <h2>
            {transport} services
          </h2>

          <p>
            We are working on bringing{" "}
            {transport.toLowerCase()}{" "}
            services to GECW Go.
          </p>

          <small>
            This section will include
            nearby availability and
            useful journey information
            once the service is ready.
          </small>
        </section>
      )}

      {/* FOOTER */}
      <footer className="site-footer">
        <strong>
          GECW GO
        </strong>

        <span>
          Find your route. Make your
          journey.
        </span>
      </footer>
    </main>
  );
}
