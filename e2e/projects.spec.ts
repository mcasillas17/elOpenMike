import { test, expect } from "@playwright/test";

// A project-detail URL: /projects/<slug> (one segment, not the index itself).
const DETAIL_URL = /\/projects\/[^/]+$/;

test("home Projects section opens a project detail", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#projects");
  await expect(section).toBeVisible();

  // The first card title links to its detail page; the "All projects" link
  // points at /projects (the index), so scope to links with a slug segment.
  const firstCard = section.locator('a[href^="/projects/"]').first();
  await firstCard.click();

  await expect(page).toHaveURL(DETAIL_URL);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test('"All projects" navigates to the projects index', async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /All projects/i }).click();

  await expect(page).toHaveURL(/\/projects$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /Casefile/i }),
  ).toBeVisible();
});

test("projects index opens a project detail", async ({ page }) => {
  await page.goto("/projects");
  const firstCard = page.locator('a[href^="/projects/"]').first();
  await firstCard.click();

  await expect(page).toHaveURL(DETAIL_URL);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the archive presents thirteen projects and preserves the original issue numbers", async ({ page, request }) => {
  await page.goto("/projects");
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(13);
  for (const [title, number] of [
    ["ScoreArc", "08"], ["WallCrawl", "07"], ["WebSnag", "06"],
    ["Mexican Mom", "05"], ["Thwiply", "04"], ["TuringAgent", "03"],
    ["TuringCare", "02"], ["Light Master", "01"],
    ["Watchslinger", "13"], ["WebSlinger-CLI", "12"], ["Knights of the Round Table", "11"],
    ["Panda Path", "10"], ["PrehispanicApp", "09"],
  ]) {
    await expect(cards.filter({ has: page.getByRole("heading", { name: title, exact: true }) })).toContainText(`№${number}`);
  }
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const xml = await sitemap.text();
  expect(xml).toContain("/projects/scorearc</loc>");
  expect(xml).toContain("/projects/wallcrawl</loc>");
  for (const slug of ["watchslinger", "webslinger-cli", "coding-skills", "panda-path", "prehispanicapp"]) {
    expect(xml).toContain(`/projects/${slug}</loc>`);
  }
});

for (const width of [390, 1440]) {
  test(`the grouped archive is reachable without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/projects");
    const navigation = page.getByRole("navigation", { name: "Project categories" });
    for (const category of ["Products", "Developer tools", "Games"]) {
      await navigation.getByRole("link", { name: category, exact: true }).click();
      await expect(page.getByRole("region", { name: category }).getByRole("heading", { level: 2 })).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });

  for (const project of [
    { slug: "watchslinger", title: "Watchslinger", repo: "Watchslinger" },
    { slug: "webslinger-cli", title: "WebSlinger-CLI", repo: "WebSlinger-CLI" },
    { slug: "coding-skills", title: "Knights of the Round Table", repo: "coding-skills" },
    { slug: "panda-path", title: "Panda Path", repo: "Panda_Path" },
    { slug: "prehispanicapp", title: "PrehispanicApp", repo: "PrehispanicApp" },
  ]) {
    test(`${project.title} at ${width}px uses a labelled concept and truthful source link`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/projects/${project.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: project.title })).toBeVisible();
      await expect(page.getByRole("img", { name: /concept/i })).toBeVisible();
      await expect(page.getByRole("link", { name: "View Source" })).toHaveAttribute(
        "href", `https://github.com/mcasillas17/${project.repo}`,
      );
      await expect(page.getByRole("heading", { name: "Vision", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Live demo" })).toHaveCount(0);
      if (project.slug === "watchslinger") {
        await expect(page.locator("main")).toContainText("built on Watchy");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }

  for (const project of [
    { slug: "scorearc", title: "ScoreArc", repo: "ScoreArc", count: 1, liveUrl: "https://www.scorearc.futbol/en/c/world-cup/2026" },
    { slug: "wallcrawl", title: "WallCrawl", repo: "WallCrawl", count: 3, liveUrl: null },
    { slug: "turingcare", title: "TuringCare", repo: "TuringCare", count: 2, liveUrl: "https://turingcare.dog/" },
  ]) {
    test(`${project.title} at ${width}px shows real media, features, and vision`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/projects/${project.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: project.title })).toBeVisible();
      const carousel = page.getByRole("group", { name: `${project.title} screenshot photos` });
      const images = carousel.locator("img");
      await expect(images).toHaveCount(project.count);
      for (let index = 0; index < project.count; index += 1) {
        const image = images.nth(index);
        await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
        )).toBe(true);
        await expect(image).toHaveCSS("object-fit", "contain");
        await expect(carousel.getByRole("status")).toHaveText(
          `${project.title} screenshot photo ${index + 1} of ${project.count}`,
        );
        if (project.count > 1) await carousel.getByRole("button", { name: "Next photo" }).click();
      }
      await expect(carousel.getByRole("status")).toHaveText(`${project.title} screenshot photo 1 of ${project.count}`);
      const source = page.getByRole("link", { name: "View Source" });
      await expect(source).toHaveAttribute("href", `https://github.com/mcasillas17/${project.repo}`);
      await expect(source).toHaveAttribute("rel", /noopener/);
      if (project.liveUrl) {
        await expect(page.getByRole("link", { name: "Live demo" })).toHaveAttribute(
          "href", project.liveUrl,
        );
      } else {
        await expect(page.getByRole("link", { name: "Live demo" })).toHaveCount(0);
      }
      await expect(page.getByRole("heading", { level: 2, name: "What it does" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Vision" })).toBeVisible();
      await expect(page.getByRole("note", { name: "Current status" })).toHaveCount(0);
      await expect(page.locator("main")).not.toContainText(/FakeWorkoutPlanner|cutover|scaffold|Engineering proof/i);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      expect(errors).toEqual([]);
    });
  }

  test(`Thwiply at ${width}px presents manual tasks and on-device AI`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/projects/thwiply");
    await expect(page.getByRole("heading", { level: 1, name: "Thwiply" })).toBeVisible();
    await expect(page.getByText(/Create, complete, and delete manual tasks/)).toBeVisible();
    await expect(page.getByText(/Qwen 2\.5.*Gemini Nano/)).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/Gemma 3|scaffold|Current status/i);
    await expect(page.getByRole("heading", { name: "Vision", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}
