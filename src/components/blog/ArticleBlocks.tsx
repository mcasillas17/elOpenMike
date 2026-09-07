import { Children, type ReactNode } from "react";

type ChildrenProps = { children?: ReactNode };

export function ArticleCallout({
  children,
  tone = "note",
  icon,
}: ChildrenProps & { tone?: "note" | "warning"; icon?: string; color?: string }) {
  const warning = tone === "warning";
  return (
    <aside role="note" aria-label={warning ? "Warning" : "Note"} className={`article-callout ${warning ? "article-callout-warning" : ""}`}>
      <div className="article-callout-label">
        <span aria-hidden="true">{icon || (warning ? "!" : "+")}</span>
        {warning ? "Watch out" : "Worth keeping in mind"}
      </div>
      <div>{children}</div>
    </aside>
  );
}

export function ArticleToggle({ children }: ChildrenProps) {
  return <details className="article-toggle">{children}</details>;
}

export function ArticleSummary({ children }: ChildrenProps) {
  const hasContent = Children.toArray(children).some((child) =>
    typeof child === "string" ? child.trim() !== "" : true,
  );
  return <summary><span>{hasContent ? children : "Details"}</span></summary>;
}

export function ArticleCaption({ children }: ChildrenProps) {
  return <figcaption className="article-caption">{children}</figcaption>;
}

export function ArticleCode({ children }: ChildrenProps) {
  return <figure className="article-code">{children}</figure>;
}

export function ArticleComparison({ children }: ChildrenProps) {
  return <section aria-label="Code comparison" className="article-comparison">{children}</section>;
}

export function ArticleReference({ children }: ChildrenProps) {
  return (
    <aside role="note" aria-label="Reference" className="article-reference">
      <span aria-hidden="true" className="text-web-strong">&nearr;</span>
      <div className="min-w-0">{children}</div>
    </aside>
  );
}
