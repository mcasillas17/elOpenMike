import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ProjectDetailPage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/projects/[slug]/page";
import { projects, getAllSlugs } from "@/data/projects";

const sample = projects[0];

describe("/projects/[slug] detail page", () => {
  it("generateStaticParams returns every slug", () => {
    expect(generateStaticParams()).toEqual(
      getAllSlugs().map((slug) => ({ slug })),
    );
  });

  it("renders the project title as an h1", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: sample.slug }),
    });
    render(ui);
    expect(
      screen.getByRole("heading", { level: 1, name: sample.title }),
    ).toBeInTheDocument();
  });

  it("renders the 'Back to The Casefile' link to /projects", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: sample.slug }),
    });
    render(ui);
    expect(
      screen.getByRole("link", { name: /back to the casefile/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it.each(projects)(
    "presents $title through features and vision instead of engineering audit sections",
    async (project) => {
      const ui = await ProjectDetailPage({
        params: Promise.resolve({ slug: project.slug }),
      });
      render(ui);

      expect(screen.getByRole("heading", { level: 2, name: "What it does" })).toBeInTheDocument();
      for (const highlight of project.highlights) {
        expect(screen.getByText(highlight)).toBeInTheDocument();
      }
      expect(screen.getByRole("heading", { level: 2, name: "Vision" })).toBeInTheDocument();
      expect(screen.getByText(project.vision!)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: /Engineering proof|Evidence & current status|Constraints|Critical decisions/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("note", { name: "Current status" })).not.toBeInTheDocument();
      if (project.caseStudy) {
        expect(screen.queryByText(project.caseStudy.status)).not.toBeInTheDocument();
      }
    },
  );

  it.each(["websnag", "wallcrawl"])("renders %s screenshots in a contained portrait carousel", async (slug) => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug }),
    });
    render(ui);

    const carousel = screen.getByRole("group", {
      name: new RegExp(`${slug} screenshot photos`, "i"),
    });
    expect(carousel.closest("figure")).toHaveClass("max-w-sm");
    expect(carousel.querySelector(".aspect-\\[9\\/16\\]")).toHaveClass(
      "aspect-[9/16]",
    );
    expect(
      screen.getAllByRole("img", { name: new RegExp(`${slug} screenshot`, "i") })[0],
    ).toHaveClass("object-contain");
  });

  it("contains the entire ScoreArc bracket in its landscape carousel", async () => {
    render(await ProjectDetailPage({ params: Promise.resolve({ slug: "scorearc" }) }));
    expect(screen.getByRole("img", { name: /ScoreArc screenshot/ })).toHaveClass("object-contain");
    expect(screen.getByRole("link", { name: "Live demo" })).toHaveAttribute(
      "href", "https://www.scorearc.futbol/en/c/world-cup/2026",
    );
  });

  it("presents TuringCare's public website in a contained two-image carousel", async () => {
    render(await ProjectDetailPage({ params: Promise.resolve({ slug: "turingcare" }) }));
    const carousel = screen.getByRole("group", { name: "TuringCare screenshot photos" });
    const images = carousel.querySelectorAll("img");
    expect(images).toHaveLength(2);
    images.forEach((image) => expect(image).toHaveClass("object-contain"));
    expect(screen.getByRole("link", { name: "Live demo" })).toHaveAttribute("href", "https://turingcare.dog/");
    expect(screen.getByRole("link", { name: /public.*Behavior Brief.*explanation/i })).toHaveAttribute(
      "href", "/images/projects/CREDITS.md",
    );
  });

  it("sets metadata title and description from the project", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: sample.slug }),
    });
    expect(meta.title).toBe(sample.title);
    expect(meta.description).toBe(sample.summary);
  });

  it("continues browsing within the current project collection", async () => {
    render(await ProjectDetailPage({ params: Promise.resolve({ slug: "scorearc" }) }));
    const navigation = screen.getByRole("navigation", { name: "More projects" });
    expect(within(navigation).getByRole("link", { name: /previous project.*Watchslinger/i })).toHaveAttribute("href", "/projects/watchslinger");
    expect(within(navigation).getByRole("link", { name: /next project.*WallCrawl/i })).toHaveAttribute("href", "/projects/wallcrawl");
    expect(within(navigation).getByRole("link", { name: /back to products/i })).toHaveAttribute("href", "/projects#products");
  });

  it("does not wrap the last product into another category", async () => {
    render(await ProjectDetailPage({ params: Promise.resolve({ slug: "turingcare" }) }));
    const navigation = screen.getByRole("navigation", { name: "More projects" });
    expect(within(navigation).queryByRole("link", { name: /next project/i })).not.toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: /previous project.*TuringAgent/i })).toBeInTheDocument();
  });

  it("calls notFound for an unknown slug (throws)", async () => {
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow();
  });
});
