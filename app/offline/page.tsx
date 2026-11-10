import Link from "next/link";

export default function OfflinePage() {
  return <main className="offline-page"><section><p className="eyebrow">GECW GO · OFFLINE</p><h1>You’re offline right now.</h1><p>Saved searches may still be available on this device. Reconnect to refresh bus timings before travelling.</p><Link href="/">Back to journey planner</Link></section></main>;
}
