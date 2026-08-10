import type { MdBlock, RichText } from "../../types";

// Notion omits annotation fields when they're false, so the fixture starts from the full default shape.
export function rt(text: string, opts: Partial<RichText["annotations"]> & { href?: string | null } = {}): RichText {
  const { href, ...annotations } = opts;
  return {
    plain_text: text,
    href: href ?? null,
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      ...annotations,
    },
  };
}

// Children are already resolved into the tree, matching the shape produced after block expansion.
export function block<T extends Record<string, unknown>>(type: string, payload: T, children: MdBlock[] = []): MdBlock & Record<string, unknown> {
  return {
    id: `${type}-${JSON.stringify(payload).length}-${children.length}`,
    type,
    has_children: children.length > 0,
    [type]: payload,
    children,
  };
}
