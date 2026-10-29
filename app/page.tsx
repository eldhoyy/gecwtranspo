"use client";

import { useEffect, useRef, useState } from "react";
import { searchStops, type SearchStop } from "../lib/stops";

// GECW is intentionally not displayed in the UI. THALAPUZHA is the public transport stop.
// The rest of this file remains unchanged from the current main version.

type ScheduledStop = {
  stop: { id: string; name: string };
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

type JourneySegment = { trip: TransportTrip; from: ScheduledStop; to: ScheduledStop };
type Journey = { segments: JourneySegment[]; transfers: number; totalDurationMinutes?: number; waitingTimeMinutes?: number; departureTime?: string; arrivalTime?: string; isLive?: boolean; isPast?: boolean };

const welcomeMessages = [
  { language: "ENGLISH", title: "Welcome!", subtitle: "Where are we heading today?" },
  { language: "മലയാളം", title: "സ്വാഗതം!", subtitle: "ഇന്ന് എങ്ങോട്ടാണ് യാത്ര?" },
  { language: "हिन्दी", title: "स्वागत है!", subtitle: "आज कहाँ जाना है?" },
];

const quickRoutes = [
  { from: "THALAPUZHA", to: "MANANTHAVADY", subtitle: "Campus Route", icon: "🏫" },
  { from: "MANANTHAVADY", to: "THALAPUZHA", subtitle: "Campus Return", icon: "🚌" },
  { from: "MANANTHAVADY", to: "SULTHAN BATHERY", subtitle: "Wayanad Route", icon: "🚌" },
  { from: "SULTHAN BATHERY", to: "MANANTHAVADY", subtitle: "Wayanad Return", icon: "🚌" },
  { from: "THALAPUZHA", to: "KANNUR", subtitle: "Intercity Route", icon: "🚌" },
  { from: "THALAPUZHA", to: "THALASSERY", subtitle: "Intercity Route", icon: "🚌" },
];

function LocationInput({ label, value, placeholder, onChange, onSelect }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; onSelect: (stop: SearchStop) => void }) {
  const [suggestions, setSuggestions] = useState<SearchStop[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const handleOutsideClick = (event: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setShowSuggestions(false); }; document.addEventListener("mousedown", handleOutsideClick); return () => document.removeEventListener("mousedown", handleOutsideClick); }, []);
  const handleChange = (nextValue: string) => { onChange(nextValue); setSuggestions(searchStops(nextValue)); setShowSuggestions(true); };
  const handleFocus = () => { setSuggestions(searchStops(value)); setShowSuggestions(true); };
  return <div className="transpo-field" ref={wrapperRef}><label>{label}</label><div className="transpo-input-wrap"><span className="field-pin">{label.startsWith("From") ? "●" : "◆"}</span><input type="text" value={value} onChange={(event) => handleChange(event.target.value)} onFocus={handleFocus} placeholder={placeholder} autoComplete="off" /><span className="field-chevron">⌄</span></div>{showSuggestions && suggestions.length > 0 && <div className="location-suggestions">{suggestions.map((stop) => <button type="button" className="location-suggestion" key={stop.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(stop); setShowSuggestions(false); }}><span className="suggestion-icon">📍</span><span><strong>{stop.name}</strong>{stop.aliases?.[0] && <small>{stop.aliases[0]}</small>}</span></button>)}</div>}</div>;
}

