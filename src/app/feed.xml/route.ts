import { getAllPosts, type PostMeta } from "@/lib/blog";
import { site, absoluteUrl, routes } from "@/lib/site";
import { escapeXml } from "@/lib/xml";

// Prerendered with every other route so the site stays fully static.
export const dynamic = "force-static";

const FEED_TITLE = `${site.name} — Blog`;
const FEED_DESCRIPTION =
  "Notes on AI systems, distributed systems, and observability.";

// RSS requires RFC 822 dates. Post dates are date-only, so pin them to UTC
// midnight rather than letting the runtime's zone shift them a day.
function rfc822(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

export function buildFeedXml(posts: PostMeta[]): string {
  const items = posts
    .map((post) => {
      // The URL is built from a slug, which is a file name on disk and no more
      // trustworthy than the title beside it, so it is escaped like everything
      // else rather than interpolated raw.
      const url = escapeXml(absoluteUrl(routes.blogPost(post.slug)));
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${rfc822(post.date)}</pubDate>`,
        `      <description>${escapeXml(post.excerpt)}</description>`,
        ...post.tags.map(
          (tag) => `      <category>${escapeXml(tag)}</category>`,
        ),
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(FEED_TITLE)}</title>`,
    `    <link>${escapeXml(absoluteUrl(routes.blog))}</link>`,
    `    <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "    <language>en-us</language>",
    `    <atom:link href="${escapeXml(absoluteUrl(routes.feed))}" rel="self" type="application/rss+xml"/>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function GET(): Response {
  return new Response(buildFeedXml(getAllPosts()), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
