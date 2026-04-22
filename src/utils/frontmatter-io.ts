export interface FrontmatterFields {
  title: string;
  slug: string;
  date: string;
  description: string;
  host?: string;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split a markdown document into its frontmatter block (raw YAML string, no
 * fences) and the body (everything after the closing `---`).
 */
export function splitFrontmatter(fileContent: string): {
  frontmatterRaw: string | null;
  body: string;
} {
  if (!fileContent.startsWith("---")) {
    return { frontmatterRaw: null, body: fileContent };
  }

  const match = fileContent.match(FRONTMATTER_REGEX);
  if (!match) {
    return { frontmatterRaw: null, body: fileContent };
  }

  return {
    frontmatterRaw: match[1],
    body: fileContent.slice(match[0].length),
  };
}

function needsQuoting(value: string): boolean {
  if (value.length === 0) {
    return true;
  }
  if (/["']/.test(value)) {
    return true;
  }
  if (/[:#&*!|<>?%@`]/.test(value)) {
    return true;
  }
  if (/^[\s'"]/.test(value) || /[\s]$/.test(value)) {
    return true;
  }
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(value)) {
    return true;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return true;
  }
  return false;
}

function quoteYamlString(value: string): string {
  // Prefer double-quoted form with standard escapes to handle quotes safely.
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

function formatYamlValue(value: string): string {
  return needsQuoting(value) ? quoteYamlString(value) : value;
}

/**
 * Render a minimal YAML block for the publish fields we care about. Key order
 * is stable (title, slug, date, description, host) so diffs stay clean.
 */
export function renderFrontmatterBlock(fields: FrontmatterFields): string {
  const lines = [
    `title: ${formatYamlValue(fields.title)}`,
    `slug: ${formatYamlValue(fields.slug)}`,
    `date: ${formatYamlValue(fields.date)}`,
    `description: ${formatYamlValue(fields.description)}`,
  ];

  if (fields.host && fields.host.trim().length > 0) {
    lines.push(`host: ${formatYamlValue(fields.host)}`);
  }

  return lines.join("\n");
}

/**
 * Update (or insert) the five publish-related keys in a note's frontmatter.
 * Keys unrelated to publishing are preserved as-is in the original order.
 * If no frontmatter exists, a new block is prepended.
 */
export function upsertFrontmatterFields(
  fileContent: string,
  fields: FrontmatterFields,
): string {
  const managedKeys = new Set(["title", "slug", "date", "description", "host"]);
  const { frontmatterRaw, body } = splitFrontmatter(fileContent);

  const managedLines = renderFrontmatterBlock(fields).split("\n");

  if (frontmatterRaw === null) {
    const normalizedBody = body.startsWith("\n") ? body : `\n${body}`;
    return `---\n${managedLines.join("\n")}\n---${normalizedBody}`;
  }

  const preservedLines: string[] = [];
  const originalLines = frontmatterRaw.split(/\r?\n/);
  let skipContinuation = false;

  for (const line of originalLines) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (managedKeys.has(key)) {
        skipContinuation = true;
        continue;
      }
      skipContinuation = false;
      preservedLines.push(line);
      continue;
    }

    if (skipContinuation) {
      // Drop multi-line continuations belonging to a managed key.
      if (/^\s+\S/.test(line)) {
        continue;
      }
      skipContinuation = false;
    }
    preservedLines.push(line);
  }

  while (
    preservedLines.length > 0 &&
    preservedLines[preservedLines.length - 1].trim() === ""
  ) {
    preservedLines.pop();
  }

  const combined = [...managedLines, ...preservedLines].join("\n");
  const trailingNewline = body.length > 0 ? "" : "";
  const normalizedBody =
    body.startsWith("\n") || body.length === 0 ? body : `\n${body}`;
  return `---\n${combined}\n---${normalizedBody || "\n"}${trailingNewline}`;
}
