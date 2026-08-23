import { test, expect } from "@playwright/test";
import { projects } from "../src/data/projects";

async function expectMinimumTarget(locator: ReturnType<import("@playwright/test").Page["locator"]>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test.describe("desktop accessibility", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("hero clears navigation state after scrolling back from Experience", async ({ page }) => {
    await page.goto("/");
    const experience = page.getByRole("link", { name: "Experience" }).first();
    await expect(experience).not.toHaveClass(/text-web-strong/);
    await expectMinimumTarget(experience);

    await page.locator("#experience").scrollIntoViewIfNeeded();
    await expect(experience).toHaveClass(/text-web-strong/);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(experience).not.toHaveClass(/text-web-strong/);

    await page.goto("/#experience");
    await expect(page.getByRole("link", { name: "Experience" }).first()).toHaveClass(
      /text-web-strong/,
    );
  });

  test("project-card headings follow their surrounding page hierarchy", async ({ page }) => {
    await page.goto("/");
    const homeProjects = page.locator("#projects");
    await expect(homeProjects.getByRole("heading", { level: 2, name: "Selected Projects" })).toBeVisible();
    await expect(homeProjects.getByRole("heading", { level: 3 })).toHaveCount(4);

    await page.goto("/projects");
    await expect(page.getByRole("heading", { level: 1, name: /Casefile/ })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(projects.length);
  });

  test("carousel controls announce the active slide and offer 44px hit areas", async ({ page }) => {
    await page.goto("/");
    const carousel = page.getByRole("group", { name: "Turing photos" });
    await carousel.scrollIntoViewIfNeeded();
    const next = carousel.getByRole("button", { name: "Next photo" });
    await expectMinimumTarget(next);
    await expectMinimumTarget(carousel.getByRole("button", { name: "Go to photo 1" }));
    await expect(carousel.getByRole("status")).toHaveText("Turing photo 1 of 3");
    await next.click();
    await expect(carousel.getByRole("status")).toHaveText("Turing photo 2 of 3");
  });

  test("the project detail back link has a 44px target", async ({ page }) => {
    await page.goto("/projects/light-master");
    await expectMinimumTarget(page.getByRole("link", { name: /Back to The Casefile/ }));
  });
});

test.describe("mobile navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("retains a 44px menu trigger and accessible expanded navigation", async ({ page }) => {
    await page.goto("/");
    const menu = page.getByRole("button", { name: "Menu" });
    await expectMinimumTarget(menu);
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("link", { name: "Experience" }).last()).toBeVisible();
  });
});
