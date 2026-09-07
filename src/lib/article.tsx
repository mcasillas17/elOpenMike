import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { mdxComponents } from "@/components/blog/mdx-components";
import { articleOutline, remarkArticleBlocks, type ArticleHeading } from "./article-syntax";

export async function compileArticle(source: string) {
  const headings: ArticleHeading[] = [];
  const { content } = await compileMDX({
    source,
    components: mdxComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm, remarkArticleBlocks],
        rehypePlugins: [
          rehypeSlug,
          articleOutline(headings),
          [
            rehypeAutolinkHeadings,
            {
              behavior: "after",
              group: {
                type: "element",
                tagName: "div",
                properties: { className: ["heading-group"] },
                children: [],
              },
              properties: {
                className: ["heading-anchor"],
                ariaLabel: "Link to this section",
              },
              content: { type: "text", value: "#" },
            },
          ],
          [rehypePrettyCode, { theme: "github-dark", keepBackground: true }],
        ],
      },
    },
  });
  return { content, headings };
}
