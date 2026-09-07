import type { ReactNode } from "react";
import type { ArticleHeading } from "@/lib/article-syntax";
import { ArticleContents } from "./ArticleContents";

export function ArticleReader({ children, headings }: { children: ReactNode; headings: ArticleHeading[] }) {
  const hasOutline = headings.length >= 4;
  return (
    <div data-article-reader className={hasOutline ? "article-layout" : ""}>
      {hasOutline && <ArticleContents headings={headings} />}
      <div data-article-content className="blog-prose min-w-0">{children}</div>
    </div>
  );
}
