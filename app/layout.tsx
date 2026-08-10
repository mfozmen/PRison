import type { Metadata } from "next";
import {
  Fira_Sans,
  Fira_Code,
  IBM_Plex_Sans,
  IBM_Plex_Mono,
  Alegreya_Sans,
  Inconsolata,
  Barlow,
  JetBrains_Mono,
} from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// One sans and one mono per theme family; globals.css picks the pair that
// matches data-theme. Only the default family is preloaded — the other three
// are declared so their @font-face rules exist, and the browser fetches a file
// only once text is actually set in it.
const firaSans = Fira_Sans({
  variable: "--font-fira-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  preload: false,
});

const alegreyaSans = Alegreya_Sans({
  variable: "--font-alegreya-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

const inconsolata = Inconsolata({
  variable: "--font-inconsolata",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const fontVariables = [
  firaSans.variable,
  firaCode.variable,
  plexSans.variable,
  plexMono.variable,
  alegreyaSans.variable,
  inconsolata.variable,
  barlow.variable,
  jetbrainsMono.variable,
].join(" ");

export const metadata: Metadata = {
  title: "PRison — PR prioritization dashboard",
  description:
    "Track how long your pull requests have been stuck on checks and how long you've been blocking others by not reviewing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontVariables} h-full antialiased`}
    >
      <head>
        {/* Stamps data-theme and data-mode before the first paint, so the page
            never flashes the wrong ground. Its source lives in lib/theme.ts,
            which is also what the tests run. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
