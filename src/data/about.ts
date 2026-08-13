export type About = {
  headline: string;
  bio: string[]; // paragraphs
  turing: { caption: string; images: string[] }; // paths under /images/about/ (first = main shot)
  facts: string[]; // chip labels
};

// Edit freely. Turing photos live under public/images/about/ (first is the main shot).
export const about: About = {
  headline: "Builder, lifter, occasional comedian",
  bio: [
    "I'm a Software Engineer II at Microsoft in Redmond. I'm passionate about AI-powered systems, distributed systems, data-grounded analytics, and observability - building services that stay fast, scalable, and understandable as they grow. Since joining Microsoft in 2018, I've shipped across telemetry SDKs, calendar and scheduling, and large-scale messaging and campaign platforms. Computer Engineering, ITAM.",
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
};
