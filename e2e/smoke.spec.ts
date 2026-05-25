import { test, expect } from "@playwright/test";

test("home renders and links to the blog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Blog" }).first().click();
  await expect(page).toHaveURL(/\/blog$/);
});

test("the blog list opens a post", async ({ page }) => {
  await page.goto("/blog");
  await page.locator("article a").first().click();
  await expect(page).toHaveURL(/\/blog\/.+/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
