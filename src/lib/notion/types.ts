export type Annotations = { bold: boolean; italic: boolean; strikethrough: boolean; underline: boolean; code: boolean; };

// Flatten the Notion SDK's block unions into a structural shape shared by every block variant.
export type RichText = { plain_text: string; href: string | null; annotations: Annotations; };
export type NotionBlock = { id: string; type: string; has_children?: boolean; [key: string]: unknown; };
// Children are resolved after the initial pass so every block can form a stable in-memory tree.
export type MdBlock = NotionBlock & { children: MdBlock[] };
// YYYY-MM-DD keeps dates sortable and safe to serialize in frontmatter.
export type PostFrontmatter = { title: string; date: string; excerpt: string; tags: string[]; updated: string; };
// Published source metadata is the canonical package emitted for MDX generation.
export type PostSource = { pageId: string; slug: string; frontmatter: PostFrontmatter; blocks: MdBlock[]; };
