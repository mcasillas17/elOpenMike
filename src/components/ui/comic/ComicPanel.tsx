import type { CSSProperties, ReactNode } from "react";
import { Halftone } from "./Halftone";
import type { Tint } from "@/lib/projectVisuals";

type Props = {
  tint?: Tint;
  className?: string;
  children: ReactNode;
};

const TINT_STYLE: Record<Tint, CSSProperties> = {
  cover: {
    backgroundImage:
      "radial-gradient(circle at 25% 30%, rgba(27,111,227,0.5), transparent 55%), radial-gradient(circle at 75% 75%, rgba(230,36,41,0.45), transparent 55%)",
    backgroundColor: "#0e1320",
  },
  blue: { backgroundImage: "linear-gradient(135deg, #0e1320, #14274a)" },
  red: { backgroundImage: "linear-gradient(120deg, #1a0e14, #2a1418)" },
  green: { backgroundImage: "linear-gradient(120deg, #0e1a14, #163a26)" },
  purple: { backgroundImage: "linear-gradient(120deg, #1a1024, #2a1a3a)" },
};

const base =
  "relative overflow-hidden border-[3px] border-panel-border bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-spidey";

// Comic-issue panel: thick black border, hard drop-shadow, halftone overlay,
// colored tint. Consumers put IssueTag / PowMark / content inside.
export function ComicPanel({ tint = "blue", className = "", children }: Props) {
  return (
    <article
      className={`${base} ${className}`.trim()}
      style={{
        ...TINT_STYLE[tint],
        boxShadow: "4px 4px 0 var(--color-panel-shadow)",
      }}
    >
      <Halftone />
      {children}
    </article>
  );
}
