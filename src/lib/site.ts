export type NavItem = { label: string; href: string };

export const site = {
  name: "Miguel Casillas",
  tagline: "Builder by day, open-mic by night.",
  intro:
    "I ship software, lift heavy, and occasionally make rooms laugh. Software Engineer focused on building things that work — and a few that web-sling.",
  resumeHref: "/resume.pdf",
  // Only sections that exist in Plan 1. Grow this as later plans land.
  nav: [{ label: "Experience", href: "#experience" }] as NavItem[],
  socials: [
    { label: "GitHub", href: "https://github.com/mcasillas17" },
    { label: "LinkedIn", href: "https://www.linkedin.com/" },
    { label: "Email", href: "mailto:micasillm@gmail.com" },
  ],
} as const;
