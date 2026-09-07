import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ComedyPage from "@/app/comedy/page";
import { clips } from "@/data/comedy";

describe("/comedy page", () => {
  it("renders the heading and a play button per clip", () => {
    render(<ComedyPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Stand-up" }),
    ).toBeInTheDocument();
    for (const c of clips) {
      expect(
        screen.getByRole("button", { name: `Play: ${c.title}` }),
      ).toBeInTheDocument();
    }
  });

  it("presents two captioned local posters with direct watch links in the video archive", () => {
    render(<ComedyPage />);
    const archive = screen.getByRole("region", { name: "Video archive" });
    const grid = archive.querySelector(".grid");
    expect(grid).toHaveClass("md:grid-cols-2");
    expect(grid).not.toHaveClass("lg:grid-cols-3");
    expect(archive.querySelectorAll("figure")).toHaveLength(2);
    expect(archive.querySelectorAll("img")).toHaveLength(2);
    expect(archive.querySelector("iframe")).toBeNull();
    for (const clip of clips) {
      const figure = within(archive).getByRole("button", {
        name: `Play: ${clip.title}`,
      }).closest("figure")!;
      expect(figure.querySelector("figcaption")).toHaveTextContent(clip.title);
      expect(within(figure).getByRole("link", { name: /watch on youtube/i })).toHaveAttribute(
        "href",
        `https://www.youtube.com/watch?v=${clip.youtubeId}`,
      );
    }
  });

  it("explains playback is optional without claiming upcoming shows", () => {
    render(<ComedyPage />);
    expect(screen.getByText(/youtube only loads when you press play/i)).toBeInTheDocument();
    expect(screen.queryByText(/upcoming|book me|recent sets/i)).not.toBeInTheDocument();
  });
});
