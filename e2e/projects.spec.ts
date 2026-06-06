import { test, expect } from "@playwright/test";

// A project-detail URL: /projects/<slug> (one segment, not the index itself).
const DETAIL_URL = /\/projects\/[^/]+$/;

test("home Projects section opens a project detail", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#projects");
  await expect(section).toBeVisible();

  // The first card title links to its detail page; the "View All Issues" link
  // points at /projects (the index), so scope to links with a slug segment.
  const firstCard = section.locator('a[href^="/projects/"]').first();
  await firstCard.click();

  await expect(page).toHaveURL(DETAIL_URL);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test('"View All Issues" navigates to the projects index', async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /View All Issues/i }).click();

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
