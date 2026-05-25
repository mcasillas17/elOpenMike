import { test, expect } from "@playwright/test";

test("empty submit shows field validation errors", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Please enter your name.")).toBeVisible();
  await expect(page.getByText("Please enter your email address.")).toBeVisible();
  await expect(page.getByText("Please enter a message.")).toBeVisible();
});

test("the honeypot field is present and hidden", async ({ page }) => {
  await page.goto("/contact");
  const honeypot = page.locator('input[name="company"]');
  await expect(honeypot).toHaveCount(1);
  await expect(honeypot).toBeHidden();
});
