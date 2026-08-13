import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const resumePath = fileURLToPath(new URL("../public/resume.pdf", import.meta.url));

const pdfBytes = readFileSync(resumePath);
assert.match(
  pdfBytes.toString("latin1"),
  /\/StructTreeRoot\b/,
  "raw PDF must contain a structure tree marker",
);

const document = await getDocument({ data: new Uint8Array(pdfBytes) }).promise;
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
assert.match(
  extractedText,
  /An Android scaffold for device-held model downloads and streamed, on-device LLM inference; its capture-and-task workflow remains planned\./,
  "Thwiply description must reflect the current shipped scope",
);
assert.doesNotMatch(
  extractedText,
  /turn notifications and screenshots into actionable tasks/,
  "Thwiply description must not claim the planned capture-and-task workflow is shipped",
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

console.log("Resume verified: one page, tagged structure, extractable reading order, and links.");
