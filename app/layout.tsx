import type { Metadata } from "next";
import { Instrument_Sans, Newsreader, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { BottomNav } from "@/components/BottomNav";
import { SITE_URL } from "@/lib/site";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});
const splineSansMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
});

const DESCRIPTION =
  "Browse the latest, trending, and famous AI/ML papers, star them, and read in-app with resume + highlight.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "PaperDeck", template: "%s · PaperDeck" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "PaperDeck",
    title: "PaperDeck",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "PaperDeck", description: DESCRIPTION },
};

/**
 * Applies the stored theme before first paint (see the "Preventing Flash"
 * guide in the Next docs). No stored value → follow the system preference.
 */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("pd-theme");if(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)t="dark";if(t==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${newsreader.variable} ${splineSansMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <SiteHeader />
        <main className="flex-1 pb-20 sm:pb-0">{children}</main>
        <SiteFooter />
        <BottomNav />
      </body>
    </html>
  );
}
