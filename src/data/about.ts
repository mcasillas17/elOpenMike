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
    "I'm a Software Engineer II at Microsoft in Redmond. I'm passionate about AI-powered systems, distributed systems, data-grounded analytics, and observability — building services that stay fast, scalable, and understandable as they grow. Over six years at Microsoft I've shipped across telemetry SDKs, calendar & scheduling, and large-scale messaging and campaign platforms. Computer Engineering, ITAM.",
    "Off the clock I'm at the gym, deep in a movie or TV rabbit hole, or out at an open mic.",
  ],
  turing: {
    caption:
      "Turing — blue merle Mini American Shepherd, and my best debugging partner.",
    image: "",
  },
  facts: ["🏋️ Lifting", "🎬 Movies & TV", "🕷️ Spider-Man (huge)"],
};
