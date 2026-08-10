import { test, expect } from "@playwright/test";

// These run against `.next/standalone/server.js` — the artifact the Dockerfile
// builds and Fly runs — rather than against `next start`, which is a different
// server and refuses to run under `output: "standalone"` at all. The two things
// the standalone trace leaves out are `public` and `.next/static`; a server
// started without them answers every page with unstyled, unhydrated HTML and
// 404s every asset, which is exactly the failure the container would have.

test("serves the client bundle the page asks for", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });

  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Every script the document loads comes out of `.next/static`, so at least
  // one of them proves the directory was staged.
  expect(scripts.some((url) => url.includes("/_next/static/"))).toBe(true);
  expect(failed).toEqual([]);
});

test("serves a stylesheet, so the css chunk was staged too", async ({
  page,
}) => {
  await page.goto("/");
  const href = await page
    .locator('link[rel="stylesheet"]')
    .first()
    .getAttribute("href");
  expect(href).toContain("/_next/static/");

  const response = await page.request.get(href as string);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/css");
});

test("serves a file out of public/", async ({ request }) => {
  const response = await request.get("/resume.pdf");
  expect(response.status()).toBe(200);
  expect(Number(response.headers()["content-length"])).toBeGreaterThan(0);
});

test("applies the security headers next.config.ts adds", async ({
  request,
}) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
});
