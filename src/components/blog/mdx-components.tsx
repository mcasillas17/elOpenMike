import type { ComponentProps } from "react";

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
  p: (p: ComponentProps<"p">) => (
    <p className="mb-4 leading-relaxed text-muted" {...p} />
  ),
  a: (p: ComponentProps<"a">) => (
    <a className="text-web underline underline-offset-2 hover:opacity-80" {...p} />
  ),
  ul: (p: ComponentProps<"ul">) => (
    <ul className="mb-4 list-disc space-y-1.5 pl-5 text-muted" {...p} />
  ),
  ol: (p: ComponentProps<"ol">) => (
    <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-muted" {...p} />
  ),
  li: (p: ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  blockquote: (p: ComponentProps<"blockquote">) => (
    <blockquote
      className="mb-4 border-l-2 border-edge pl-4 italic text-muted"
      {...p}
    />
  ),
  hr: (p: ComponentProps<"hr">) => <hr className="my-8 border-edge" {...p} />,
  pre: (p: ComponentProps<"pre">) => (
    <pre
      className="mb-5 overflow-x-auto rounded-xl border border-edge p-4 text-sm leading-relaxed"
      {...p}
    />
  ),
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
};
