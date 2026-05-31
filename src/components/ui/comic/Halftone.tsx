type Props = { opacity?: number };

// Decorative dot-pattern overlay used inside ComicPanel. aria-hidden because
// it carries no information.
export function Halftone({ opacity = 1 }: Props) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.5px)",
        backgroundSize: "6px 6px",
        opacity,
      }}
    />
  );
}
