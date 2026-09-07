// @vitest-environment node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type Step = {
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  "continue-on-error"?: boolean;
};

type Job = {
  name: string;
  needs?: string[];
  if?: string;
  env?: Record<string, string>;
  "timeout-minutes": number;
  "continue-on-error"?: boolean;
  steps: Step[];
};

type Workflow = {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency: { group: string; "cancel-in-progress": string };
  jobs: Record<string, Job>;
};

const source = readFileSync(".github/workflows/deploy.yml", "utf8");
const workflow = load(source) as Workflow;
const commands = (job: Job) => job.steps.flatMap((step) => step.run ? [step.run] : []);

describe("pre-merge website workflow", () => {
  it("runs for every PR into main, main push, and merge queue candidate", () => {
    expect(workflow.on).toEqual({
      pull_request: { branches: ["main"] },
      push: { branches: ["main"] },
      merge_group: { types: ["checks_requested"] },
    });
  });

  it("cancels superseded PR checks without cancelling or overlapping main deployments", () => {
    expect(workflow.concurrency).toEqual({
      group: "${{ github.event_name == 'push' && 'deploy-main' || format('website-{0}-{1}', github.event_name, github.event.pull_request.number || github.ref) }}",
      "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
    });
  });

  it("uses read-only permissions, no persisted checkout token, and no PR secrets", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    for (const [id, job] of Object.entries(workflow.jobs)) {
      expect(job["timeout-minutes"]).toBeGreaterThan(0);
      expect(job["timeout-minutes"]).toBeLessThanOrEqual(20);
      expect(job["continue-on-error"]).toBeUndefined();
      for (const step of job.steps) {
        expect(step["continue-on-error"]).toBeUndefined();
        if (step.uses?.startsWith("actions/checkout@")) {
          expect(step.with?.["persist-credentials"]).toBe(false);
          expect(step.with?.ref).toBeUndefined();
        }
      }
      if (id !== "deploy") {
        expect(JSON.stringify(job)).not.toMatch(/secrets\.|sync:notion|flyctl|download-artifact/);
        expect(job.if).toBe(id === "website_checks" ? "${{ always() }}" : undefined);
      }
    }
    expect(source).not.toContain("pull_request_target");
  });

  it("runs all standard checks and browsers against one production build", () => {
    const job = workflow.jobs.production;
    expect(job).toBeDefined();
    expect(job.env?.ARTICLE_PREVIEW).toBe("0");
    expect(commands(job)).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm lint",
      "pnpm test",
      "pnpm resume:verify",
      "pnpm run build",
      "pnpm exec playwright install --with-deps chromium",
      "pnpm e2e",
    ]);
    expect(job.steps.filter((step) => step.run).every((step) => !step.if)).toBe(true);
  });

  it("builds the opt-in specimen separately and exercises every preview-bearing suite", () => {
    const job = workflow.jobs.rich_articles;
    expect(job).toBeDefined();
    expect(job.needs).toBeUndefined();
    expect(job.env?.ARTICLE_PREVIEW).toBe("1");
    expect(commands(job)).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm run build",
      "pnpm exec playwright install --with-deps chromium",
      "pnpm e2e e2e/rich-articles.spec.ts e2e/visitor-flow.spec.ts",
    ]);
    expect(job.steps.filter((step) => step.run).every((step) => !step.if)).toBe(true);
    expect(JSON.stringify(job)).not.toMatch(/\.next.*upload|flyctl/);
  });

  it("preserves browser failure reports in separate short-lived artifacts", () => {
    for (const id of ["production", "rich_articles"]) {
      const job = workflow.jobs[id];
      expect(job).toBeDefined();
      const upload = job.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
      expect(upload?.if).toBe("${{ failure() }}");
      expect(upload?.with).toMatchObject({
        name: `playwright-${id}`,
        path: "playwright-report/\ntest-results/\n",
        "retention-days": 7,
        "if-no-files-found": "warn",
      });
    }
  });

  it("always schedules one stable gate depending on every verification job", () => {
    const gate = workflow.jobs.website_checks;
    expect(gate).toBeDefined();
    expect(gate.name).toBe("Website checks");
    expect(gate.if).toBe("${{ always() }}");
    expect(gate.needs?.toSorted()).toEqual(
      Object.keys(workflow.jobs).filter((id) => !["deploy", "website_checks"].includes(id)).sort(),
    );
    expect(gate.steps).toHaveLength(1);
    expect(gate.steps[0].env).toEqual({
      PRODUCTION_RESULT: "${{ needs.production.result }}",
      RICH_ARTICLES_RESULT: "${{ needs.rich_articles.result }}",
    });
  });

  const results = ["success", "failure", "cancelled", "skipped", ""];
  it.each(results.flatMap((production) => results.map((richArticles) => [production, richArticles])))(
    "gate rejects anything but success: production=%s, rich_articles=%s",
    (production, richArticles) => {
      const gate = workflow.jobs.website_checks;
      expect(gate).toBeDefined();
      const script = gate.steps[0].run;
      expect(script).toBeTruthy();
      const result = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", script!], {
        env: { ...process.env, PRODUCTION_RESULT: production, RICH_ARTICLES_RESULT: richArticles },
        encoding: "utf8",
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(production === "success" && richArticles === "success" ? 0 : 1);
    },
  );

  it("only deploys main push code after the gate, never the preview artifact", () => {
    const deploy = workflow.jobs.deploy;
    expect(deploy.needs).toEqual(["website_checks"]);
    expect(deploy.if).toBe("${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}");
    expect(deploy.env?.ARTICLE_PREVIEW).toBe("0");
    expect(commands(deploy)).toEqual(["flyctl deploy --remote-only"]);
    expect(JSON.stringify(deploy)).not.toContain("download-artifact");
  });
});
