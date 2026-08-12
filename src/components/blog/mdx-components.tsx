import type { ComponentProps } from "react";
import { CodeBlock } from "@/components/blog/CodeBlock";

function classes(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base;
}

// Element → styled component map for compiled MDX (on-brand prose).
// Inline vs. block <code> is distinguished by whether children is a string:
// inline code (`x`) has a string child; fenced blocks (via rehype-pretty-code)
// have element children (Shiki <span>s), which we leave untouched.
export const mdxComponents = {
  h1: (p: ComponentProps<"h2">) => (
    <h2 className="mt-10 mb-3 font-display text-2xl font-bold text-ink" {...p} />
  ),
  h2: (p: ComponentProps<"h2">) => (
    <h2 className="mt-10 mb-3 font-display text-2xl font-bold text-ink" {...p} />
  ),
  h3: (p: ComponentProps<"h3">) => (
    <h3 className="mt-8 mb-2 font-display text-xl font-bold text-ink" {...p} />
  ),
  h4: (p: ComponentProps<"h4">) => (
    <h4 className="mt-6 mb-2 font-display text-lg font-bold text-ink" {...p} />
  ),
  p: (p: ComponentProps<"p">) => (
    <p className="mb-4 leading-relaxed text-muted" {...p} />
  ),
  a: (p: ComponentProps<"a">) => (
    <a className="text-web-strong underline underline-offset-2 hover:opacity-80" {...p} />
  ),
  ul: ({ className, ...p }: ComponentProps<"ul">) => (
    <ul
      className={classes("mb-4 list-disc space-y-1.5 pl-5 text-muted", className)}
      {...p}
    />
  ),
  ol: ({ className, ...p }: ComponentProps<"ol">) => (
    <ol
      className={classes("mb-4 list-decimal space-y-1.5 pl-5 text-muted", className)}
      {...p}
    />
  ),
  li: ({ className, ...p }: ComponentProps<"li">) => (
    <li className={classes("leading-relaxed", className)} {...p} />
  ),
  blockquote: (p: ComponentProps<"blockquote">) => (
    <blockquote
      className="mb-4 border-l-2 border-edge pl-4 italic text-muted"
      {...p}
    />
  ),
  hr: (p: ComponentProps<"hr">) => <hr className="my-8 border-edge" {...p} />,
  pre: (p: ComponentProps<"pre">) => <CodeBlock {...p} />,
  code: ({ children, ...p }: ComponentProps<"code">) =>
    typeof children === "string" ? (
      <code
        className="rounded border border-edge bg-surface px-1.5 py-0.5 text-[0.85em] text-ink"
        {...p}
      >
        {children}
      </code>
    ) : (
      <code {...p}>{children}</code>
    ),
  img: ({ alt, className, ...p }: ComponentProps<"img">) => (
    // Content images come from the trusted, build-time blog source.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={classes("h-auto max-w-full rounded-xl border border-edge", className)}
      loading="lazy"
      decoding="async"
      alt={alt ?? ""}
      {...p}
    />
  ),
  table: ({ className, ...p }: ComponentProps<"table">) => (
    <div
      role="region"
      aria-label="Scrollable table"
      tabIndex={0}
      className="mb-6 overflow-x-auto rounded-xl border border-edge"
    >
      <table
        className={classes(
          "w-full min-w-[36rem] border-collapse text-left text-sm",
          className,
        )}
        {...p}
      />
    </div>
  ),
  thead: (p: ComponentProps<"thead">) => <thead className="bg-surface" {...p} />,
  tr: (p: ComponentProps<"tr">) => <tr className="border-b border-edge" {...p} />,
  th: (p: ComponentProps<"th">) => (
    <th className="border-r border-edge px-4 py-3 font-semibold text-ink last:border-r-0" {...p} />
  ),
  td: (p: ComponentProps<"td">) => (
    <td className="border-r border-edge px-4 py-3 text-muted last:border-r-0" {...p} />
  ),
  input: ({ className, ...p }: ComponentProps<"input">) => (
    <input className={classes("size-5 accent-web", className)} {...p} />
  ),
};
