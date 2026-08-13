import type { Metadata } from "next";
import { sora, inter } from "@/lib/fonts";
import { SITE_URL, site, routes } from "@/lib/site";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SkipLink } from "@/components/layout/SkipLink";
import { JsonLd } from "@/components/seo/JsonLd";
import { SpideyMode } from "@/components/spidey/SpideyMode";
import { Analytics } from "@/components/analytics/Analytics";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Miguel Casillas — Software Engineer",
    template: "%s — Miguel Casillas",
  },
  description:
    "Software Engineer, builder, and stand-up comedian. Experience, projects, and the occasional joke.",
  alternates: {
    types: {
      "application/rss+xml": [
        { url: routes.feed, title: `${site.name} — Blog` },
      ],
    },
  },
  openGraph: {
    title: "Miguel Casillas — Software Engineer",
    description: "Software Engineer, builder, and stand-up comedian.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Miguel Casillas — Software Engineer",
    description: "Software Engineer, builder, and stand-up comedian.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${inter.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="font-body antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        <SkipLink />
        <JsonLd />
        <Header />
        <main id="main" tabIndex={-1}>{children}</main>
        <Footer />
        <SpideyMode />
        <Analytics />
      </body>
    </html>
  );
}
