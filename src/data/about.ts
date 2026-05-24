export type About = {
  headline: string;
  bio: string[]; // paragraphs
  turing: { caption: string; image?: string }; // image: path under /images/about/
  facts: string[]; // chip labels
};

// Placeholder content — edit freely. Add a Turing photo at
// public/images/about/turing.jpg and set turing.image to "/images/about/turing.jpg".
export const about: About = {
  headline: "Builder, lifter, occasional comedian",
  bio: [
    "I'm a software engineer who likes shipping things that work — and a few that web-sling. [Replace with 2–3 sentences of your engineering story: what you build and what you care about.]",
    "Off the clock I'm at the gym, deep in a movie or TV rabbit hole, or out at an open mic.",
  ],
  turing: {
    caption:
      "Turing — blue merle Mini American Shepherd, and my best debugging partner.",
    image: "",
  },
  facts: ["🏋️ Lifting", "🎬 Movies & TV", "🕷️ Spider-Man (huge)"],
};
