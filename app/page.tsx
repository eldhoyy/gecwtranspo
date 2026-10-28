"use client";

import { useEffect, useRef, useState } from "react";
import { searchStops, type SearchStop } from "../lib/stops";

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
  totalDurationMinutes?: number;
  waitingTimeMinutes?: number;
  departureTime?: string;
  arrivalTime?: string;
  isLive?: boolean;
  isPast?: boolean;
};

const welcomeMessages = [
  {
    language: "ENGLISH",
    title: "Welcome!",
    subtitle: "Where are we heading today?",
  },
  {
    language: "മലയാളം",
    title: "സ്വാഗതം!",
    subtitle: "ഇന്ന് എങ്ങോട്ടാണ് യാത്ര?",
  },
  {
    language: "हिन्दी",
    title: "स्वागत है!",
    subtitle: "आज कहाँ जाना है?",
  },
];

const quickRoutes = [
  {
    from: "THALAPUZHA",
    to: "MANANTHAVADY",
    subtitle: "GECW Campus Route",
    icon: "🏫",
  },
  {
    from: "MANANTHAVADY",
    to: "THALAPUZHA",
    subtitle: "Campus Return",
    icon: "🚌",
  },
  {
    from: "THALAPUZHA",
    to: "SULTHAN BATHERY",
    subtitle: "Direct Bus",
    icon: "🚌",
  },
  {
    from: "SULTHAN BATHERY",
    to: "THALAPUZHA",
    subtitle: "GECW Return",
    icon: "🚌",
  },
  {
    from: "THALAPUZHA",
    to: "KANNUR",
    subtitle: "Intercity Route",
    icon: "🚌",
  },
  {
    from: "THALAPUZHA",
    to: "THALASSERY",
    subtitle: "Intercity Route",
    icon: "🚌",
  },
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
  const [suggestions, setSuggestions] = useState<SearchStop[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const handleChange = (nextValue: string) => {
    onChange(nextValue);
    setSuggestions(searchStops(nextValue));
    setShowSuggestions(true);
  };

  const handleFocus = () => {
    setSuggestions(searchStops(value));
    setShowSuggestions(true);
  };

  return (
    <div className="transpo-field" ref={wrapperRef}>
      <label>{label}</label>

      <div className="transpo-input-wrap">
        <span className="field-pin">
          {label.startsWith("From") ? "●" : "◆"}
        </span>

        <input
          type="text"
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={handleFocus}
          placeholder={placeholder}
          autoComplete="off"
        />

        <span className="field-chevron">⌄</span>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="location-suggestions">
          {suggestions.map((stop) => (
            <button
              type="button"
              className="location-suggestion"
              key={stop.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(stop);
                setShowSuggestions(false);
              }}
            >
              <span className="suggestion-icon">📍</span>

              <span>
                <strong>{stop.name}</strong>
                {stop.aliases?.[0] && (
                  <small>{stop.aliases[0]}</small>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getBusType(bus: TransportTrip): "Private Bus" | "KSRTC" {
  const source = bus.source.toLowerCase();
  const operator = (bus.operator || "").toLowerCase();

  if (
    source.includes("public-transport") ||
    source.includes("ksrtc") ||
    operator.includes("ksrtc") ||
    operator.includes("kerala state road")
  ) {
    return "KSRTC";
  }

  return "Private Bus";
}

function formatTime(value?: string | null) {
  if (!value) return "--:--";

  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(am|pm)\b/i, (match) => match.toUpperCase());
}

function getJourneyEndpoints(journey: Journey) {
  const segment = journey.segments?.[0];

  if (!segment) {
    return {
      from: "",
      to: "",
    };
  }

  return {
    from: segment.from.stop.name,
    to: segment.to.stop.name,
  };
}

function getJourneyStops(journey: Journey) {
  const segment = journey.segments?.[0];

  if (!segment?.trip?.stops) {
    return [];
  }

  const stops = segment.trip.stops;
  const fromSequence = segment.from.sequence;
  const toSequence = segment.to.sequence;

  return stops
    .filter(
      (stop) =>
        stop.sequence >= fromSequence &&
        stop.sequence <= toSequence
    )
    .sort((a, b) => a.sequence - b.sequence);
}

function sortJourneys(journeys: Journey[]) {
  return [...journeys].sort((a, b) => {
    if (a.isPast !== b.isPast) {
      return a.isPast ? 1 : -1;
    }

    if (a.transfers !== b.transfers) {
      return a.transfers - b.transfers;
    }

    return (a.departureTime || "").localeCompare(
      b.departureTime || ""
    );
  });
}

export default function Home() {
  const [transport, setTransport] = useState("Bus");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [results, setResults] = useState<Journey[]>([]);
  const [selectedJourney, setSelectedJourney] =
    useState<Journey | null>(null);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  const [clock, setClock] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [welcomeIndex, setWelcomeIndex] = useState(0);

  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const savedTheme =
      window.localStorage.getItem("gecw-go-theme");

    if (savedTheme === "dark") {
      setDarkMode(true);
      document.documentElement.classList.add("dark-theme");
    } else if (savedTheme === "light") {
      setDarkMode(false);
      document.documentElement.classList.remove("dark-theme");
    } else {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

      setDarkMode(prefersDark);

      if (prefersDark) {
        document.documentElement.classList.add("dark-theme");
      }
    }
  }, []);

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date())
      );
    };

    updateClock();

    const timer = window.setInterval(updateClock, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWelcomeIndex(
        (current) =>
          (current + 1) % welcomeMessages.length
      );
    }, 3000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!searched || loading) return;

    const timer = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searched, loading, results.length]);

  const toggleTheme = () => {
    const nextTheme = !darkMode;

    const changeTheme = () => {
      setDarkMode(nextTheme);

      if (nextTheme) {
        document.documentElement.classList.add("dark-theme");
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

  const searchRoute = async (
    searchFrom = from,
    searchTo = to
  ) => {
    const cleanFrom = searchFrom.trim();
    const cleanTo = searchTo.trim();

    if (!cleanFrom || !cleanTo) {
      setError("Please select both places.");
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
      const response = await fetch(
        `/api/buses/search?from=${encodeURIComponent(
          cleanFrom
        )}&to=${encodeURIComponent(cleanTo)}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Search failed."
        );
      }

      const directJourneys: Journey[] =
        Array.isArray(data.directJourneys)
          ? data.directJourneys
          : [];

      const connectingJourneys: Journey[] =
        Array.isArray(data.connectingJourneys)
          ? data.connectingJourneys
          : [];

      const journeys = sortJourneys([
        ...directJourneys,
        ...connectingJourneys,
      ]);

      setResults(journeys);
    } catch (searchError) {
      console.error(
        "GECW Go search error:",
        searchError
      );

      setError(
        "Unable to find buses right now. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const swapLocations = () => {
    setFrom(to);
    setTo(from);
  };

  const useQuickRoute = (
    routeFrom: string,
    routeTo: string
  ) => {
    setTransport("Bus");
    setFrom(routeFrom);
    setTo(routeTo);
    setError("");

    setTimeout(() => {
      searchRoute(routeFrom, routeTo);
    }, 0);
  };

  const welcome = welcomeMessages[welcomeIndex];

  return (
    <main className="transpo-page">
      <div className="transpo-shell">
        <header className="transpo-header-card">
          <div className="transpo-brand-row">
            <div className="transpo-brand-mark">
              🚌
            </div>

            <div className="transpo-brand-text">
              <h1>GECW GO</h1>
              <p>GECW · Smart Campus Mobility</p>
            </div>

            <div className="transpo-brand-symbol">
              🎓
            </div>
          </div>

          <div className="transpo-header-bottom">
            <div className="live-clock">
              <button
                type="button"
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={
                  darkMode
                    ? "Switch to light theme"
                    : "Switch to dark theme"
                }
              >
                {darkMode ? "☀" : "☾"}
              </button>

              <span className="clock-dot" />

              <strong>
                {clock || "--:--:--"}
              </strong>
            </div>

            <div className="header-actions">
              <button
                type="button"
                className="login-button"
                onClick={() =>
                  setError(
                    "Login / Sign Up will be added later."
                  )
                }
              >
                Login / Sign Up
              </button>

              <button
                type="button"
                className="help-button"
                onClick={() =>
                  setError(
                    "FAQ and Help will be added later."
                  )
                }
                aria-label="Help"
              >
                ?
              </button>
            </div>
          </div>
        </header>
                <section className="transport-tabs-card">
          <button
            type="button"
            className={`transport-tab ${
              transport === "Bus" ? "active" : ""
            }`}
            onClick={() => setTransport("Bus")}
          >
            <span>🚌</span>
            Bus Timings
          </button>

          <button
            type="button"
            className={`transport-tab-icon ${
              transport === "Auto" ? "active" : ""
            }`}
            onClick={() => setTransport("Auto")}
            aria-label="Auto"
          >
            🛺
          </button>

          <button
            type="button"
            className={`transport-tab-icon ${
              transport === "Jeep" ? "active" : ""
            }`}
            onClick={() => setTransport("Jeep")}
            aria-label="Jeep"
          >
            🚙
          </button>

          <button
            type="button"
            className="transport-tab-icon"
            onClick={() =>
              setError(
                "More transport options are coming soon."
              )
            }
            aria-label="More"
          >
            👤
          </button>
        </section>

        {transport === "Bus" ? (
          <>
            <section className="welcome-card">
              <div className="welcome-copy">
                <span className="welcome-small">
                  {welcome.language}
                </span>

                <div
                  key={welcomeIndex}
                  className="welcome-message-animation"
                >
                  <h2>{welcome.title}</h2>
                  <p>{welcome.subtitle}</p>
                </div>
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

            <section className="content-card">
              <div className="section-title">
                <h3>START HERE · QUICK GECW ROUTES</h3>
              </div>

              <div className="quick-grid">
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
                    <div className="quick-route-icon">
                      {route.icon}
                    </div>

                    <div className="quick-route-text">
                      <strong>
                        {route.from} → {route.to}
                      </strong>
                      <span>{route.subtitle}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="content-card search-card-new">
              <h3>Wanna go somewhere else?</h3>

              <div className="route-search">
                <LocationInput
                  label="From"
                  value={from}
                  placeholder="Search starting point"
                  onChange={setFrom}
                  onSelect={(stop) =>
                    setFrom(stop.name)
                  }
                />

                <div className="swap-row">
                  <span />
                  <button
                    type="button"
                    className="swap-button"
                    onClick={swapLocations}
                    aria-label="Swap locations"
                    title="Swap"
                  >
                    ⇅
                  </button>
                  <span />
                </div>

                <LocationInput
                  label="To"
                  value={to}
                  placeholder="Where are you going?"
                  onChange={setTo}
                  onSelect={(stop) =>
                    setTo(stop.name)
                  }
                />
              </div>

              <button
                type="button"
                className="search-bus-button"
                onClick={() => searchRoute()}
                disabled={loading}
              >
                {loading ? "Finding buses..." : "Find Buses"} →
              </button>

              {error && (
                <div
                  className="search-error"
                  role="status"
                >
                  {error}
                </div>
              )}
            </section>

            <section
              ref={resultsRef}
              className="content-card results-card"
            >
              {loading && (
                <div className="result-empty">
                  <div className="big-result-icon">
                    🚌
                  </div>
                  <strong>Finding your buses...</strong>
                  <p>
                    Checking direct routes and available
                    connections.
                  </p>
                </div>
              )}

              {!loading &&
                searched &&
                results.length === 0 && (
                  <div className="result-empty">
                    <div className="big-result-icon">
                      🚌
                    </div>
                    <strong>No buses found</strong>
                    <p>
                      We couldn't find a usable bus
                      journey for this route right now.
                    </p>
                  </div>
                )}

              {!loading && results.length > 0 && (
                <>
                  <div className="results-heading">
                    <div>
                      <span>RESULTS</span>
                      <h3>
                        {from} → {to}
                      </h3>
                    </div>

                    <span className="results-count">
                      {results.length}
                    </span>
                  </div>

                  {results.map((journey, index) => {
                    const segment =
                      journey.segments?.[0];

                    const bus = segment?.trip;

                    const isPast =
                      journey.isPast === true;

                    const endpoints =
                      getJourneyEndpoints(journey);

                    const routeStops =
                      getJourneyStops(journey);

                    const isSelected =
                      selectedJourney === journey;

                    return (
                      <article
                        className={`bus-result-new ${
                          isPast ? "past-bus" : ""
                        }`}
                        key={`${bus?.id || "bus"}-${index}`}
                      >
                        <div className="bus-result-heading">
                          <div>
                            <span
                              className={`status-badge ${
                                isPast ? "past" : ""
                              }`}
                            >
                              {isPast
                                ? "DEPARTED"
                                : bus?.isLive
                                ? "LIVE"
                                : journey.transfers > 0
                                ? `${journey.transfers} TRANSFER${
                                    journey.transfers > 1
                                      ? "S"
                                      : ""
                                  }`
                                : "DIRECT"}
                            </span>

                            <h4>
                              {bus
                                ? getBusType(bus)
                                : "Bus"}
                            </h4>

                            <p>
                              {bus?.operator ||
                                "Transport service"}
                              {bus?.vehicleNumber
                                ? ` · ${bus.vehicleNumber}`
                                : ""}
                              {bus?.serviceName
                                ? ` · ${bus.serviceName}`
                                : ""}
                            </p>
                          </div>

                          <span className="upcoming-dot">
                            {isPast
                              ? "Already departed"
                              : bus?.isLive
                              ? "● Live service"
                              : "● Upcoming"}
                          </span>
                        </div>

                        <div className="result-route">
                          <div>
                            <span>DEPARTS</span>
                            <strong>
                              {formatTime(
                                journey.departureTime ||
                                  segment?.from
                                    .departureTime
                              )}
                            </strong>
                            <small>
                              {endpoints.from ||
                                from}
                            </small>
                          </div>

                          <div className="result-arrow">
                            →
                          </div>

                          <div>
                            <span>ARRIVES</span>
                            <strong>
                              {formatTime(
                                journey.arrivalTime ||
                                  segment?.to
                                    .arrivalTime
                              )}
                            </strong>
                            <small>
                              {endpoints.to || to}
                            </small>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            justifyContent:
                              "space-between",
                            gap: "10px",
                            marginTop: "12px",
                            color: "var(--text-muted, #888)",
                            fontSize: "12px",
                          }}
                        >
                          <span>
                            {journey.totalDurationMinutes
                              ? `${journey.totalDurationMinutes} min`
                              : "Duration unavailable"}
                          </span>

                          <span>
                            {journey.transfers === 0
                              ? "Direct journey"
                              : `${journey.transfers} transfer${
                                  journey.transfers > 1
                                    ? "s"
                                    : ""
                                }`}
                          </span>
                        </div>

                        {isPast ? (
                          <div className="departed-banner">
                            This bus has already departed.
                          </div>
                        ) : (
                          <div className="leaves-banner">
                            {journey.transfers === 0
                              ? "Direct bus available."
                              : "Connection available."}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setSelectedJourney(
                              isSelected
                                ? null
                                : journey
                            )
                          }
                          style={{
                            marginTop: "12px",
                            border: 0,
                            background:
                              "transparent",
                            color: "#c9382c",
                            fontWeight: 800,
                            padding: "4px 0",
                            cursor: "pointer",
                          }}
                          aria-expanded={isSelected}
                        >
                          {isSelected
                            ? "Hide route"
                            : "View route"}{" "}
                          {isSelected ? "↑" : "↓"}
                        </button>

                        {isSelected && (
                          <div
                            style={{
                              marginTop: "10px",
                              padding:
                                "12px 14px",
                              borderRadius: "12px",
                              background:
                                "var(--route-detail-bg, #f7f7f7)",
                            }}
                          >
                            <strong>
                              Route stops
                            </strong>

                            <div
                              style={{
                                marginTop:
                                  "9px",
                                display:
                                  "grid",
                                gap: "7px",
                              }}
                            >
                              {routeStops.length > 0 ? (
                                routeStops.map(
                                  (stop, stopIndex) => (
                                    <div
                                      key={`${stop.stop.id}-${stop.sequence}`}
                                      style={{
                                        display:
                                          "flex",
                                        gap: "9px",
                                        alignItems:
                                          "center",
                                      }}
                                    >
                                      <span
                                        style={{
                                          width:
                                            "22px",
                                          height:
                                            "22px",
                                          display:
                                            "grid",
                                          placeItems:
                                            "center",
                                          borderRadius:
                                            "50%",
                                          background:
                                            stopIndex ===
                                              0 ||
                                            stopIndex ===
                                              routeStops.length -
                                                1
                                              ? "#c9382c"
                                              : "#ddd",
                                          color:
                                            stopIndex ===
                                              0 ||
                                            stopIndex ===
                                              routeStops.length -
                                                1
                                              ? "#fff"
                                              : "#555",
                                          fontSize:
                                            "10px",
                                          fontWeight:
                                            800,
                                        }}
                                      >
                                        {stopIndex +
                                          1}
                                      </span>

                                      <span>
                                        {stop.stop.name}
                                      </span>
                                    </div>
                                  )
                                )
                              ) : (
                                <span>
                                  Route stop details
                                  are not available
                                  for this service.
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </>
              )}
            </section>
                        <section className="disclaimer-card">
              <div className="info-icon">ℹ</div>

              <div>
                <p>
                  <strong>About GECW Go:</strong>{" "}
                  GECW Go helps students discover
                  available bus routes around
                  Government Engineering College
                  Wayanad. Transport information may
                  change, so always verify timings
                  before travelling.
                </p>
              </div>
            </section>
          </>
        ) : (
          <section className="content-card coming-card">
            <div className="coming-icon">
              {transport === "Auto" ? "🛺" : "🚙"}
            </div>

            <span>COMING SOON</span>

            <h2>
              {transport} services are coming soon
            </h2>

            <p>
              We're working on bringing more local
              transport options to GECW Go.
            </p>

            <button
              type="button"
              className="search-bus-button"
              onClick={() => setTransport("Bus")}
              style={{
                maxWidth: "300px",
                marginInline: "auto",
              }}
            >
              Back to Bus Timings
            </button>
          </section>
        )}

        <footer className="transpo-footer-brand">
          <div className="footer-mark">🚌</div>

          <div>
            <strong>GECW GO</strong>
            <span>
              Find your route. Make your journey.
            </span>
            <small>
              Transport information may change.
              Always verify timings before travelling.
            </small>
          </div>
        </footer>
      </div>
    </main>
  );
}
