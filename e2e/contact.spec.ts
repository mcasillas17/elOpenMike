import { test, expect } from "@playwright/test";

test("empty submit shows field validation errors", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Please enter your name.")).toBeVisible();
  await expect(page.getByText("Please enter your email address.")).toBeVisible();
  await expect(page.getByText("Please enter a message.")).toBeVisible();
});

test("the honeypot field is present but hidden from users", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.locator('input[name="company"]')).toHaveCount(1);
  // it lives inside an aria-hidden (sr-only) wrapper, so it's not exposed to users
  await expect(
    page.locator('[aria-hidden="true"] input[name="company"]'),
  ).toHaveCount(1);
});
