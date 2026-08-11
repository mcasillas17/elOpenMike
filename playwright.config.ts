import { defineConfig, devices } from "@playwright/test";

// The end-to-end run launches the artifact that ships: `next build` writes a
// self-contained server to `.next/standalone`, the Dockerfile stages `public`
// and `.next/static` beside it, and `node server.js` is what Fly runs. Running
// `next start` instead tested a server that never leaves a developer's laptop —
// and said so on every run:
//
//   ⚠ "next start" does not work with "output: standalone" configuration.
//
// `pnpm start` stages exactly what the Dockerfile stages and then starts that
// server, building first when there is nothing to stage, so this works from
// the clean checkout CI's e2e job runs in.
const PORT = 3000;
const HOSTNAME = "127.0.0.1";
const baseURL = `http://${HOSTNAME}:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start",
    url: baseURL,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), HOSTNAME },
  },
});
