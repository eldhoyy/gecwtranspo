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

function getBusType(
  bus: TransportTrip
): "Private Bus" | "KSRTC" {
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

function getJourneyStops(journey: Journey) {
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

export default function Home() {
  const [transport, setTransport] = useState("Bus");

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [results, setResults] = useState<Journey[]>([]);

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

      setResults(
        Array.isArray(data.directJourneys)
          ? data.directJourneys
          : []
      );
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

        {/* HEADER */}

        <header className="transpo-header-card">
          <div className="transpo-brand-row">
            <div className="transpo-brand-mark">
              🚌
            </div>

            <div className="transpo-brand-text">
              <h1>GECW GO</h1>
              <p>
                GECW · Smart Campus Mobility
              </p>
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

        {/* TRANSPORT SELECTOR */}

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
            {/* WELCOME */}

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
                <svg
                  viewBox="0 0 360 190"
                  role="img"
                  aria-label="Animated bus travelling through Kerala greenery"
                >
                  {/* sky */}
                  <rect
                    x="0"
                    y="0"
                    width="360"
                    height="190"
                    fill="#dff4ff"
                  />

                  {/* clouds */}
                  <g
                    fill="#ffffff"
                    opacity="0.9"
                  >
                    <ellipse
                      cx="55"
                      cy="35"
                      rx="30"
                      ry="12"
                    />
                    <ellipse
                      cx="83"
                      cy="35"
                      rx="22"
                      ry="10"
                    />
                    <ellipse
                      cx="295"
                      cy="42"
                      rx="34"
                      ry="13"
                    />
                  </g>

                  {/* hills */}
                  <path
                    d="M0 100 Q55 55 110 100 T220 100 T360 92 V145 H0Z"
                    fill="#7fcf8b"
                  />

                  <path
                    d="M0 112 Q70 75 140 112 T280 110 T360 105 V150 H0Z"
                    fill="#55b86b"
                  />

                  {/* paddy field */}
                  <rect
                    x="0"
                    y="125"
                    width="360"
                    height="65"
                    fill="#8fd35c"
                  />

                  <path
                    d="M0 145 Q45 135 90 145 T180 145 T270 145 T360 145"
                    fill="none"
                    stroke="#6eb34b"
                    strokeWidth="3"
                  />

                  <path
                    d="M0 160 Q45 150 90 160 T180 160 T270 160 T360 160"
                    fill="none"
                    stroke="#6eb34b"
                    strokeWidth="3"
                  />

                  {/* road */}
                  <path
                    d="M0 157 Q90 140 180 158 T360 150 L360 190 H0Z"
                    fill="#686868"
                  />

                  <path
                    d="M0 170 Q90 153 180 170 T360 162"
                    fill="none"
                    stroke="#f8e68a"
                    strokeWidth="4"
                    strokeDasharray="18 13"
                  />

                  {/* coconut tree 1 */}
                  <g>
                    <path
                      d="M38 130 Q34 88 42 57"
                      stroke="#795548"
                      strokeWidth="7"
                      fill="none"
                    />

                    <path
                      d="M41 61 Q15 50 9 38"
                      stroke="#2f8f46"
                      strokeWidth="5"
                    />

                    <path
                      d="M42 60 Q62 43 78 40"
                      stroke="#2f8f46"
                      strokeWidth="5"
                    />

                    <path
                      d="M42 61 Q37 36 43 22"
                      stroke="#2f8f46"
                      strokeWidth="5"
                    />
                  </g>

                  {/* coconut tree 2 */}
                  <g>
                    <path
                      d="M310 135 Q315 92 307 64"
                      stroke="#795548"
                      strokeWidth="7"
                      fill="none"
                    />

                    <path
                      d="M308 68 Q286 52 275 50"
                      stroke="#2f8f46"
                      strokeWidth="5"
                    />

                    <path
                      d="M308 68 Q332 49 350 50"
                      stroke="#2f8f46"
                      strokeWidth="5"
                    />

                    <path
                      d="M308 68 Q306 43 313 29"
                      stroke="#2f8f46"
                      strokeWidth="5"
                    />
                  </g>

                  {/* moving bus */}

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

            {/* QUICK ROUTES */}

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <span className="section-eyebrow">
                    START HERE
                  </span>

                  <h2>Quick GECW Routes</h2>
                </div>

                <span className="route-count">
                  {quickRoutes.length} routes
                </span>
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

                      <span>
                        {route.subtitle}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {/* SEARCH */}

            <section className="search-card">
              <div className="search-heading">
                <span className="section-eyebrow">
                  JOURNEY PLANNER
                </span>

                <h2>
                  Wanna go somewhere else?
                </h2>

                <p>
                  Search any recognized place,
                  town or bus stop.
                </p>
              </div>

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

                <button
                  type="button"
                  className="swap-button"
                  onClick={swapLocations}
                  aria-label="Swap locations"
                  title="Swap"
                >
                  ⇅
                </button>

                <LocationInput
                  label="To"
                  value={to}
                  placeholder="Where are you going?"
                  onChange={setTo}
                  onSelect={(stop) =>
                    setTo(stop.name)
                  }
                />

                <button
                  type="button"
                  className="find-bus-button"
                  onClick={() => searchRoute()}
                  disabled={loading}
                >
                  {loading
                    ? "Finding..."
                    : "Find Buses"}
                  <span>→</span>
                </button>
              </div>

              {error && (
                <div
                  className="search-message"
                  role="status"
                >
                  {error}
                </div>
              )}
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
                    Checking available direct
                    routes.
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
                      No direct buses found
                    </h3>

                    <p>
                      We couldn't find a direct
                      bus for this route right now.
                    </p>

                    <small>
                      Connecting journeys will be
                      added soon.
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
                        (journey, index) => {
                          const segment =
                            journey.segments?.[0];

                          const bus =
                            segment?.trip;

                          const isPast =
                            journey.isPast === true;

                          return (
                            <article
                              className={`bus-result-card ${
                                isPast
                                  ? "past-bus"
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
                                      : bus?.isLive
                                      ? "live"
                                      : ""
                                  }`}
                                >
                                  {isPast
                                    ? "Departed"
                                    : bus?.isLive
                                    ? "LIVE"
                                    : "Scheduled"}
                                </span>
                              </div>

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
                                    : "Direct route"}
                                </span>

                                <span>
                                  {isPast
                                    ? "This bus has already departed"
                                    : "Direct bus"}
                                </span>
                              </div>
                            </article>
                          );
                        }
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
                  GECW Go helps students discover
                  available bus routes around
                  Government Engineering College
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
              {transport} services are coming soon
            </h2>

            <p>
              We're working on bringing more
              local transport options to GECW Go.
            </p>

            <button
              type="button"
              onClick={() => setTransport("Bus")}
            >
              Back to Bus Timings
            </button>
          </section>
        )}

        {/* FOOTER */}

        <footer className="transpo-footer">
          <strong>GECW GO</strong>

          <span>
            Find your route. Make your journey.
          </span>

          <small>
            Transport information may change.
            Always verify timings before travelling.
          </small>
        </footer>
      </div>
    </main>
  );
}
