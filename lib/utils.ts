export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/[.,/()'’`\-–—]+/g, " ").replace(/\s+/g, " ");
}
export function slugify(value: string): string {
  return normalizeName(value).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}
export function decodeHtml(value: string): string {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}
export function timeToMinutes(value?: string | null): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 23 || (match[3] && hour > 12)) return Number.MAX_SAFE_INTEGER;
  const period = match[3]?.toLowerCase();
  if (period === "am" && hour === 12) hour = 0;
  if (period === "pm" && hour !== 12) hour += 12;
  return hour * 60 + minute;
}
export function parseTime(value?: string | null): { minutes: number; valid: boolean } {
  const minutes = timeToMinutes(value);
  return { minutes, valid: minutes !== Number.MAX_SAFE_INTEGER };
}
export function elapsedMinutes(departure: string, arrival: string): number {
  const start = timeToMinutes(departure);
  const end = timeToMinutes(arrival);
  if (start === Number.MAX_SAFE_INTEGER || end === Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  return (end - start + 1440) % 1440;
}
