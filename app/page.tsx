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
  isPast?: boolean;
};

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
    subtitle: "Campus Return Route",
    icon: "🚌",
  },
  {
    from: "THALAPUZHA",
    to: "SULTHAN BATHERY",
    subtitle: "Direct Bus Service",
    icon: "🚌",
  },
  {
    from: "SULTHAN BATHERY",
    to: "THALAPUZHA",
    subtitle: "GECW Return Route",
    icon: "🚌",
  },
  {
    from: "THALAPUZHA",
    to: "KANNUR",
    subtitle: "Intercity Journey",
    icon: "🚌",
  },
  {
    from: "THALAPUZHA",
    to: "THALASSERY",
    subtitle: "Intercity Journey",
    icon: "🚌",
  },
];

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
          {label.toLowerCase().startsWith("from") ? "●" : "◆"}
        </span>

        <input
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
    source === "public-transport-api" ||
    source.includes("ksrtc") ||
    operator.includes("ksrtc") ||
    operator.includes("kerala state road")
  ) {
    return "KSRTC";
  }

  return "Private Bus";
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

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("gecw-go-theme");

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

    const timer = setInterval(updateClock, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setWelcomeIndex((current) => {
        return (current + 1) % welcomeMessages.length;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;

    setDarkMode(next);

    if (next) {
      document.documentElement.classList.add("dark-theme");
      window.localStorage.setItem("gecw-go-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark-theme");
      window.localStorage.setItem("gecw-go-theme", "light");
    }
  };

  const searchRoute = async (
    searchFrom = from,
    searchTo = to
  ) => {
    if (!searchFrom.trim() || !searchTo.trim()) {
      setError("Please select both places.");
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
        )}&to=${encodeURIComponent(searchTo)}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Search failed.");
      }

      setResults(data.directJourneys || []);
    } catch (err) {
      console.error(err);
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

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    searchRoute(routeFrom, routeTo);
  };

  const welcome = welcomeMessages[welcomeIndex];
  const resultsRef = useRef<HTMLElement>(null);

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
                title={
                  darkMode
                    ? "Light theme"
                    : "Dark theme"
                }
              >
                {darkMode ? "☾" : "☼"}
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

        {/* TRANSPORT TABS */}
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
            aria-label="More transport"
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

                  <p>
                    {welcome.subtitle}
                  </p>
                </div>
              </div>

              {/* ANIMATED TRAVEL ILLUSTRATION */}
              <div className="welcome-motion">
                <div className="motion-cloud cloud-one">
                  ☁️
                </div>

                <div className="motion-cloud cloud-two">
                  ☁️
                </div>

                <div className="motion-sun">
                  ☀️
                </div>

                <div className="motion-road">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>

                <div className="motion-bus">
                  <div className="motion-bus-top">
                    GECW
                  </div>

                  <div className="motion-window window-one" />
                  <div className="motion-window window-two" />
                  <div className="motion-window window-three" />

                  <div className="motion-wheel wheel-one" />
                  <div className="motion-wheel wheel-two" />
                </div>

                <div className="motion-person">
                  🧑‍🎓
                </div>
              </div>
            </section>

            {/* QUICK ROUTES */}
            <section className="content-card quick-card">
              <div className="section-title">
                <h3>QUICK GECW ROUTES</h3>
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
            <section className="content-card search-card-new">
              <h3>
                Wanna go somewhere else?
              </h3>

              <div className="route-form">
                <LocationInput
                  label="From (Departure)"
                  value={from}
                  onChange={setFrom}
                  onSelect={(stop) =>
                    setFrom(stop.name)
                  }
                  placeholder="Search departure place"
                />

                <div className="swap-row">
                  <span />
                  <button
                    type="button"
                    className="swap-button"
                    onClick={swapLocations}
                    aria-label="Swap locations"
                  >
                    ↔
                  </button>
                  <span />
                </div>

                <LocationInput
                  label="To (Destination)"
                  value={to}
                  onChange={setTo}
                  onSelect={(stop) =>
                    setTo(stop.name)
                  }
                  placeholder="Search destination"
                />

                <button
                  type="button"
                  className="search-bus-button"
                  onClick={() => searchRoute()}
                  disabled={loading}
                >
                  {loading
                    ? "Searching..."
                    : "Search Bus Timings"}
                </button>
              </div>

              {error && (
                <p className="search-error">
                  {error}
                </p>
              )}
            </section>

            {/* RESULTS */}
            {searched && (
              <section className="content-card results-card">
                <div className="results-heading">
                  <div>
                    <span>BUS SEARCH</span>

                    <h3>
                      {from} → {to}
                    </h3>
                  </div>

                  <div className="results-count">
                    {results.length}
                  </div>
                </div>

                {loading && (
                  <div className="result-empty">
                    <div className="big-result-icon">
                      🚌
                    </div>

                    <strong>
                      Finding available buses...
                    </strong>
                  </div>
                )}

                {!loading &&
                  results.length === 0 && (
                    <div className="result-empty">
                      <div className="big-result-icon">
                        🔎
                      </div>

                      <strong>
                        No buses found
                      </strong>

                      <p>
                        Try another route or check
                        one of the Quick GECW Routes.
                      </p>
                    </div>
                  )}

                {!loading &&
                  results.map((journey, index) => {
                    const segment =
                      journey.segments[0];

                    if (!segment) return null;

                    const bus = segment.trip;
                    const past = journey.isPast;
                    const busType = getBusType(bus);

                    return (
                      <div
                        className={`bus-result-new ${
                          past ? "past-bus" : ""
                        }`}
                        key={`${bus.id}-${index}`}
                      >
                        <div className="bus-result-heading">
                          <div>
                            <span
                              className={
                                past
                                  ? "status-badge past"
                                  : "status-badge"
                              }
                            >
                              {past
                                ? "DEPARTED"
                                : "DIRECT BUS"}
                            </span>

                            <h4>
                              🚌 {busType}
                            </h4>

                            <p>
                              {bus.serviceName ||
                                (busType ===
                                "KSRTC"
                                  ? "Kerala State Road Transport Service"
                                  : "Private Bus Service")}
                            </p>
                          </div>

                          {!past && (
                            <span className="upcoming-dot">
                              ● UPCOMING
                            </span>
                          )}
                        </div>

                        <div className="result-route">
                          <div>
                            <span>
                              DEPARTURE
                            </span>

                            <strong>
                              {journey.departureTime ||
                                "—"}
                            </strong>

                            <small>
                              {segment.from.stop.name}
                            </small>
                          </div>

                          <div className="result-arrow">
  →
</div>

<div>
  <span>ARRIVAL</span>

  <strong>
    {journey.arrivalTime || "—"}
  </strong>

  <small>
    {segment.to.stop.name}
  </small>
</div>
</div>

{!past &&
  journey.waitingTimeMinutes !== undefined && (
    <div className="leaves-banner">
      🟢{" "}
      {journey.waitingTimeMinutes === 0
        ? "Leaving now"
        : `Leaves in ${journey.waitingTimeMinutes} min`}
    </div>
  )}

{past && (
  <div className="departed-banner">
    🔴 This bus has already departed
  </div>
)}
</div>
);
})}
</section>
)}

{/* DISCLAIMER */}
<section className="disclaimer-card">
  <div className="info-icon">i</div>

  <p>
    <strong>Disclaimer:</strong>{" "}
    Bus timings are collected for student convenience.
    Schedules may change because of traffic, holidays,
    operational changes or other circumstances. Please
    verify important journeys before travelling.
  </p>
</section>

{/* FOOTER */}
<section className="transpo-footer-brand">
  <div className="footer-mark">
    🚌
  </div>

  <div>
    <strong>GECW Go</strong>

    <span>
      · Smart Campus Mobility for Government Engineering
      College Wayanad
    </span>

    <small>
      Student-focused transport information
    </small>
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
    {transport === "Auto"
      ? "Verified Auto Network"
      : "Local Jeep Network"}
  </h2>

  <p>
    We're working on bringing reliable local transport
    information to GECW students.
  </p>
</section>
)}
</div>
</main>
);
}
        
