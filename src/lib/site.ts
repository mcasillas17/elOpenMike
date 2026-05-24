export type NavItem = { label: string; href: string };

export const site = {
  name: "Miguel Casillas",
  firstName: "Miguel",
  lastName: "Casillas",
  role: "Software Engineer",
  tagline: "Builder by day, open-mic by night.",
  intro:
    "I ship software, lift heavy, and occasionally make rooms laugh. Software Engineer focused on building things that work — and a few that web-sling.",
  resumeHref: "/resume.pdf",
  // Only sections that exist in Plan 1. Grow this as later plans land.
  nav: [
    { label: "Experience", href: "/#experience" },
    { label: "Projects", href: "/#projects" },
  ] as NavItem[],
  socials: [
    { label: "GitHub", href: "https://github.com/mcasillas17" },
    // TODO: replace with the real LinkedIn profile URL
    { label: "LinkedIn", href: "https://www.linkedin.com/" },
    { label: "Email", href: "mailto:micasillm@gmail.com" },
  ],
} as const;
