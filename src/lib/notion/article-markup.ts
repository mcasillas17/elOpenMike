import type { BlockObjectRequest } from "@notionhq/client";

type Callout = Extract<BlockObjectRequest, { callout: unknown }>["callout"];
type CalloutColor = NonNullable<Callout["color"]>;

const COLORS = new Set<CalloutColor>([
  "default", "gray", "brown", "orange", "yellow", "green", "blue", "purple",
  "pink", "red", "gray_background", "brown_background", "orange_background",
  "yellow_background", "green_background", "blue_background", "purple_background",
  "pink_background", "red_background",
]);

export function calloutColor(value: unknown): CalloutColor | undefined {
  return typeof value === "string" && COLORS.has(value as CalloutColor)
    ? value as CalloutColor
    : undefined;
}

export function calloutTone(color: unknown): "note" | "warning" {
  return typeof color === "string" && /^(red|orange|yellow)(_background)?$/.test(color)
    ? "warning"
    : "note";
}

export const ARTICLE_CONTAINERS = [
  "ArticleCallout", "ArticleToggle", "ArticleFigure", "ArticleCode", "ArticleReference",
] as const;
export type ArticleContainer = typeof ARTICLE_CONTAINERS[number];

const ATTRIBUTE_ENTITIES: Record<string, string> = {
  "&": "&amp;", '"': "&quot;", "'": "&#39;", "<": "&lt;", ">": "&gt;",
  "{": "&#123;", "}": "&#125;", "\n": "&#10;", "\r": "&#13;", "\t": "&#9;",
};
const DECODED_ENTITIES = new Map(
  Object.entries(ATTRIBUTE_ENTITIES).map(([character, entity]) => [entity, character]),
);

export function staticAttribute(value: string): string {
  return value.replace(/[&"'<>{}\n\r\t]/g, (character) => ATTRIBUTE_ENTITIES[character]);
}

export function articleContainer(
  name: ArticleContainer,
  children: string[],
  attributes: Record<string, string> = {},
): string {
  const attrs = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${staticAttribute(value)}"`).join("");
  return [`<${name}${attrs}>`, ...children.filter(Boolean), `</${name}>`].join("\n\n");
}

export function isArticleBoundary(content: string): boolean {
  return /^<\/?Article[A-Za-z]*(?:[ >]|$)/.test(content);
}

// Only the writer's static, quoted vocabulary is accepted. In particular, an
// expression or spread never reaches an MDX evaluator during migration.
export function parseArticleOpening(
  source: string,
  refuse: () => never,
): { name: ArticleContainer; attributes: Record<string, string> } {
  const tag = /^<([A-Za-z]+)((?: [A-Za-z]+="[^"\r\n]*")*)>$/.exec(source);
  if (!tag || !ARTICLE_CONTAINERS.includes(tag[1] as ArticleContainer)) return refuse();
  const name = tag[1] as ArticleContainer;
  const attributes: Record<string, string> = {};
  for (const match of tag[2].matchAll(/ ([A-Za-z]+)="([^"]*)"/g)) {
    const [, key, encoded] = match;
    if (name !== "ArticleCallout" || !["tone", "icon", "color"].includes(key) ||
        Object.hasOwn(attributes, key) || /[<>{}]/.test(encoded)) return refuse();
    const value = encoded.replace(/&(?:amp|quot|lt|gt|#39|#123|#125|#10|#13|#9);|[&<>{}]/g, (entity) => {
      const decoded = DECODED_ENTITIES.get(entity);
      return decoded === undefined ? refuse() : decoded;
    });
    attributes[key] = value;
  }
  if (name === "ArticleCallout") {
    if (!["note", "warning"].includes(attributes.tone)) return refuse();
    if (attributes.color !== undefined &&
        (calloutColor(attributes.color) === undefined ||
         calloutTone(attributes.color) !== attributes.tone)) return refuse();
  }
  return { name, attributes };
}
