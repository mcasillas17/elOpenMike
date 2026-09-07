import { expect, test } from "@playwright/test";
import { experience } from "../src/data/experience";

test("earlier career details remain available without overwhelming the initial view", async ({ page }) => {
  await page.goto("/");
  const role = page.locator("#experience details").first();
  const highlight = role.getByText(experience[1].highlights[0], { exact: true });
  await expect(highlight).toBeHidden();
  await role.locator("summary").click();
  await expect(highlight).toBeVisible();
  await role.locator("summary").click();
  await expect(highlight).toBeHidden();
});

for (const width of [320, 390, 768, 1440]) {
  test(`the ${width}px homepage keeps work and contact reachable without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const portrait = page.getByRole("img", { name: /Miguel Casillas/ });
    await expect(portrait).toBeVisible();
    await expect.poll(() => portrait.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    await page.getByRole("link", { name: /view projects/i }).click();
    await expect(page).toHaveURL(/#projects$/);
    const projects = page.locator("#projects");
    await expect(projects.getByRole("heading", { level: 3 })).toHaveText([
      "ScoreArc", "WallCrawl", "TuringCare", "WebSnag", "TuringAgent", "Watchslinger",
    ]);
    const order = await page.locator("main > section").evaluateAll((sections) => sections.map((section) => section.id));
    expect(order.indexOf("projects")).toBeLessThan(order.indexOf("experience"));

    if (width < 1024) {
      const menu = page.getByRole("button", { name: "Menu" });
      const before = await page.locator("#top").evaluate((section) => section.getBoundingClientRect().top + window.scrollY);
      await menu.click();
      const after = await page.locator("#top").evaluate((section) => section.getBoundingClientRect().top + window.scrollY);
      expect(after).toBe(before);
      await page.locator("#mobile-nav").getByRole("link", { name: "Contact" }).click();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    } else {
      await page.getByRole("navigation", { name: "Site navigation" }).getByRole("link", { name: "Contact" }).click();
    }

    await expect(page).toHaveURL(/#contact$/);
    await expect(page.locator("#contact").getByRole("link", { name: /email me/i })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("product details preserve media controls alongside features and vision", async ({ page }) => {
  await page.goto("/projects/websnag");
  const carousel = page.getByRole("group", { name: "WebSnag screenshot photos" });
  await carousel.getByRole("button", { name: "Next photo" }).click();
  await expect(carousel.getByRole("status")).toHaveText("WebSnag screenshot photo 2 of 4");
  await expect(page.getByRole("heading", { name: "What it does", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vision", exact: true })).toBeVisible();
  await expect(page.getByRole("note", { name: "Current status" })).toHaveCount(0);
});
