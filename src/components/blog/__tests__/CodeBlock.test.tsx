import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CodeBlock } from "@/components/blog/CodeBlock";

const code = "const answer: number = 42;";

describe("CodeBlock", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("labels the language and copies the literal rendered code", async () => {
    render(
      <CodeBlock>
        <code data-language="typescript">{code}</code>
      </CodeBlock>,
    );

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(code),
    );
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Code copied");
  });

  it("keeps the copy action available when clipboard access fails", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
      new Error("clipboard unavailable"),
    );
    render(
      <CodeBlock>
        <code data-language="text">plain text</code>
      </CodeBlock>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Copy failed. Select the code and copy it manually.",
    );
    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
  });
});
