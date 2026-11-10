import type { Metadata } from "next";
import { DM_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const bodyFont = DM_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const displayFont = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "GECW Go — Campus journeys, made clearer",
  description: "A student-built bus and journey planner for Government Engineering College Wayanad.",
  manifest: "/manifest.webmanifest",
  themeColor: "#7d1d2b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className={`${bodyFont.variable} ${displayFont.variable}`}>{children}</body></html>;
}
