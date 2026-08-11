// The site runs in production as a Next.js standalone server: `next build`
// writes a self-contained `.next/standalone` tree, and the Dockerfile copies
// exactly two more things in beside it — `public` and `.next/static`, neither of
// which the trace includes. `next start`, which the end-to-end run used to
// launch, is a different server entirely and says so:
//
//   ⚠ "next start" does not work with "output: standalone" configuration.
//
// So the tests were exercising a server that never ships. This stages the same
// two directories the Dockerfile does, into the same places, and nothing else
// is touched: everything written lives under `.next/standalone`, which the
// build owns.
//
//   Dockerfile                                    here
//   COPY /app/public            ./public          .next/standalone/public
//   COPY /app/.next/standalone  ./                (already there)
//   COPY /app/.next/static      ./.next/static    .next/standalone/.next/static
//
// Run it with no build present and it builds first, so `pnpm e2e` works from a
// clean checkout — which is what CI has, since its e2e job never builds.

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureBuild() {
  const built =
    (await exists(path.join(standalone, "server.js"))) &&
    (await exists(path.join(root, ".next", "BUILD_ID"))) &&
    (await exists(path.join(root, ".next", "static")));
  if (built) return;

  console.log("no standalone build found — running next build");
  const build = spawnSync("pnpm", ["run", "build"], {
    cwd: root,
    stdio: "inherit",
  });
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

// Replaces the staged copy rather than merging into it, so a stale chunk from
// an earlier build cannot be served instead of the one just built. Only the
// destination is removed, and only ever inside `.next/standalone`.
async function stage(from, to) {
  if (!(await exists(from))) return;
  await rm(to, { recursive: true, force: true });
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}

await ensureBuild();
await stage(path.join(root, "public"), path.join(standalone, "public"));
await stage(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
);
console.log("staged public and .next/static into .next/standalone");
