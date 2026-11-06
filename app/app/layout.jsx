import "./globals.css";
import { Inter, Fraunces, Noto_Sans_Devanagari, Noto_Serif_Devanagari } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["opsz"] });
const notoDev = Noto_Sans_Devanagari({ subsets: ["devanagari", "latin"], variable: "--font-dev", display: "swap" });
const notoDevSerif = Noto_Serif_Devanagari({ subsets: ["devanagari", "latin"], variable: "--font-dev-display", display: "swap" });

export const metadata = {
  title: "AskCart - Guided Shopping Search",
  description: "Ask in plain language. AskCart guides you to the product.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${notoDev.variable} ${notoDevSerif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
