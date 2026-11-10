import Link from "next/link";

const sources = [
  { name: "Kerala Private Bus Timing", role: "District private-bus schedule datasets", licence: "No explicit licence file surfaced in the repository; reuse is subject to upstream terms. Dataset includes a parsing-error disclaimer.", url: "https://github.com/amith-vp/Kerala-Private-Bus-Timing" },
  { name: "Kerala Private Bus Timing API", role: "Route-specific schedule lookup", licence: "Public API; no service-level uptime guarantee. Not treated as a live vehicle feed.", url: "https://github.com/amith-vp/Kerala-Private-Bus-Timing-API" },
  { name: "Kerala State Road Transport Corporation", role: "Published schedule and passing-stop evidence", licence: "Official public timetable pages. Data can change; verify with KSRTC.", url: "https://www.keralartc.com/" },
  { name: "OpenStreetMap", role: "Map geometry and stop locations when available", licence: "ODbL 1.0; attribution required: © OpenStreetMap contributors.", url: "https://www.openstreetmap.org/copyright" },
  { name: "Chalo", role: "Official public tracking link only", licence: "No authorised GECW Go GPS/API feed integrated.", url: "https://chalo.com/chalo-app/track-your-bus-live" },
  { name: "Evidebus / MyBusYatra", role: "Disabled unless explicitly enabled", licence: "HTML scraping is disabled by default. Enable only after reviewing robots.txt and terms.", url: "https://www.evidebus.com/" },
];

export default function DataSourcesPage() {
  return <main className="sources-page"><header><p className="eyebrow">TRANSPARENCY</p><h1>Where the timings come from</h1><p>GECW Go only shows timetable information it can trace to a source. A published schedule is not a live GPS location.</p><Link href="/">← Back to GECW Go</Link></header><div className="sources-list">{sources.map((source) => <article key={source.name}><div><h2>{source.name}</h2><p>{source.role}</p><small>{source.licence}</small></div><a href={source.url} target="_blank" rel="noreferrer">Open source ↗</a></article>)}</div><footer>Bus schedules can contain errors or become outdated. Confirm important journeys with the operator before departure.</footer></main>;
}
