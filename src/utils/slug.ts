const RESERVED_SLUGS = new Set(["blog", "feed", "static", "assets", "public"]);

export function sanitizeSlug(input: string): string {
  const lowered = input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const dashed = lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return dashed;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function isValidSlug(slug: string): boolean {
  if (slug.length === 0 || slug.length > 120) {
    return false;
  }

  if (isReservedSlug(slug)) {
    return false;
  }

  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}
