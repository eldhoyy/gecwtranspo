import type { ScheduledStop, TransportTrip } from "@/lib/types";
import { getStopNameVariants } from "@/lib/stops";

const BASE = "https://evidebus.com";

function norm(value: string): string { return value.trim().toLowerCase().replace(/[.,/()\-–—]+/g, " ").replace(/\s+/g, " "); }
function slug(value: string): string { return norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function time(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2]);
  if (min > 59) return null;
  if (m[3]) { if (h < 1 || h > 12) return null; h %= 12; if (m[3].toLowerCase() === "pm") h += 12; }
  else if (h > 23) return null;
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}`;
}
function minutes(value: string | null): number | null { if (!value) return null; const [h,m]=value.split(":").map(Number); return h*60+m; }
function stopMatches(actual: string, requested: string) {
  const a=norm(actual).replace(/[^a-z0-9]/g,"");
  return getStopNameVariants(requested).some(candidate=>{const b=norm(candidate).replace(/[^a-z0-9]/g,""); return a===b||a.includes(b)||b.includes(a);});
}
function makeStop(name:string,sequence:number,arrival:unknown,departure:unknown):ScheduledStop {
  const a=time(arrival), d=time(departure);
  return {stop:{id:`evidebus-${slug(name)}`,name:name.trim()},sequence,arrivalTime:a,departureTime:d??a};
}
function stripHtml(value:string){return value.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g," ").trim();}
type ParsedRow={name:string;arrival:string;departure:string};
function parseTableRows(html:string):ParsedRow[]{
  const rows:ParsedRow[]=[];
  for(const row of html.match(/<tr\b[\s\S]*?<\/tr>/gi)??[]){
    const cells=(row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi)??[]).map(stripHtml).filter(Boolean);
    if(cells.length<2)continue;
    const times=cells.map(time).filter((v):v is string=>Boolean(v));
    const name=cells.find(c=>!time(c));
    if(!name||name.length<2||name.length>120||!times.length)continue;
    if(/^(stop|station|stop name|station name|arrival|departure|time|via|route)$/i.test(name))continue;
    rows.push({name:name.trim(),arrival:times[0],departure:times[1]??times[0]});
  }
  return rows;
}
function dedupeRows(rows:ParsedRow[]){const seen=new Set<string>();return rows.filter(r=>{const k=`${norm(r.name)}|${r.arrival}|${r.departure}`;if(seen.has(k))return false;seen.add(k);return true;});}
function isPlausibleSchedule(rows:ParsedRow[],from:string,to:string){
  const fi=rows.findIndex(r=>stopMatches(r.name,from)),ti=rows.findIndex(r=>stopMatches(r.name,to));
  if(fi<0||ti<0||fi>=ti)return false;
  const fromTime=minutes(rows[fi].departure||rows[fi].arrival),toTime=minutes(rows[ti].arrival||rows[ti].departure);
  if(fromTime===null||toTime===null)return false;
  let duration=toTime-fromTime;if(duration<0)duration+=1440;
  if(duration<=0||duration>360)return false;
  let previous:number|null=null,dayOffset=0;
  for(const row of rows){
    const current=minutes(row.departure||row.arrival);if(current===null)continue;
    let absolute=current+dayOffset;
    if(previous!==null&&absolute<previous){dayOffset+=1440;absolute=current+dayOffset;}
    if(previous!==null&&absolute-previous>360)return false;
    previous=absolute;
  }
  return true;
}
function parseRoutePage(html:string,from:string,to:string,url:string):TransportTrip[]{
  // Never parse arbitrary page text as timetable data: that caused unrelated
  // navigation/advertisement times to become fake bus stop times.
  const rows=dedupeRows(parseTableRows(html));
  if(rows.length<2||!isPlausibleSchedule(rows,from,to))return[];
  const text=stripHtml(html);
  const isKsrtc=/\bKSRTC\b/i.test(text)&&!/\bPrivate\s+Bus\b/i.test(text);
  const heading=text.match(/(?:KSRTC|Private\s+Bus)[^|]{0,100}/i)?.[0]?.trim();
  const stops=rows.map((r,i)=>makeStop(r.name,i,r.arrival,r.departure));
  return [{id:`evidebus-${slug(url)}`,serviceName:heading||(isKsrtc?"KSRTC service":"Private Bus service"),operator:isKsrtc?"KSRTC":"Private Bus",mode:"bus",source:"evidebus",stops,isLive:/live status|live tracking|live arrival/i.test(text),lastUpdated:new Date().toISOString()}];
}
async function fetchPage(url:string,from:string,to:string){try{const r=await fetch(url,{headers:{Accept:"text/html,application/xhtml+xml"},next:{revalidate:900}});if(!r.ok)return[];return parseRoutePage(await r.text(),from,to,url);}catch{return[];}}
function routeUrls(from:string,to:string){const f=slug(from),t=slug(to);return Array.from(new Set([`${BASE}/bus-timing-from-${f}-to-${t}`,`${BASE}/bus-timing-from-${f}-to-${t}`.replace(/-thalapuzha-/g,"-thalappuzha-")]));}
export async function getEvidebusTrips(from:string,to:string){const trips=(await Promise.all(routeUrls(from,to).map(url=>fetchPage(url,from,to)))).flat();const seen=new Set<string>();return trips.filter(trip=>{const key=`${trip.operator}|${trip.serviceName}|${trip.stops.map(s=>`${norm(s.stop.name)}:${s.departureTime??""}`).join(">")}`;if(seen.has(key))return false;seen.add(key);return true;});}
