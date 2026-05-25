export type Clip = { youtubeId: string; title: string };
export type Photo = { src: string; alt: string }; // src under /images/comedy/

// Stand-up clips. youtubeId is the value after `youtu.be/` (or `v=`) in the URL.
export const clips: Clip[] = [
  { youtubeId: "n-AgoNbE7Ms", title: "Laughs Comedy Club, Seattle (Jul 2023)" },
  { youtubeId: "aVqjFdhp5a8", title: "Comedy/Bar, Seattle (Jul 2023)" },
];

// Add photos at public/images/comedy/ and list them here, e.g.
// { src: "/images/comedy/set-1.jpg", alt: "On stage at the open mic" }.
export const photos: Photo[] = [];
