// Slugs must stay URL-stable so generated post links don't drift when titles change formatting.
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

// A slug is not only a URL: it is the name of two things on disk, and every
// filesystem this repo is written, checked out or built on caps a single path
// *component* at 255 bytes (ext4, APFS, XFS, and the 255-character NTFS limit
// besides). The cap is on the component, not the path, and it is counted in
// bytes rather than characters — so it is a limit a character count cannot
// check even though today's slugs are ASCII.
//
// Nothing measured it, so a Notion title long enough to slugify past the cap
// produced a plan the run could not carry out: writeFile threw ENAMETOOLONG
// partway through, after earlier posts had been written and images applied,
// and left the tree half-updated for the commit step to publish.
export const MAX_FILENAME_BYTES = 255;

export const POST_FILE_EXTENSION = ".mdx";

export function filenameByteLength(name: string): number {
  return new TextEncoder().encode(name).length;
}

// Both names a slug becomes on disk, measured before anything is planned:
// content/blog/<slug>.mdx (see postPath) and the per-post image directory
// public/images/blog/<slug> (see imageDir). The file is the longer of the two
// by the four bytes of its extension, so a slug can be short enough for the
// directory and too long for the file; both are reported so the message says
// which name is the problem.
export function slugFilenameProblems(slug: string): string[] {
  const components: Array<[string, string]> = [
    [`${slug}${POST_FILE_EXTENSION}`, `content/blog/<slug>${POST_FILE_EXTENSION}`],
    [slug, "public/images/blog/<slug>"],
  ];

  return components
    .filter(([name]) => filenameByteLength(name) > MAX_FILENAME_BYTES)
    .map(
      ([name, shape]) =>
        `${shape} would be a ${filenameByteLength(name)}-byte name, more than ` +
        `the ${MAX_FILENAME_BYTES} bytes one path component can hold — shorten ` +
        "the slug (or the title it is derived from)",
    );
}
