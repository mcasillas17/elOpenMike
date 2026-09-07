import { expect, test } from "@playwright/test";

test("short published notes remain free of unnecessary reader controls", async ({ page }) => {
  await page.goto("/blog/grounding-agents-with-mcp");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("On this page", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

test("published article content is readable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`${test.info().project.use.baseURL}/blog/grounding-agents-with-mcp`);
  await expect(page.getByRole("heading", { name: "Grounding agents in real data" })).toBeVisible();
  await expect(page.locator("pre")).toBeVisible();
  await context.close();
});

test.describe("rich Notion article specimen", () => {
  test.skip(process.env.ARTICLE_PREVIEW !== "1", "Requires an opt-in local specimen build.");

  test("desktop reading guide follows real headings and reports completion", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/preview/article");
    const navigation = page.getByRole("navigation", { name: "On this page" });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("link")).toHaveCount(7);
    const reference = navigation.getByRole("link", { name: "Keep the sources attached" });
    await reference.click();
    await expect(page.getByRole("heading", { name: "Keep the sources attached" })).toBeFocused();
    await expect(reference).toHaveAttribute("aria-current", "location");
    await page.locator("[data-article-content]").evaluate((content) =>
      window.scrollTo({ top: content.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 20, behavior: "instant" }),
    );
    await expect(page.getByRole("progressbar", { name: "Reading progress" })).toHaveAttribute("aria-valuenow", "100");
  });

  for (const width of [320, 390]) {
    test(`at ${width}px comparisons stack, the guide collapses, and nothing widens the page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/preview/article");
      const guide = page.locator(".article-contents details");
      await expect(guide).not.toHaveAttribute("open");
      await guide.locator("summary").click();
      await guide.getByRole("link", { name: "Make the tradeoff visible" }).click();
      await expect(guide).not.toHaveAttribute("open");
      const examples = page.locator(".article-comparison .article-code");
      const gap = await examples.evaluateAll(([before, after]) =>
        after.getBoundingClientRect().top - before.getBoundingClientRect().bottom,
      );
      expect(gap).toBeGreaterThanOrEqual(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("each comparison copies its own code without its caption", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/preview/article");
    const examples = page.locator(".article-comparison .article-code");
    for (let index = 0; index < 2; index += 1) {
      const example = examples.nth(index);
      const code = await example.locator("pre").innerText();
      await example.getByRole("button", { name: "Copy code", exact: true }).click();
      await expect(example.getByRole("status")).toHaveText("Code copied");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
    }
  });

  test("figures can be enlarged, zoomed, and dismissed back to the trigger", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/preview/article");
    const trigger = page.getByRole("button", { name: "Expand image" });
    await trigger.click();
    const viewer = page.getByRole("dialog", { name: "Full-size image" });
    await expect(viewer).toBeVisible();
    await viewer.getByRole("button", { name: "Zoom image" }).click();
    await expect(viewer.getByRole("button", { name: "Fit image" })).toHaveAttribute("aria-pressed", "true");
    expect(await viewer.locator("img").evaluate((image) =>
      image.getBoundingClientRect().width > image.parentElement!.clientWidth,
    )).toBe(true);
    await page.keyboard.press("Escape");
    await expect(viewer).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("optional details still work with JavaScript disabled", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${test.info().project.use.baseURL}/preview/article`);
    const toggle = page.locator(".article-toggle");
    const heading = toggle.getByRole("heading", { name: "A detail, not a chapter" });
    await expect(heading).not.toBeVisible();
    await toggle.locator("summary").click();
    await expect(heading).toBeVisible();
    await context.close();
  });

  test("the specimen stays out of publishing surfaces and keeps the existing CSP", async ({ page, request }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto("/preview/article");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(response?.headers()["content-security-policy"]).not.toContain("unsafe-eval");
    expect(errors).toEqual([]);
    for (const path of ["/feed.xml", "/sitemap.xml"]) {
      const body = await (await request.get(path)).text();
      expect(body).not.toContain("/preview/article");
    }
  });
});
