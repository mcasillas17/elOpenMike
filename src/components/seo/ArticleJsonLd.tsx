import { site } from "@/lib/site";

const BASE = "https://elopenmike.com";

// BlogPosting structured data for a blog post (Google rich results).
export function ArticleJsonLd({
  slug,
  title,
  description,
  date,
  tags,
}: {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
}) {
  const url = `${BASE}/blog/${slug}`;
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    datePublished: date,
    dateModified: date,
    author: { "@type": "Person", name: site.name, url: BASE },
    keywords: tags.join(", "),
    url,
    mainEntityOfPage: url,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
