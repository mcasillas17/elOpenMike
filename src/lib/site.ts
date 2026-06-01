export type NavItem = { label: string; href: string };

// Absolute origin used for canonical URLs, sitemap/robots, JSON-LD, and the
// Next metadataBase. Don't hardcode the host anywhere else.
export const SITE_URL = "https://elopenmike.com";

// Internal route paths. Functions for dynamic routes. Section anchors live in
// `site.nav` (they're navigation-specific). Don't hardcode "/projects",
// "/projects/${slug}", "/blog", "/comedy" anywhere else.
export const routes = {
  home: "/",
  projects: "/projects",
  projectDetail: (slug: string) => `/projects/${slug}`,
  blog: "/blog",
  blogPost: (slug: string) => `/blog/${slug}`,
  comedy: "/comedy",
  resume: "/resume.pdf",
  sitemap: "/sitemap.xml",
} as const;

// Build an absolute URL from a route path.
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path === "/" ? "" : path}`;
}

export const site = {
  name: "Miguel Casillas",
  firstName: "Miguel",
  lastName: "Casillas",
  role: "Software Engineer II",
  company: "Microsoft",
  headline:
    "I build AI-powered, distributed systems — services that stay fast, scalable, and observable as they grow.",
  tagline: "Builder by day, open-mic by night.",
  availability: "Open to interesting opportunities",
  intro:
    "I ship software, lift heavy, and occasionally make rooms laugh. Software Engineer focused on building things that work — and a few that web-sling.",
  resumeHref: routes.resume,
  // Only sections that exist in Plan 1. Grow this as later plans land.
  nav: [
    { label: "Experience", href: "/#experience" },
    { label: "Skills", href: "/#skills" },
    { label: "Projects", href: "/#projects" },
    { label: "About", href: "/#about" },
    { label: "Comedy", href: "/#comedy" },
    { label: "Blog", href: routes.blog },
  ] as NavItem[],
  socials: [
    { label: "GitHub", href: "https://github.com/mcasillas17" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/mcasillas17/" },
    { label: "Email", href: "mailto:micasillm@gmail.com" },
  ],
} as const;
