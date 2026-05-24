export type Role = {
  company: string;
  title: string;
  start: string; // e.g. "2023"
  end: string; // e.g. "Present"
  location?: string;
  highlights: string[];
  stack?: string[];
};

export const experience: Role[] = [
  {
    company: "Company Name",
    title: "Software Engineer",
    start: "2023",
    end: "Present",
    location: "Remote",
    highlights: [
      "Replace with a measurable accomplishment (what you built, the impact).",
      "Add 2–4 bullets per role. Lead with verbs and numbers.",
    ],
    stack: ["TypeScript", "React", "Node.js"],
  },
  {
    company: "Earlier Company",
    title: "Software Engineer",
    start: "2021",
    end: "2023",
    location: "City, ST",
    highlights: [
      "Another accomplishment with concrete outcome.",
      "Keep these scannable for recruiters.",
    ],
    stack: ["Python", "PostgreSQL"],
  },
];
