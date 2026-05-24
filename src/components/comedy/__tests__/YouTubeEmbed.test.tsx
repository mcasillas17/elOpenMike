import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";

describe("YouTubeEmbed", () => {
  it("shows a play button facade and loads a nocookie iframe on click", () => {
    const { container } = render(
      <YouTubeEmbed youtubeId="abc123" title="My set" />,
    );
    const btn = screen.getByRole("button", { name: "Play: My set" });
    expect(btn).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();

    fireEvent.click(btn);

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("abc123");
    expect(iframe?.getAttribute("src")).toContain("youtube-nocookie.com");
  });
});
