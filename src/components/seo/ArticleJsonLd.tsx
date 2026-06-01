import { site, SITE_URL, absoluteUrl, routes } from "@/lib/site";

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
  const url = absoluteUrl(routes.blogPost(slug));
  const data = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    datePublished: date,
    dateModified: date,
    author: { "@type": "Person", name: site.name, url: SITE_URL },
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
