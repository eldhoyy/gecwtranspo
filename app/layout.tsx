import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GECW Go",
  description:
    "Student-focused transport and journey planner for Government Engineering College Wayanad.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
