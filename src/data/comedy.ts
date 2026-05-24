export type Clip = { youtubeId: string; title: string };
export type Photo = { src: string; alt: string }; // src under /images/comedy/

// Placeholder clips — replace youtubeId/title with your real sets. youtubeId is
// the value after `v=` in a YouTube URL (e.g. ".../watch?v=dQw4w9WgXcQ").
export const clips: Clip[] = [
  { youtubeId: "dQw4w9WgXcQ", title: "Open mic set (replace me)" },
  { youtubeId: "dQw4w9WgXcQ", title: "Crowd work — the dog bit (replace me)" },
  { youtubeId: "dQw4w9WgXcQ", title: "Tech jokes that landed (replace me)" },
];

// Add photos at public/images/comedy/ and list them here, e.g.
// { src: "/images/comedy/set-1.jpg", alt: "On stage at the open mic" }.
export const photos: Photo[] = [];
