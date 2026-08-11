// Where a Notion page stands, as the API answers it.
//
// A page object carries three fields about this, and they are not two names for
// one fact:
//
//   * `in_trash` — the page is in the workspace's trash.
//   * `archived` — the same fact under the name every API version before
//     2026-03-11 used. The SDK still types it, marked deprecated, so a response
//     from an older version is still readable.
//   * `is_archived` — a *different* fact: the page is archived. It is not in
//     the trash, it has not been deleted, and it is not on the site either.
//
// This repo used to read the first two. The third state was therefore invisible
// to every check that mattered: an archived page was one the sync would publish
// (the author had taken it down), one the migration would resume, append to,
// promote and demote, and one that counted as claiming its slug — which is the
// single thing that stops the *other* page under that slug being published at
// all.
//
// All three are read here, in one place, so no caller can be the one that
// forgot. Any of them means the page is off the site, and off the site means
// the page is left exactly where its author put it: nothing is written to it,
// nothing is read out of it onto the site, and it holds no slug.
export type ArchivalFlags = {
  in_trash?: boolean;
  // The deprecated spelling of `in_trash`. See above.
  archived?: boolean;
  is_archived?: boolean;
};

// Which of the two it is. They are reported apart because they are undone
// apart: a trashed page is restored from the trash, an archived one is
// unarchived, and a message that says the wrong one sends its reader to the
// wrong place.
export type OffSite = "trash" | "archive";

export function offSiteState(page: ArchivalFlags): OffSite | undefined {
  if (page.in_trash === true || page.archived === true) return "trash";
  if (page.is_archived === true) return "archive";
  return undefined;
}

export function isOffSite(page: ArchivalFlags): boolean {
  return offSiteState(page) !== undefined;
}

// Said the way a message about the page reads: "the page is …".
export function describeOffSite(state: OffSite): string {
  return state === "trash" ? "in the Notion trash" : "archived in Notion";
}
