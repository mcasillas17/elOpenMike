import { site, SITE_URL } from "@/lib/site";

export function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        name: site.name,
        jobTitle: site.role,
        url: SITE_URL,
        sameAs: site.socials
          .filter((s) => s.href.startsWith("http"))
          .map((s) => s.href),
      },
      { "@type": "WebSite", name: site.name, url: SITE_URL },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
