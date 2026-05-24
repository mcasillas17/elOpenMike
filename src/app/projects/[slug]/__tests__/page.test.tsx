import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectDetailPage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/projects/[slug]/page";
import { projects, getAllSlugs } from "@/data/projects";

// Drive the tests off the real data so they don't break when projects change.
const sample = projects[0];

describe("/projects/[slug] detail page", () => {
  it("generateStaticParams returns every slug", () => {
    expect(generateStaticParams()).toEqual(
      getAllSlugs().map((slug) => ({ slug })),
    );
  });

  it("renders a known project", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: sample.slug }),
    });
    render(ui);
    expect(
      screen.getByRole("heading", { level: 1, name: sample.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to projects/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("sets metadata title and description from the project", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: sample.slug }),
    });
    expect(meta.title).toBe(sample.title);
    expect(meta.description).toBe(sample.summary);
  });

  it("calls notFound for an unknown slug (throws)", async () => {
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow();
  });
});
