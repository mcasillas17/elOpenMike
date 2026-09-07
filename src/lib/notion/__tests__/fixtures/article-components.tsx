import type { PropsWithChildren } from "react";

// A deliberately plain mapping: these tests exercise the emitted MDX, not the
// production reader's styling or remark transforms.
export const articleComponents = {
  ArticleCallout: ({ children, icon, tone, color }: PropsWithChildren<{
    icon?: string; tone?: string; color?: string;
  }>) => <aside data-tone={tone} data-color={color} data-icon={icon}>{children}</aside>,
  ArticleToggle: ({ children }: PropsWithChildren) => <details>{children}</details>,
  ArticleSummary: ({ children }: PropsWithChildren) => <summary>{children || "Details"}</summary>,
  ArticleFigure: ({ children }: PropsWithChildren) => <figure>{children}</figure>,
  ArticleCode: ({ children }: PropsWithChildren) => <section data-code="">{children}</section>,
  ArticleCaption: ({ children }: PropsWithChildren) => <figcaption>{children}</figcaption>,
  ArticleReference: ({ children }: PropsWithChildren) => <nav>{children}</nav>,
};
