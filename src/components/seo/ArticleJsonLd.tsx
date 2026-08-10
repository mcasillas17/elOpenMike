import { site, SITE_URL, absoluteUrl, routes } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";

// BlogPosting structured data for a blog post (Google rich results).
export function ArticleJsonLd({
  slug,
  title,
  description,
  date,
  tags,
  updated,
}: {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  updated?: string;
}) {
  const url = absoluteUrl(routes.blogPost(slug));
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    datePublished: date,
    dateModified: updated ?? date,
    author: { "@type": "Person", name: site.name, url: SITE_URL },
    keywords: tags.join(", "),
    url,
    mainEntityOfPage: url,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
