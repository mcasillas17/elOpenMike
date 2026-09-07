import { inlineToRichText, type RichTextInput } from "./md-to-rich-text";
import { isSafeLinkScheme } from "./link-destination";

// Read exactly one Markdown resource, delegating its escapes, destination
// syntax and inline annotations to the existing bounded inline reader.
export function articleResource(
  source: string,
  line: number,
  refuse: () => never,
): { label: RichTextInput; url: string } {
  if (!source.startsWith("[")) return refuse();
  let depth = 1;
  let index = 1;
  while (index < source.length && depth > 0) {
    if (source[index] === "\\") { index += 2; continue; }
    if (source[index] === "`") {
      const start = index;
      while (source[index] === "`") index += 1;
      const delimiter = source.slice(start, index);
      let close = source.indexOf(delimiter, index);
      while (close >= 0 &&
          (source[close - 1] === "`" || source[close + delimiter.length] === "`")) {
        close = source.indexOf(delimiter, close + delimiter.length);
      }
      if (close === -1) return refuse();
      index = close + delimiter.length;
      continue;
    }
    if (source[index] === "[") depth += 1;
    if (source[index] === "]") depth -= 1;
    index += 1;
  }
  if (depth !== 0 || source[index] !== "(") return refuse();
  const label = inlineToRichText(source.slice(1, index - 1), { line });
  const destination = inlineToRichText(`[resource]${source.slice(index)}`, { line });
  const run = destination[0];
  if (destination.length !== 1 || !run || !("text" in run) ||
      run.text.content !== "resource" || !run.text.link ||
      !isSafeLinkScheme(run.text.link.url)) return refuse();
  return { label, url: run.text.link.url };
}

export function localRasterPath(value: string): boolean {
  return /^\/(?!\/)[A-Za-z0-9/_().-]+\.(?:png|jpe?g|gif|webp|avif)$/i.test(value) &&
    value.split("/").every((segment) => segment !== "." && segment !== "..");
}

export function httpsRasterUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password &&
    localRasterPath(url.pathname);
}
