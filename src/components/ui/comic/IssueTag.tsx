type Variant = "red" | "blue" | "dark";

type Props = {
  number: string;
  label?: string;
  variant?: Variant;
  rotate?: number; // degrees
};

const VARIANT_BG: Record<Variant, string> = {
  red: "bg-spidey",
  blue: "bg-web",
  dark: "bg-[#111]",
};

// Rotated "№XX" sticker pinned to the top-left of a ComicPanel.
export function IssueTag({
  number,
  label,
  variant = "red",
  rotate = -3,
}: Props) {
  return (
    <span
      className={`absolute -top-2 left-3 z-20 inline-block border-2 border-panel-border px-2.5 py-1 font-display text-[11px] font-black tracking-widest text-white ${VARIANT_BG[variant]}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        boxShadow: "var(--shadow-panel-sm)",
      }}
    >
      №{number}
      {label ? ` · ${label}` : ""}
    </span>
  );
}