function getBusType(bus: TransportTrip): "Private Bus" | "KSRTC" { const source = bus.source.toLowerCase(); const operator = (bus.operator || "").toLowerCase(); return source.includes("public-transport") || source.includes("ksrtc") || operator.includes("ksrtc") || operator.includes("kerala state road") ? "KSRTC" : "Private Bus"; }
function formatTime(value?: string | null) { if (!value) return "--:--"; const text = value.trim().toLowerCase(); const twelveHourMatch = text.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/); if (twelveHourMatch) return `${Number(twelveHourMatch[1]).toString().padStart(2,"0")}:${twelveHourMatch[2]} ${twelveHourMatch[3].toUpperCase()}`; const m = text.match(/^(\d{1,2}):(\d{2})$/); if (m) { let hour=Number(m[1]); const minute=m[2]; const period=hour>=12?"PM":"AM"; if(hour===0)hour=12; else if(hour>12)hour-=12; return `${hour.toString().padStart(2,"0")}:${minute} ${period}`; } return value.replace(/\s+/g," ").trim().replace(/\b(am|pm)\b/i,(match)=>match.toUpperCase()); }
function timeToMinutes(value?: string | null) { if (!value) return Number.MAX_SAFE_INTEGER; const text=value.trim().toLowerCase(); const m=text.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/); if(!m)return Number.MAX_SAFE_INTEGER; let h=Number(m[1]); const min=Number(m[2]); if(m[3]==="am"&&h===12)h=0; if(m[3]==="pm"&&h!==12)h+=12; return h*60+min; }
function sortJourneys(journeys: Journey[]) { return [...journeys].sort((a,b)=>a.transfers!==b.transfers?a.transfers-b.transfers:timeToMinutes(a.departureTime)-timeToMinutes(b.departureTime)); }

