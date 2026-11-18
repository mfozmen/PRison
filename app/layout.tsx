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
  Outfit,
  Spline_Sans_Mono,
  Sora,
  Azeret_Mono,
  Archivo,
  Martian_Mono,
  Familjen_Grotesk,
  Chivo_Mono,
  Lexend,
  DM_Mono,
  Work_Sans,
  Courier_Prime,
  Bricolage_Grotesque,
  Space_Mono,
  Nunito_Sans,
  Overpass_Mono,
  Figtree,
  Red_Hat_Mono,
} from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

// One sans and one mono per theme family; globals.css picks the pair that
// matches data-theme. Only the default family is preloaded — the others are
// declared so their @font-face rules exist, and the browser fetches a file only
// once text is actually set in it.
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

// The nature families. All six are variable fonts, so no weight list: asking
// for static cuts would fetch more files than the single variable one.
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const splineSansMono = Spline_Sans_Mono({
  variable: "--font-spline-sans-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const azeretMono = Azeret_Mono({
  variable: "--font-azeret-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const martianMono = Martian_Mono({
  variable: "--font-martian-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const familjenGrotesk = Familjen_Grotesk({
  variable: "--font-familjen-grotesk",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

const chivoMono = Chivo_Mono({
  variable: "--font-chivo-mono",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

// The palette families (Lilac, Olive, Acid Pop, Terracotta, Moss & Rose). DM
// Mono, Courier Prime and Space Mono ship only static cuts, so they name theirs.
const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"], display: "swap", preload: false });
const dmMono = DM_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"], display: "swap", preload: false });
const workSans = Work_Sans({ variable: "--font-work-sans", subsets: ["latin"], display: "swap", preload: false });
const courierPrime = Courier_Prime({ variable: "--font-courier-prime", subsets: ["latin"], weight: ["400", "700"], display: "swap", preload: false });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], display: "swap", preload: false });
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: ["400", "700"], display: "swap", preload: false });
const nunitoSans = Nunito_Sans({ variable: "--font-nunito-sans", subsets: ["latin"], display: "swap", preload: false });
const overpassMono = Overpass_Mono({ variable: "--font-overpass-mono", subsets: ["latin"], display: "swap", preload: false });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap", preload: false });
const redHatMono = Red_Hat_Mono({ variable: "--font-red-hat-mono", subsets: ["latin"], display: "swap", preload: false });

const fontVariables = [
  firaSans.variable,
  firaCode.variable,
  plexSans.variable,
  plexMono.variable,
  alegreyaSans.variable,
  inconsolata.variable,
  barlow.variable,
  jetbrainsMono.variable,
  outfit.variable,
  splineSansMono.variable,
  sora.variable,
  azeretMono.variable,
  archivo.variable,
  martianMono.variable,
  familjenGrotesk.variable,
  chivoMono.variable,
  lexend.variable,
  dmMono.variable,
  workSans.variable,
  courierPrime.variable,
  bricolage.variable,
  spaceMono.variable,
  nunitoSans.variable,
  overpassMono.variable,
  figtree.variable,
  redHatMono.variable,
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
