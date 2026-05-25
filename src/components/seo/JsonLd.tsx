import { site } from "@/lib/site";

const BASE = "https://elopenmike.com";

export function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        name: site.name,
        jobTitle: site.role,
        url: BASE,
        sameAs: site.socials
          .filter((s) => s.href.startsWith("http"))
          .map((s) => s.href),
      },
      { "@type": "WebSite", name: site.name, url: BASE },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
