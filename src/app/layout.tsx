import type { Metadata } from "next";
import { sora, inter } from "@/lib/fonts";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SkipLink } from "@/components/layout/SkipLink";
import { JsonLd } from "@/components/seo/JsonLd";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://elopenmike.com"),
  title: {
    default: "Miguel Casillas — Software Engineer",
    template: "%s — Miguel Casillas",
  },
  description:
    "Software Engineer, builder, and stand-up comedian. Experience, projects, and the occasional joke.",
  openGraph: {
    title: "Miguel Casillas — Software Engineer",
    description: "Software Engineer, builder, and stand-up comedian.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`}>
      <body className="font-body antialiased">
        <SkipLink />
        <JsonLd />
        <Header />
        <main id="main" tabIndex={-1}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
