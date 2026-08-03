import type { Metadata } from "next";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const disp = Fraunces({
  subsets: ["latin"],
  variable: "--font-disp",
  weight: ["300", "400", "500"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CarryScan — HIP-3 carry & positioning",
  description:
    "Net carry, positioning radar, weekly reports, and basket tools for Hyperliquid HIP-3 equity perps",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${disp.variable} ${mono.variable} ${sans.variable}`}>
      <body>
        <div className="report">{children}</div>
      </body>
    </html>
  );
}
