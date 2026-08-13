import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const resumePath = fileURLToPath(new URL("../public/resume.pdf", import.meta.url));

const pdfInfo = execFileSync("pdfinfo", [resumePath], { encoding: "utf8" });
assert.match(pdfInfo, /^Pages:\s+1$/m, "resume must be one page");
assert.match(pdfInfo, /^Tagged:\s+yes$/m, "resume must be a tagged PDF");

const document = await getDocument({ data: new Uint8Array(readFileSync(resumePath)) }).promise;
assert.equal(document.numPages, 1, "PDF.js must read one page");

const page = await document.getPage(1);
const structure = await page.getStructTree();
assert.ok(structure, "PDF must contain a semantic structure tree");
const structureText = JSON.stringify(structure);
assert.match(structureText, /"role":"H1"/, "structure tree must retain the name heading");
assert.match(structureText, /"role":"H2"/, "structure tree must retain section headings");
const textContent = await page.getTextContent();
const extractedText = textContent.items.map((item) => item.str).join(" ");
for (const text of [
  "Miguel Casillas",
  "SUMMARY",
  "EXPERIENCE",
  "Software Engineer II",
  "SELECTED PROJECTS",
  "TuringAgent",
  "Thwiply",
  "EDUCATION",
]) {
  assert.ok(extractedText.includes(text), `extractable text must include ${text}`);
}
assert.ok(
  extractedText.indexOf("EXPERIENCE") < extractedText.indexOf("EDUCATION"),
  "experience must extract before education",
);
assert.doesNotMatch(
  extractedText,
  /\+\d[\d\s()-]{7,}/,
  "public resume must not expose a phone number",
);

const links = new Set(
  (await page.getAnnotations())
    .map((annotation) => annotation.url)
    .filter(Boolean),
);
for (const url of [
  "mailto:micasillm@gmail.com",
  "https://elopenmike.com/",
  "https://www.linkedin.com/in/mcasillas17/",
  "https://github.com/mcasillas17",
  "https://github.com/mcasillas17/TuringAgent",
  "https://github.com/mcasillas17/Thwiply",
]) {
  assert.ok(links.has(url), `PDF must include link ${url}`);
}

console.log("Resume verified: one page, tagged, extractable in reading order, and linked.");
