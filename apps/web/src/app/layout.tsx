import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

/**
 * Three faces, three roles. Fraunces leads the headings, Newsreader serves the
 * problem statement and nothing else, and Plex Mono is the language of the
 * whole remaining interface — because outside the statement almost every piece
 * of text here is data.
 */
const display = Fraunces({
  subsets: ["latin", "latin-ext"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

const reading = Newsreader({
  subsets: ["latin", "latin-ext"],
  variable: "--font-newsreader",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Sfera Contester",
    template: "%s · Sfera",
  },
  description: "A contester for algorithmic contests — problems, judging, results.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#131412" },
    { media: "(prefers-color-scheme: light)", color: "#efede6" },
  ],
};

/**
 * Applies the theme before the first paint. Without this the page flashes a
 * dark background before React gets to read localStorage.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("sfera-theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The font variables sit on <html>, not on <body> — `globals.css` builds
    // the family stacks in `:root`, and that is the same element.
    <html
      lang="en"
      data-theme="dark"
      className={`${display.variable} ${reading.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
