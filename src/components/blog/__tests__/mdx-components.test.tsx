import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import type { ReactElement } from "react";
import { mdxComponents } from "@/components/blog/mdx-components";

describe("mdxComponents", () => {
  it("styles inline code (string child) as a pill", () => {
    const Code = mdxComponents.code;
    const { container } = render(<Code>inline</Code>);
    const el = container.querySelector("code");
    expect(el?.className).toContain("bg-surface");
  });

  it("leaves block code (element children) unstyled for Shiki", () => {
    const Code = mdxComponents.code;
    const { container } = render(
      <Code>
        <span>x</span>
      </Code>,
    );
    const el = container.querySelector("code");
    expect(el?.className ?? "").not.toContain("bg-surface");
  });

  it("renders headings with the display font", () => {
    const H2 = mdxComponents.h2;
    const { container } = render(<H2>Heading</H2>);
    expect(container.querySelector("h2")?.className).toContain("font-display");
  });
});

describe("mdxComponents h4", () => {
  it("renders an h4 with display font styling", () => {
    const H4 = mdxComponents.h4;
    render(<H4>Fourth level</H4>);
    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading).toHaveTextContent("Fourth level");
    expect(heading.className).toContain("font-display");
  });
});

describe("rich article content", () => {
  it("keeps images responsive and reserves their intrinsic ratio", () => {
    const Image = mdxComponents.img;
    render(<Image src="/diagram.png" alt="Architecture diagram" />);
    expect(screen.getByRole("img", { name: "Architecture diagram" })).toHaveClass(
      "max-w-full",
      "h-auto",
    );
  });

  it("wraps tables in a labelled horizontal scroller", () => {
    const Table = mdxComponents.table;
    const Th = mdxComponents.th;
    const Td = mdxComponents.td;
    render(
      <Table>
        <thead>
          <tr><Th>Signal</Th></tr>
        </thead>
        <tbody>
          <tr><Td>Error rate</Td></tr>
        </tbody>
      </Table>,
    );

    expect(screen.getByRole("region", { name: "Scrollable table" })).toHaveClass(
      "overflow-x-auto",
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Signal" })).toHaveClass(
      "border-edge",
    );
  });

  it("renders task-list checkboxes at a usable size", () => {
    const Input = mdxComponents.input;
    render(<Input type="checkbox" checked readOnly aria-label="Done" />);
    expect(screen.getByRole("checkbox", { name: "Done" })).toHaveClass(
      "size-5",
    );
  });
});

describe("section permalinks", () => {
  it("places the permalink beside the heading so it is not part of its name", async () => {
    const { content } = await compileMDX({
      source: "## A useful section",
      components: mdxComponents,
      options: {
        mdxOptions: {
          rehypePlugins: [
            rehypeSlug,
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
          ],
        },
      },
    });
    const { container } = render(content as ReactElement);

    expect(
      screen.getByRole("heading", { level: 2, name: "A useful section" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Link to this section" }),
    ).toHaveAttribute("href", "#a-useful-section");
    expect(container.querySelector(".heading-group > h2 + .heading-anchor")).not.toBeNull();
  });
});
