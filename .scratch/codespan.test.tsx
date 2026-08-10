import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";

async function renderMdx(source: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

describe("candidates", () => {
  const CASES: Array<[string, string]> = [
    ["plain span with newline", "`a\nb`"],
    ["code element with entity", "<code>a&#10;b</code>"],
    ["code element raw newline", "<code>a\nb</code>"],
    ["code element markdown inside", "<code>a*b*c</code>"],
    ["code element backtick inside", "<code>a`b`c</code>"],
    ["code element lt inside", "<code>a&lt;b&gt;c</code>"],
    ["code element cr entity", "<code>a&#13;b</code>"],
    ["code element tab entity", "<code>a&#9;b</code>"],
  ];
  for (const [name, source] of CASES) {
    it(name, async () => {
      let html = "";
      try {
        const c = await renderMdx(source);
        html = c.innerHTML;
        console.log(`${name.padEnd(34)} => ${JSON.stringify(c.textContent)}  html=${JSON.stringify(html)}`);
      } catch (error) {
        console.log(`${name.padEnd(34)} => THREW ${(error as Error).message.slice(0, 120)}`);
      }
      expect(true).toBe(true);
    });
  }
});
