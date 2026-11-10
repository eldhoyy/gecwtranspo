import { mkdir, writeFile } from "node:fs/promises";

const districts = ["wayanad", "kannur", "kozhikkode", "kasaragod", "malappuram", "alappuzha", "attingal", "ernakulam", "idukki", "kottayam", "muvattupuzha", "palakkad-1", "palakkad-2", "pathanamthitta", "vadakara"];
const base = "https://raw.githubusercontent.com/amith-vp/Kerala-Private-Bus-Timing/main";
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 12000);
await mkdir("public/data/snapshots", { recursive: true });
const manifest = { generatedAt: new Date().toISOString(), provider: "amith-vp/Kerala-Private-Bus-Timing", licence: "No explicit licence file confirmed; check upstream terms before redistribution.", datasets: [] };
try {
  for (const district of districts) {
    try {
      const response = await fetch(`${base}/${district}.json`, { signal: controller.signal, headers: { "User-Agent": "GECW-Go-data-snapshot/1.0", Accept: "application/json" } });
      if (!response.ok) continue;
      const data = await response.json();
      const path = `public/data/snapshots/${district}.json`;
      await writeFile(path, JSON.stringify(data));
      manifest.datasets.push({ district, path, buses: Array.isArray(data.busSchedules) ? data.busSchedules.length : 0 });
    } catch (error) {
      console.warn(`Snapshot skipped for ${district}:`, error.message);
    }
  }
} finally {
  clearTimeout(timeout);
}
manifest.datasets.sort((a, b) => a.district.localeCompare(b.district));
await writeFile("public/data/snapshots/manifest.json", JSON.stringify(manifest, null, 2));
if (!manifest.datasets.some((entry) => entry.district === "wayanad")) throw new Error("Wayanad snapshot missing; refusing to publish an incomplete snapshot.");
console.log(`Saved ${manifest.datasets.length} district snapshots.`);
