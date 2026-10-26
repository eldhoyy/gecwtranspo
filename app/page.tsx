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

  /* =========================
     LOAD THEME
  ========================= */

  useEffect(() => {
    const savedTheme =
      window.localStorage.getItem("gecw-go-theme");

    if (savedTheme === "dark") {
      setDarkMode(true);
      document.documentElement.classList.add(
        "dark-theme"
      );
    } else if (savedTheme === "light") {
      setDarkMode(false);
      document.documentElement.classList.remove(
        "dark-theme"
      );
    } else {
      const prefersDark = window.matchMedia(
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

  /* =========================
     CLOCK
  ========================= */

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

    const timer = window.setInterval(
      updateClock,
      1000
    );

    return () => window.clearInterval(timer);
  }, []);

  /* =========================
     WELCOME LANGUAGE ROTATION
  ========================= */

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWelcomeIndex(
        (current) =>
          (current + 1) % welcomeMessages.length
      );
    }, 3000);

    return () => window.clearInterval(timer);
  }, []);

  /* =========================
     SCROLL TO RESULTS
  ========================= */

  useEffect(() => {
    if (!searched || loading) return;

    const timer = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 200);

    return () => window.clearTimeout(timer);
  }, [searched, loading, results.length]);

  /* =========================
     THEME SWITCH
  ========================= */

  const toggleTheme = () => {
    const nextTheme = !darkMode;

    const changeTheme = () => {
      setDarkMode(nextTheme);

      if (nextTheme) {
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
      typeof documentWithTransition
        .startViewTransition === "function"
    ) {
      documentWithTransition.startViewTransition(
        changeTheme
      );
    } else {
      changeTheme();
    }
  };

  /* =========================
     SEARCH
  ========================= */

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

  /* =========================
     SWAP
  ========================= */

  const swapLocations = () => {
    setFrom(to);
    setTo(from);
  };

  /* =========================
     QUICK ROUTE
  ========================= */

  const useQuickRoute = (
    routeFrom: string,
    routeTo: string
  ) => {
    setTransport("Bus");
    setFrom(routeFrom);
    setTo(routeTo);

    setTimeout(() => {
      searchRoute(routeFrom, routeTo);
    }, 0);
  };

  const welcome = welcomeMessages[welcomeIndex];

  return (
    <main className="transpo-page">
      <div className="transpo-shell">

        {/* =================================
            HEADER
        ================================= */}

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

        {/* =================================
            TRANSPORT SELECTOR
        ================================= */}

        <section className="transport-tabs-card">

          <button
            type="button"
            className={`transport-tab ${
              transport === "Bus"
                ? "active"
                : ""
            }`}
            onClick={() => setTransport("Bus")}
          >
            <span>🚌</span>
            Bus Timings
          </button>

          <button
            type="button"
            className={`transport-tab-icon ${
              transport === "Auto"
                ? "active"
                : ""
            }`}
            onClick={() => setTransport("Auto")}
            aria-label="Auto"
          >
            🛺
          </button>

          <button
            type="button"
            className={`transport-tab-icon ${
              transport === "Jeep"
                ? "active"
                : ""
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

        {/* =================================
            BUS SECTION
        ================================= */}

        {transport === "Bus" ? (
          <>

            {/* =================================
                WELCOME
            ================================= */}

            <section className="welcome-card">

              <div className="welcome-copy">

                <span className="welcome-small">
                  {welcome.language}
                </span>

                <div
                  key={welcomeIndex}
                  className="welcome-message-animation"
                >
                  <h2>
                    {welcome.title}
                  </h2>

                  <p>
                    {welcome.subtitle}
                  </p>
                </div>

              </div>

              {/* KERALA COUNTRYSIDE ANIMATION */}

              <div className="welcome-motion kerala-scene">

                <svg
                  viewBox="0 0 420 220"
                  role="img"
                  aria-label="GECW bus travelling through Kerala greenery"
                >

                  {/* Sky */}

                  <rect
                    x="0"
                    y="0"
                    width="420"
                    height="220"
                    rx="22"
                    fill="#eaf7f0"
                  />

                  {/* Sun */}

                  <circle
                    cx="350"
                    cy="45"
                    r="24"
                    fill="#f5c84b"
                    opacity="0.9"
                  />

                  {/* Hills */}

                  <path
                    d="M0 115 Q65 65 130 112 T260 105 T420 110 V150 H0Z"
                    fill="#9acb91"
                  />

                  {/* Paddy field */}

                  <path
                    d="M0 120 H420 V176 H0Z"
                    fill="#74b96b"
                  />

                  {/* Paddy field lines */}

                  <path
                    d="M0 132 H420"
                    stroke="#a9d879"
                    strokeWidth="3"
                  />

                  <path
                    d="M0 148 H420"
                    stroke="#a9d879"
                    strokeWidth="3"
                  />

                  <path
                    d="M0 164 H420"
                    stroke="#a9d879"
                    strokeWidth="3"
                  />

                  {/* Paddy plants */}

                  <g
                    stroke="#4e9b55"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <path d="M30 175 l-7 -13 M30 175 l7 -14" />
                    <path d="M65 175 l-7 -14 M65 175 l8 -13" />
                    <path d="M100 175 l-7 -14 M100 175 l8 -13" />
                    <path d="M330 175 l-7 -14 M330 175 l8 -13" />
                    <path d="M365 175 l-7 -14 M365 175 l8 -13" />
                    <path d="M395 175 l-7 -14 M395 175 l8 -13" />
                  </g>

                  {/* Coconut tree left */}

                  <g>
                    <path
                      d="M48 135 Q42 90 55 55"
                      fill="none"
                      stroke="#765137"
                      strokeWidth="7"
                    />

                    <path
                      d="
                        M55 58 Q31 45 17 52
                        M55 58 Q39 29 48 18
                        M55 58 Q68 30 84 27
                        M55 58 Q76 48 94 51
                      "
                      fill="none"
                      stroke="#31834c"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                  </g>

                  {/* Coconut tree right */}

                  <g>
                    <path
                      d="M375 138 Q368 95 378 65"
                      fill="none"
                      stroke="#765137"
                      strokeWidth="7"
                    />

                    <path
                      d="
                        M378 67 Q355 53 342 60
                        M378 67 Q364 39 373 27
                        M378 67 Q391 39 408 38
                        M378 67 Q400 56 417 60
                      "
                      fill="none"
                      stroke="#31834c"
                      strokeWidth="6"
                      strokeLinecap="round"
                    />
                  </g>

                  {/* Road */}

                  <path
                    d="M0 174 H420 V220 H0Z"
                    fill="#353535"
                  />

                  {/* Road markings */}

                  <path
                    d="M0 199 H420"
                    stroke="#ffffff"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray="28 25"
                  />

                  {/* Moving bus */}

                  <g className="scene-bus">

                    <rect
  x="0"
  y="136"
  width="116"
  height="48"
  rx="9"
  fill="#e33b32"
/>

<rect
  x="5"
  y="130"
  width="106"
  height="10"
  rx="5"
  fill="#c92f27"
/>

<rect
  x="11"
  y="145"
  width="25"
  height="18"
  rx="3"
  fill="#c5e9f2"
/>

<rect
  x="42"
  y="145"
  width="25"
  height="18"
  rx="3"
  fill="#c5e9f2"
/>

<rect
  x="73"
  y="145"
  width="25"
  height="18"
  rx="3"
  fill="#c5e9f2"
/>

<text
  x="58"
  y="139"
  textAnchor="middle"
  fontSize="7"
  fontWeight="900"
  fill="#ffffff"
>
  GECW GO
</text>

<circle
  cx="25"
  cy="186"
  r="10"
  fill="#202020"
/>

<circle
  cx="91"
  cy="186"
  r="10"
  fill="#202020"
/>

<circle
  cx="25"
  cy="186"
  r="4"
  fill="#999999"
/>

<circle
  cx="91"
  cy="186"
  r="4"
  fill="#999999"
/>

</g>

</svg>
</div>
</section>

<section className="content-card quick-card">
  <div className="section-title">
    <h3>QUICK GECW ROUTES</h3>
  </div>

  <div className="quick-grid">
    {quickRoutes.map(([a, b, subtitle, icon]) => (
      <button
        type="button"
        className="quick-route-card"
        key={`${a}-${b}`}
        onClick={() => quickRoute(a, b)}
      >
        <div className="quick-route-icon">
          {icon}
        </div>

        <div className="quick-route-text">
          <strong>
            {a} → {b}
          </strong>

          <span>
            {subtitle}
          </span>
        </div>
      </button>
    ))}
  </div>
</section>

<section className="content-card search-card-new">
  <h3>Wanna go somewhere else?</h3>

  <div className="route-form">
    <LocationInput
      label="From (Departure)"
      value={from}
      onChange={setFrom}
      onSelect={(s) => setFrom(s.name)}
      placeholder="Search departure place"
    />

    <div className="swap-row">
      <span />

      <button
        type="button"
        className="swap-button"
        onClick={() => {
          setFrom(to);
          setTo(from);
        }}
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
      onSelect={(s) => setTo(s.name)}
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

{searched && (
  <section
    ref={resultsRef}
    className="content-card results-card"
  >
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

    {!loading && results.length === 0 && (
      <div className="result-empty">
        <div className="big-result-icon">
          🔎
        </div>

        <strong>
          No buses found
        </strong>

        <p>
          Try another route or check one of
          the Quick GECW Routes.
        </p>
      </div>
    )}

    {!loading &&
      results.map((journey, index) => {
        const segment = journey.segments[0];

        if (!segment) return null;

        const type = busType(segment.trip);
        const past = Boolean(journey.isPast);

        return (
          <div
            className={`bus-result-new ${
              past ? "past-bus" : ""
            }`}
            key={`${segment.trip.id}-${index}`}
          >
            <div className="bus-result-heading">
              <div>
                <span
                  className={`status-badge ${
                    past ? "past" : ""
                  }`}
                >
                  {past
                    ? "DEPARTED"
                    : "DIRECT BUS"}
                </span>

                <h4>
                  🚌 {type}
                </h4>

                <p>
                  {type === "KSRTC"
                    ? "Kerala State Road Transport Service"
                    : "Private Bus Service"}
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
                <span>DEPARTURE</span>

                <strong>
                  {journey.departureTime ||
                    segment.from.departureTime ||
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
                  {journey.arrivalTime ||
                    segment.to.arrivalTime ||
                    "—"}
                </strong>

                <small>
                  {segment.to.stop.name}
                </small>
              </div>
            </div>

            {!past &&
              journey.waitingTimeMinutes !==
                undefined && (
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

<section className="disclaimer-card">
  <div className="info-icon">
    i
  </div>

  <p>
    <strong>Disclaimer:</strong>{" "}
    Bus timings are collected for student
    convenience. Schedules may change because
    of traffic, holidays, operational changes
    or other circumstances. Please verify
    important journeys before travelling.
  </p>
</section>

<section className="transpo-footer-brand">
  <div className="footer-mark">
    🚌
  </div>

  <div>
    <strong>GECW Go</strong>

    <span>
      {" "}
      · Smart Campus Mobility for Government
      Engineering College Wayanad
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

    <span>
      COMING SOON
    </span>

    <h2>
      {transport === "Auto"
        ? "Verified Auto Network"
        : "Local Jeep Network"}
    </h2>

    <p>
      We're working on bringing reliable local
      transport information to GECW students.
    </p>
  </section>
)}

</div>
</main>
);
}
