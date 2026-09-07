import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";

describe("YouTubeEmbed", () => {
  it("keeps a graphic fallback until play, then loads a privacy-enhanced player with origin identification", () => {
    const { container } = render(
      <YouTubeEmbed youtubeId="abc123" title="My set" />,
    );
    const btn = screen.getByRole("button", { name: "Play: My set" });
    expect(btn).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();

    fireEvent.click(btn);

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/abc123?autoplay=1",
    );
    expect(iframe).toHaveAttribute("loading", "lazy");
    expect(iframe).toHaveAttribute(
      "referrerpolicy",
      "strict-origin-when-cross-origin",
    );
    expect(iframe).toHaveAttribute("title", "My set");
    expect(iframe).toHaveAttribute("allowfullscreen");
  });

  it("shows a supplied local poster without loading any YouTube resource", () => {
    const { container } = render(
      <YouTubeEmbed
        youtubeId="n-AgoNbE7Ms"
        title="Laughs Comedy Club, Seattle (Jul 2023)"
        posterSrc="/images/comedy/n-AgoNbE7Ms.jpg"
      />,
    );
    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    // The caption and play button already name the clip; the poster is decorative.
    expect(image).toHaveAttribute("alt", "");
    const imageUrl = new URL(image!.getAttribute("src")!, "http://localhost");
    expect(imageUrl.origin).toBe("http://localhost");
    expect(imageUrl.searchParams.get("url") ?? imageUrl.pathname).toBe(
      "/images/comedy/n-AgoNbE7Ms.jpg",
    );
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("script, link[rel='preconnect']")).toBeNull();
    expect(container.innerHTML).not.toMatch(/(?:i\.ytimg\.com|www\.youtube-nocookie\.com)/);
  });

  it.each([undefined, "/images/comedy/n-AgoNbE7Ms.jpg"])(
    "keeps the full caption and direct YouTube link outside the media before and after playback (poster: %s)",
    (posterSrc) => {
      const title = "Laughs Comedy Club, Seattle (Jul 2023)";
      const { container } = render(
        <YouTubeEmbed youtubeId="n-AgoNbE7Ms" title={title} posterSrc={posterSrc} />,
      );
      const button = screen.getByRole("button", { name: `Play: ${title}` });
      const caption = container.querySelector("figcaption");
      expect(caption).toHaveTextContent(title);
      expect(button).not.toContainElement(caption);
      const link = screen.getByRole("link", { name: /watch on youtube/i });
      expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=n-AgoNbE7Ms");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
      expect(link).toHaveAccessibleName(expect.stringContaining(title));
      expect(link).toHaveClass("min-h-11");
      expect(button).toHaveClass("min-h-11");

      fireEvent.click(button);

      expect(container.querySelector("iframe")).toBeInTheDocument();
      expect(container.querySelector("figcaption")).toBe(caption);
      expect(caption).toHaveTextContent(title);
      expect(screen.getByRole("link", { name: /watch on youtube/i })).toBe(link);
      expect(link).toBeVisible();
    },
  );

  it("keeps generic project trailer links available without a poster", () => {
    const { container } = render(
      <YouTubeEmbed youtubeId="abc123" title="Project — trailer" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("link", { name: /watch on youtube/i })).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=abc123",
    );
    fireEvent.click(screen.getByRole("button", { name: "Play: Project — trailer" }));
    expect(screen.getByRole("link", { name: /watch on youtube/i })).toBeVisible();
  });

  it("constrains the minimum-height media to its panel width on narrow screens", () => {
    const { container } = render(
      <YouTubeEmbed youtubeId="abc123" title="My set" />,
    );
    const button = screen.getByRole("button", { name: "Play: My set" });
    expect(button.parentElement).toHaveClass("w-full", "min-h-[200px]");
    fireEvent.click(button);
    expect(container.querySelector("iframe")?.parentElement).toHaveClass(
      "w-full",
      "min-h-[200px]",
    );
  });

  it("supports keyboard playback and moves focus to the new player", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <YouTubeEmbed youtubeId="abc123" title="My set" />,
    );
    await user.tab();
    expect(screen.getByRole("button", { name: "Play: My set" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: /watch on youtube/i })).toHaveFocus();
    await user.tab({ shift: true });
    await user.keyboard("{Enter}");
    expect(container.querySelector("iframe")).toHaveFocus();
  });
});
