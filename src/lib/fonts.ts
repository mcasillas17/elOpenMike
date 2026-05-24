import { Sora, Inter } from "next/font/google";

export const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "800"],
  variable: "--font-sora",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});
