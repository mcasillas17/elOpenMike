#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const outputPath = fileURLToPath(new URL("../public/resume.pdf", import.meta.url));

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Resume - Miguel Casillas</title>
    <style>
      @page { size: Letter; margin: 0.5in 0.55in; }
      * { box-sizing: border-box; }
      body { color: #172033; font-family: Arial, Helvetica, sans-serif; font-size: 10.2pt; line-height: 1.32; margin: 0; }
      main { width: 100%; }
      header { border-bottom: 1px solid #334155; padding-bottom: 10px; text-align: center; }
      h1 { color: #0f172a; font-size: 24pt; letter-spacing: -0.025em; line-height: 1; margin: 0 0 6px; }
      h2 { border-bottom: 1px solid #64748b; color: #0f172a; font-size: 10.5pt; letter-spacing: 0.08em; line-height: 1.2; margin: 15px 0 7px; padding-bottom: 3px; }
      h3, h4, p { margin: 0; }
      .contact { color: #475569; font-size: 9.2pt; line-height: 1.35; }
      a { color: inherit; text-decoration: none; }
      .summary { font-size: 10.5pt; line-height: 1.4; }
      .company { align-items: baseline; display: flex; justify-content: space-between; margin-bottom: 3px; }
      .company h3 { color: #0f172a; font-size: 12pt; }
      .location, time { color: #475569; font-size: 9.6pt; font-weight: normal; white-space: nowrap; }
      article + article { margin-top: 8px; }
      article > header { border: 0; display: flex; justify-content: space-between; padding: 0; text-align: left; }
      h4 { color: #0f172a; font-size: 10.6pt; line-height: 1.25; }
      ul { margin: 4px 0 0; padding-left: 18px; }
      li { margin: 2px 0; padding-left: 1px; }
      .projects { display: grid; gap: 7px; }
      .project { border-left: 2px solid #64748b; padding-left: 9px; }
      .project h3 { color: #0f172a; font-size: 10.6pt; line-height: 1.3; margin-bottom: 1px; }
      .project a { text-decoration: underline; text-decoration-thickness: 0.8px; text-underline-offset: 2px; }
      .project-link { color: #475569; font-size: 9.2pt; margin-left: 6px; }
      .skills { line-height: 1.45; }
      .skills + .skills { margin-top: 2px; }
      .education { display: flex; gap: 6px; justify-content: space-between; }
      .education p:last-child { color: #475569; white-space: nowrap; }
    </style>
  </head>
  <body>
    <main aria-label="Resume for Miguel Casillas">
      <header>
        <h1>Miguel Casillas</h1>
        <p class="contact">Redmond, WA | <a href="mailto:micasillm@gmail.com">micasillm@gmail.com</a> | <a href="https://elopenmike.com/">elopenmike.com</a> | <a href="https://www.linkedin.com/in/mcasillas17/">linkedin.com/in/mcasillas17</a> | <a href="https://github.com/mcasillas17">github.com/mcasillas17</a></p>
      </header>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading">SUMMARY</h2>
        <p class="summary">Backend and platform engineer focused on AI-powered systems, large-scale messaging, data-grounded analytics, and observability. Builds services and APIs that remain scalable, secure, and understandable as they grow.</p>
      </section>

      <section aria-labelledby="experience-heading">
        <h2 id="experience-heading">EXPERIENCE</h2>
        <div class="company"><h3>Microsoft</h3><p class="location">Redmond, WA</p></div>
        <article>
          <header><h4>Software Engineer II</h4><time datetime="2024-03">Mar 2024 - Present</time></header>
          <ul>
            <li>Build backend services and APIs for large-scale email and push messaging, including agent tooling for content suggestions and campaign insights.</li>
            <li>Delivered content-insight and campaign-diagnostics pipelines with end-to-end telemetry, dashboards, and documentation for partner teams.</li>
            <li>Modernized release pipelines with shared YAML templates, artifact signing, secret scanning, gated approvals, and compliance checks.</li>
          </ul>
        </article>
        <article>
          <header><h4>Software Engineer</h4><time datetime="2018-11">Nov 2018 - Feb 2024</time></header>
          <ul>
            <li>Migrated a campaign metadata portal, integrated email delivery for commercial scenarios, and automated its data updates.</li>
            <li>Contributed to the general-availability release of an enterprise scheduling service; exposed reusable APIs and improved meeting-time suggestions and flexible-hours support.</li>
            <li>Modernized cross-platform telemetry SDK build systems, built an Objective-C wrapper for a C++ SDK, and improved diagnostic filtering and C# wrapper support.</li>
          </ul>
        </article>
      </section>

      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading">SELECTED PROJECTS</h2>
        <div class="projects">
          <article class="project">
            <h3>TuringAgent <a class="project-link" href="https://github.com/mcasillas17/TuringAgent">github.com/mcasillas17/TuringAgent</a></h3>
            <p>A local-first AI orchestration platform with a Flutter client, Go gRPC backend, model routing, streaming, MCP tools, and approval-gated actions.</p>
          </article>
          <article class="project">
            <h3>Thwiply <a class="project-link" href="https://github.com/mcasillas17/Thwiply">github.com/mcasillas17/Thwiply</a></h3>
            <p>An Android scaffold for device-held model downloads and streamed, on-device LLM inference; its capture-and-task workflow remains planned.</p>
          </article>
        </div>
      </section>

      <section aria-labelledby="skills-heading">
        <h2 id="skills-heading">SKILLS</h2>
        <p class="skills"><strong>Languages:</strong> C#, TypeScript, Go, C++, JavaScript, SQL &nbsp;&nbsp; <strong>Backend and APIs:</strong> .NET, Node.js, gRPC, REST APIs, distributed systems, microservices</p>
        <p class="skills"><strong>AI and infrastructure:</strong> LLM and agent tooling, MCP, Azure, Docker, CI/CD, telemetry, observability</p>
      </section>

      <section aria-labelledby="education-heading">
        <h2 id="education-heading">EDUCATION</h2>
        <div class="education"><p><strong>Instituto Tecnológico Autónomo de México (ITAM)</strong> - Computer Engineering</p><p>May 2017</p></div>
      </section>
    </main>
  </body>
</html>`;

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.pdf({
    path: outputPath,
    format: "Letter",
    printBackground: true,
    tagged: true,
    outline: true,
    preferCSSPageSize: true,
  });
} finally {
  await browser.close();
}
