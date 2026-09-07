export type About = {
  headline: string;
  bio: string[]; // paragraphs
  turing: { caption: string; images: string[] }; // paths under /images/about/ (first = main shot)
  facts: string[]; // chip labels
  projectInterests: { label: string; slug: string }[];
};

// Edit freely. Turing photos live under public/images/about/ (first is the main shot).
export const about: About = {
  headline: "Builder, lifter, occasional comedian",
  bio: [
    "Since joining Microsoft in 2018, I've shipped across telemetry SDKs, calendar & scheduling, and large-scale messaging and campaign platforms. I like building systems that another engineer can understand, operate, and build on.",
    "Off the clock I'm at the gym, deep in a movie or TV rabbit hole, or out at an open mic.",
  ],
  turing: {
    caption:
      "Turing — blue merle Mini American Shepherd, and my best debugging partner.",
    images: [
      "/images/about/turing-1.jpg",
      "/images/about/turing-2.jpg",
      "/images/about/turing-3.jpg",
    ],
  },
  facts: ["🏋️ Lifting", "🎬 Movies & TV", "🕷️ Spider-Man (huge)"],
  projectInterests: [
    { label: "Football", slug: "scorearc" },
    { label: "Training", slug: "wallcrawl" },
    { label: "Focus", slug: "websnag" },
    { label: "Life with Turing", slug: "turingcare" },
    { label: "AI agents", slug: "turingagent" },
  ],
};
