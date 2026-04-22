import { isValidSlug, sanitizeSlug } from "./slug";

export interface PostFrontmatter {
  title: string;
  slug: string;
  date: string;
  description: string;
  hostId?: string;
}

export interface FrontmatterValidationError {
  field: string;
  message: string;
}

export type FrontmatterValidationResult =
  | { ok: true; value: PostFrontmatter }
  | { ok: false; errors: FrontmatterValidationError[] };

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  return null;
}

/**
 * Validates raw frontmatter (usually from Obsidian's metadataCache) against the
 * schema required to publish a note to a static site host.
 */
export function validatePostFrontmatter(
  raw: unknown,
): FrontmatterValidationResult {
  const errors: FrontmatterValidationError[] = [];
  const source =
    (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) ??
    {};

  const title = asString(source.title);
  if (!title) {
    errors.push({ field: "title", message: "title is required" });
  }

  const description = asString(source.description);
  if (!description) {
    errors.push({ field: "description", message: "description is required" });
  }

  const date = asString(source.date);
  if (!date) {
    errors.push({
      field: "date",
      message: "date is required (e.g. 2026-03-18T18:25Z)",
    });
  }

  let slugRaw = asString(source.slug);
  if (!slugRaw && title) {
    slugRaw = sanitizeSlug(title);
  }

  if (!slugRaw) {
    errors.push({ field: "slug", message: "slug is required" });
  }

  const sanitized = slugRaw ? sanitizeSlug(slugRaw) : "";
  if (slugRaw && !isValidSlug(sanitized)) {
    errors.push({
      field: "slug",
      message: `slug '${slugRaw}' is invalid. Use lowercase letters, numbers, and hyphens; avoid reserved names (blog, feed, static, assets, public).`,
    });
  }

  const hostCandidate =
    asString(source.host) ??
    asString((source as { hostId?: unknown }).hostId) ??
    undefined;

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title: title as string,
      slug: sanitized,
      date: date as string,
      description: description as string,
      hostId: hostCandidate ?? undefined,
    },
  };
}
