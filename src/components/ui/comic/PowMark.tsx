type Color = "spidey" | "web";

type Props = {
  word: string;
  color?: Color;
  rotate?: number; // degrees
};

const COLOR: Record<Color, string> = {
  spidey: "text-spidey-strong",
  web: "text-web-strong",
};

// Top-right rotated "THWIP!"-style tag. Decorative — aria-hidden.
export function PowMark({ word, color = "spidey", rotate = 8 }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute right-3.5 top-3 font-display text-xs font-black tracking-widest ${COLOR[color]}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        textShadow: "var(--text-shadow-pow)",
      }}
    >
      {word}
    </span>
  );
}
