import { devices, expect, test } from "@playwright/test";

test("How I work is reachable after projects with usable evidence links", async ({
  page,
}) => {
  await page.goto("/");

  const section = page.locator("#how-i-work");
  await expect(section).toBeVisible();
  await expect(section.getByRole("heading", { name: "How I work" })).toBeVisible();

  const evidence = section.getByRole("link", {
    name: "TuringAgent architecture opens in a new tab",
  });
  await expect(section.getByText("TuringAgent splits ownership across the orchestrator, agent runtime, MCP services, and client.")).toBeVisible();
  await expect(evidence).toHaveAttribute("target", "_blank");
  await expect(evidence).toHaveAttribute("rel", "noopener noreferrer");
  await evidence.focus();
  await expect(evidence).toBeFocused();

  const order = await page.locator("section").evaluateAll((sections) =>
    sections.map((section) => section.id),
  );
  expect(order.indexOf("projects")).toBeLessThan(order.indexOf("how-i-work"));
  expect(order.indexOf("how-i-work")).toBeLessThan(order.indexOf("skills"));
});

test.describe("How I work on touch", () => {
  const iPhone = devices["iPhone 13"];
  test.use({
    viewport: iPhone.viewport,
    deviceScaleFactor: iPhone.deviceScaleFactor,
    hasTouch: iPhone.hasTouch,
    isMobile: iPhone.isMobile,
    userAgent: iPhone.userAgent,
  });

  test("does not overflow and keeps evidence links at a 44px target", async ({
    page,
  }) => {
    await page.goto("/");
    const section = page.locator("#how-i-work");
    await expect(section).toBeVisible();

    for (const link of await section.getByRole("link").all()) {
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }

    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
});
