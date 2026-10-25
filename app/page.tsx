"use client";

import { useState } from "react";

const quickRoutes = [
  {
    from: "GECW / Thalapuzha",
    to: "Mananthavady",
  },
  {
    from: "Mananthavady",
    to: "GECW / Thalapuzha",
  },
  {
    from: "GECW / Thalapuzha",
    to: "Sulthan Bathery",
  },
  {
    from: "Sulthan Bathery",
    to: "GECW / Thalapuzha",
  },
  {
    from: "GECW / Thalapuzha",
    to: "Kannur",
  },
  {
    from: "GECW / Thalapuzha",
    to: "Thalassery",
  },
];

export default function Home() {
  const [transport, setTransport] = useState("Bus");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const searchRoute = () => {
    if (!from.trim() || !to.trim()) {
      alert("Please enter both your starting point and destination.");
      return;
    }

    alert(`Searching for buses from ${from} to ${to}`);
  };

  const useQuickRoute = (routeFrom: string, routeTo: string) => {
    setTransport("Bus");
    setFrom(routeFrom);
    setTo(routeTo);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
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

                <button className="find-button" onClick={searchRoute}>
                  Find Buses
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2>
              {transport === "Auto"
                ? "Need an auto?"
                : "Need a local jeep?"}
              <br />
              <span>We’re building it.</span>
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
        <section className="gcw-section">
          <div className="section-heading">
            <h3>Quick GECW Routes</h3>
            <p>Common journeys students make from and around campus.</p>
          </div>

          <div className="quick-routes">
            {quickRoutes.map((route, index) => (
              <button
                key={index}
                className="route-card"
                onClick={() => useQuickRoute(route.from, route.to)}
              >
                <div className="route-icon">🚌</div>

                <strong>
                  {route.from} → {route.to}
                </strong>

                <span>Search buses for this route</span>
              </button>
            ))}
          </div>
        </section>
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
              A student-friendly directory for local jeep services when you
              need an alternative to waiting for a bus.
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
