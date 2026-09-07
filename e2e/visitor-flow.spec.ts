import { expect, test } from "@playwright/test";
import { site } from "../src/lib/site";

test("the live action opens the app without hijacking the card's detail link", async ({ page, context }) => {
  await context.route("https://www.scorearc.futbol/**", (route) => route.fulfill({
    contentType: "text/html",
    body: "<!doctype html><title>Live project destination</title><p>ScoreArc destination</p>",
  }));
  await page.goto("/#projects");
  const card = page.locator("#projects article").filter({
    has: page.getByRole("heading", { name: "ScoreArc", exact: true }),
  });
  const popupPromise = page.waitForEvent("popup");
  await card.getByRole("link", { name: /try it live.*ScoreArc/i }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://www.scorearc.futbol/en/c/world-cup/2026");
  await expect(page).toHaveURL(/\/#projects$/);
  await popup.close();

  const position = await card.evaluate((element) => {
    const image = element.querySelector("img")!.getBoundingClientRect();
    const panel = element.getBoundingClientRect();
    return { x: image.left - panel.left + image.width / 2, y: image.top - panel.top + image.height / 2 };
  });
  await card.click({ position });
  await expect(page).toHaveURL(/\/projects\/scorearc$/);
});

test("project endings continue through the collection and return to its archive", async ({ page }) => {
  await page.goto("/projects/scorearc");
  let navigation = page.getByRole("navigation", { name: "More projects" });
  await navigation.getByRole("link", { name: /next project.*WallCrawl/i }).click();
  await expect(page).toHaveURL(/\/projects\/wallcrawl$/);
  navigation = page.getByRole("navigation", { name: "More projects" });
  await navigation.getByRole("link", { name: /back to products/i }).click();
  await expect(page).toHaveURL(/\/projects#products$/);
  await expect(page.getByRole("heading", { name: "Products", exact: true })).toBeVisible();
});

test("contact copies the visible address with accessible confirmation", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#contact");
  const contact = page.locator("#contact");
  await expect(contact.getByRole("link", { name: site.email })).toBeVisible();
  await contact.getByRole("button", { name: "Copy email" }).click();
  await expect(contact.getByRole("status")).toHaveText("Email address copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(site.email);
});

test("clipboard denial offers manual recovery instead of claiming success", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("Clipboard unavailable")) },
    });
  });
  await page.goto("/#contact");
  const contact = page.locator("#contact");
  await contact.getByRole("button", { name: "Copy email" }).click();
  await expect(contact.getByRole("status")).toHaveText("Could not copy. Select the address and copy it manually.");
  await expect(contact.getByRole("link", { name: site.email })).toBeVisible();
  await expect(contact.getByRole("button", { name: "Try copy again" })).toBeEnabled();
});

test("personal context and company progression remain usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#experience");
  const career = page.locator("#experience");
  await expect(career.getByRole("heading", { level: 3, name: "Microsoft" })).toHaveCount(1);
  await career.locator("details").first().locator("summary").click();
  await expect(career.getByText("C# · Azure · Exchange", { exact: true })).toBeVisible();
  const about = page.locator("#about");
  await about.scrollIntoViewIfNeeded();
  await expect(about.getByText(site.education, { exact: true })).toBeVisible();
  await expect(about.getByRole("img", { name: /Miguel performing stand-up/ })).toBeVisible();
  await expect(about.getByRole("link", { name: "AI agents" })).toHaveAttribute("href", "/projects/turingagent");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("reduced motion leaves card imagery and panels steady", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#projects");
  const card = page.locator("#projects article").first();
  await card.hover();
  expect(await card.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  expect(await card.locator("img").evaluate((image) => getComputedStyle(image).transform)).toBe("none");
});

test("contact remains useful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL}/#contact`);
  const contact = page.locator("#contact");
  await expect(contact.getByRole("link", { name: site.email })).toBeVisible();
  await expect(contact.getByRole("button", { name: "Copy email" })).toHaveCount(0);
  await context.close();
});

test("the opt-in article specimen links to its selected real project", async ({ page }) => {
  test.skip(process.env.ARTICLE_PREVIEW !== "1", "Requires the existing opt-in article specimen.");
  await page.goto("/preview/article");
  const projects = page.getByRole("navigation", { name: "Projects in this article" });
  await projects.getByRole("link", { name: /TuringCare/ }).click();
  await expect(page).toHaveURL(/\/projects\/turingcare$/);
  await expect(page.getByRole("heading", { level: 1, name: "TuringCare" })).toBeVisible();
});