export default function Home() {
  const [transport,setTransport]=useState("Bus"); const [from,setFrom]=useState(""); const [to,setTo]=useState(""); const [results,setResults]=useState<Journey[]>([]); const [selectedJourney,setSelectedJourney]=useState<Journey|null>(null); const [loading,setLoading]=useState(false); const [searched,setSearched]=useState(false); const [error,setError]=useState(""); const [clock,setClock]=useState(""); const [darkMode,setDarkMode]=useState(false); const [welcomeIndex,setWelcomeIndex]=useState(0); const resultsRef=useRef<HTMLElement>(null);
  useEffect(()=>{const savedTheme=window.localStorage.getItem("gecw-go-theme");if(savedTheme==="dark"){setDarkMode(true);document.documentElement.classList.add("dark-theme");}else if(savedTheme==="light"){setDarkMode(false);document.documentElement.classList.remove("dark-theme");}else if(window.matchMedia("(prefers-color-scheme: dark)").matches){setDarkMode(true);document.documentElement.classList.add("dark-theme");}},[]);
  useEffect(()=>{const updateClock=()=>setClock(new Intl.DateTimeFormat("en-IN",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date()));updateClock();const t=window.setInterval(updateClock,1000);return()=>window.clearInterval(t);},[]);
  useEffect(()=>{const t=window.setInterval(()=>setWelcomeIndex(c=>(c+1)%welcomeMessages.length),3000);return()=>window.clearInterval(t);},[]);
  useEffect(()=>{if(!searched||loading)return;const t=window.setTimeout(()=>resultsRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),250);return()=>window.clearTimeout(t);},[searched,loading,results.length]);
  const toggleTheme=()=>{const next=!darkMode;setDarkMode(next);document.documentElement.classList.toggle("dark-theme",next);window.localStorage.setItem("gecw-go-theme",next?"dark":"light");};
  const searchRoute=async(searchFrom=from,searchTo=to)=>{const cleanFrom=searchFrom.trim(),cleanTo=searchTo.trim();if(!cleanFrom||!cleanTo){setError("Please select both places.");return;}if(cleanFrom.toLowerCase()===cleanTo.toLowerCase()){setError("Starting point and destination cannot be the same.");return;}setLoading(true);setSearched(true);setError("");setResults([]);setSelectedJourney(null);try{const response=await fetch(`/api/buses/search?from=${encodeURIComponent(cleanFrom)}&to=${encodeURIComponent(cleanTo)}`);const data=await response.json();if(!response.ok||!data.success)throw new Error(data.error||"Search failed.");const journeys=sortJourneys([...(Array.isArray(data.directJourneys)?data.directJourneys:[]),...(Array.isArray(data.connectingJourneys)?data.connectingJourneys:[])]);setResults(journeys);}catch(searchError){console.error("GECW Go search error:",searchError);setError("Unable to find buses right now. Please try again.");}finally{setLoading(false);}};
  const swapLocations=()=>{setFrom(to);setTo(from);};
  const useQuickRoute=(routeFrom:string,routeTo:string)=>{setTransport("Bus");setFrom(routeFrom);setTo(routeTo);setError("");setTimeout(()=>searchRoute(routeFrom,routeTo),0);};
  const welcome=welcomeMessages[welcomeIndex];
  return <main className="transpo-page"><div className="transpo-shell"><header className="transpo-header"><div><div className="brand-mark">GECW GO</div><div className="brand-subtitle">College Transport</div></div><div className="header-actions"><span className="clock">{clock}</span><button type="button" onClick={toggleTheme}>{darkMode?"☀️":"🌙"}</button></div></header><section className="transpo-hero"><div className="welcome-language">{welcome.language}</div><h1>{welcome.title}</h1><p>{welcome.subtitle}</p></section><section className="search-card"><div className="transport-tabs"><button className={transport==="Bus"?"active":""} onClick={()=>setTransport("Bus")}>🚌 Bus</button></div><div className="route-fields"><LocationInput label="From" value={from} placeholder="Enter departure" onChange={setFrom} onSelect={(stop)=>setFrom(stop.name)}/><button type="button" className="swap-button" onClick={swapLocations}>⇄</button><LocationInput label="To" value={to} placeholder="Enter destination" onChange={setTo} onSelect={(stop)=>setTo(stop.name)}/></div><button type="button" className="search-button" onClick={()=>searchRoute()}>Search buses</button>{error&&<p className="search-error">{error}</p>}</section><section className="quick-routes"><div className="section-heading"><h2>Quick routes</h2><span>Verified stops</span></div><div className="quick-route-grid">{quickRoutes.map((route)=><button type="button" key={`${route.from}-${route.to}`} className="quick-route" onClick={()=>useQuickRoute(route.from,route.to)}><span className="quick-route-icon">{route.icon}</span><span><strong>{route.from} → {route.to}</strong><small>{route.subtitle}</small></span></button>)}</div></section><section className="results-section" ref={resultsRef}>{loading?<div className="results-empty"><strong>Finding verified buses…</strong><span>Checking available transport services.</span></div>:searched&&results.length===0?<div className="results-empty"><strong>No verified buses found.</strong><span>Try another route or spelling.</span></div>:results.length>0&&<div><div className="section-heading"><h2>Available buses</h2><span>{results.length} service{results.length===1?"":"s"}</span></div><div className="results-list">{results.map((journey,index)=>{const segment=journey.segments[0];const bus=segment?.trip;return <button type="button" className="journey-card" key={`${bus?.id||"bus"}-${index}`} onClick={()=>setSelectedJourney(journey)}><div className="journey-top"><strong>{getBusType(bus)}</strong><span>{bus?.serviceName||bus?.vehicleNumber||"Verified service"}</span></div><div className="journey-times"><span><small>Departure</small><b>{formatTime(journey.departureTime)}</b></span><span>→</span><span><small>Arrival</small><b>{formatTime(journey.arrivalTime)}</b></span></div></button>})}</div></div>}</section>{selectedJourney&&<div className="journey-detail" onClick={()=>setSelectedJourney(null)}><div className="journey-detail-card" onClick={(e)=>e.stopPropagation()}><button type="button" onClick={()=>setSelectedJourney(null)}>Close</button><h2>Journey details</h2><p>{getBusType(selectedJourney.segments[0].trip)}</p><p>{selectedJourney.segments[0].from.stop.name} → {selectedJourney.segments[0].to.stop.name}</p></div></div>}</div></main>;
}
