import { formatIsoMinutesZ } from "./date-format";
import { sanitizeSlug } from "./slug";

export interface PostDefaultsInput {
  fileBasename: string; // filename without extension, e.g. "multi-agent-communication-research"
  body: string; // markdown body (no frontmatter)
  now?: Date;
}

export interface PostDefaults {
  title: string;
  slug: string;
  date: string; // YYYY-MM-DDTHH:MMZ
  description: string;
}

const MAX_DESCRIPTION_LENGTH = 180;

function titleCaseFromBasename(basename: string): string {
  const spaced = basename.replace(/[-_]+/g, " ").trim();
  if (!spaced) {
    return "Untitled";
  }

  return spaced
    .split(/\s+/)
    .map((word) =>
      word.length === 0 ? word : word[0].toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function firstHeadingText(body: string): string | null {
  const match = body.match(/^#{1,6}\s+(.+?)\s*$/m);
  if (!match) {
    return null;
  }
  return match[1].trim();
}

function firstParagraphText(body: string): string {
  const lines = body.split(/\r?\n/);
  const paragraphLines: string[] = [];
  let started = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (started) {
        break;
      }
      continue;
    }
    if (
      trimmed.startsWith("#") ||
      trimmed.startsWith("---") ||
      trimmed.startsWith("```")
    ) {
      if (started) {
        break;
      }
      continue;
    }
    paragraphLines.push(trimmed);
    started = true;
  }

  return paragraphLines.join(" ");
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1") // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/__([^_]+)__/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/_([^_]+)_/g, "$1") // italic
    .replace(/~~([^~]+)~~/g, "$1") // strikethrough
    .replace(/\s+/g, " ")
    .trim();
}

function truncateDescription(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const ellipsis = "...";
  const budget = Math.max(1, maxLength - ellipsis.length);
  const cut = text.slice(0, budget);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[.,;:!?]+$/, "")}${ellipsis}`;
}

export function computePostDefaults(input: PostDefaultsInput): PostDefaults {
  const heading = firstHeadingText(input.body);
  const title =
    heading && heading.length > 0
      ? heading
      : titleCaseFromBasename(input.fileBasename);

  const slug =
    sanitizeSlug(title) || sanitizeSlug(input.fileBasename) || "untitled";

  const now = input.now ?? new Date();
  const date = formatIsoMinutesZ(now);

  const paragraph = firstParagraphText(input.body);
  const descriptionRaw = stripInlineMarkdown(paragraph);
  const description =
    descriptionRaw.length > 0
      ? truncateDescription(descriptionRaw, MAX_DESCRIPTION_LENGTH)
      : "";

  return { title, slug, date, description };
}

/**
 * Merge an existing frontmatter record with computed defaults, preserving any
 * field the user already populated (even empty strings are kept as-is so
 * they can intentionally clear a field).
 */
export function mergeDefaults(
  existing: Record<string, unknown> | undefined,
  defaults: PostDefaults,
): {
  title: string;
  slug: string;
  date: string;
  description: string;
  hostId?: string;
} {
  const source = existing ?? {};
  const pick = (key: string, fallback: string): string => {
    const raw = source[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      return String(raw);
    }
    return fallback;
  };

  const hostCandidate = source.host ?? (source as { hostId?: unknown }).hostId;
  const hostId =
    typeof hostCandidate === "string" && hostCandidate.trim().length > 0
      ? hostCandidate
      : undefined;

  return {
    title: pick("title", defaults.title),
    slug: pick("slug", defaults.slug),
    date: pick("date", defaults.date),
    description: pick("description", defaults.description),
    hostId,
  };
}
