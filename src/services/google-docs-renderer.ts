import { Marked, type Tokens } from "marked";

export type GoogleDocsMediaSource = "markdown-image" | "obsidian-embed";

export interface GoogleDocsMediaRef {
  marker: string;
  target: string;
  original: string;
  altText: string;
  source: GoogleDocsMediaSource;
}

export interface GoogleDocsRenderResult {
  html: string;
  mediaRefs: GoogleDocsMediaRef[];
  warnings: string[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function isAbsoluteUrl(href: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}

function mediaMarker(index: number): string {
  return `GVP_MEDIA_${index}_PLACEHOLDER`;
}

function codeBlockStartMarker(index: number): string {
  return `GVP_CODE_BLOCK_${index}_START`;
}

function codeBlockEndMarker(index: number): string {
  return `GVP_CODE_BLOCK_${index}_END`;
}

function unresolvedPlaceholder(label: string): string {
  return `<span style="color:#777;font-style:italic;">${escapeHtml(label)}</span>`;
}

const GOOGLE_DOCS_IMPORT_STYLE = [
  "body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.15;color:#202124;}",
  "p{margin:0 0 6pt 0;}",
  "h1,h2,h3,h4,h5,h6{line-height:1.2;margin:12pt 0 6pt 0;}",
  "h1{font-size:20pt;}",
  "h2{font-size:16pt;}",
  "h3{font-size:14pt;}",
  "ul,ol{margin-top:0;margin-bottom:6pt;}",
  "li{margin:0 0 3pt 0;}",
  "blockquote{color:#5f6368;margin:0 0 6pt 18pt;}",
  "pre{margin:0 0 6pt 0;white-space:pre-wrap;background-color:#f1f3f4;padding:6pt;}",
  'code{font-family:"Courier New",monospace;font-size:10pt;}',
  "u{text-decoration:underline;}",
  "table{border-collapse:collapse;margin:0 0 6pt 0;}",
  "th,td{border:1px solid #dadce0;padding:4pt 6pt;}",
  "img{max-width:100%;}",
].join("");

function buildDocumentHtml(title: string, bodyHtml: string): string {
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${GOOGLE_DOCS_IMPORT_STYLE}</style>`,
    "</head><body>",
    bodyHtml,
    "</body></html>",
  ].join("");
}

export function renderGoogleDocsMarkdown(
  source: string,
  options: { title: string },
): GoogleDocsRenderResult {
  const mediaRefs: GoogleDocsMediaRef[] = [];
  const warnings: string[] = [];
  let codeBlockCount = 0;

  const preprocessed = source
    .replace(/!\[\[([^\]]+)\]\]/g, (original, rawTarget: string) => {
      const marker = mediaMarker(mediaRefs.length);
      mediaRefs.push({
        marker,
        target: rawTarget.trim(),
        original,
        altText: rawTarget.trim(),
        source: "obsidian-embed",
      });
      return marker;
    })
    .replace(/\[\[([^\]]+)\]\]/g, (original) => {
      warnings.push(
        `Obsidian link ${original} was kept as a grey italic placeholder.`,
      );
      return unresolvedPlaceholder(original);
    });

  const marked = new Marked({
    gfm: true,
    breaks: false,
    pedantic: false,
  });

  marked.use({
    renderer: {
      image({ href, title, text }: Tokens.Image): string {
        if (!isAbsoluteUrl(href)) {
          const marker = mediaMarker(mediaRefs.length);
          mediaRefs.push({
            marker,
            target: href,
            original: `![${text}](${href})`,
            altText: text || title || href,
            source: "markdown-image",
          });
          return marker;
        }

        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${titleAttr}>`;
      },
      codespan({ text }: Tokens.Codespan): string {
        return `<code>${escapeHtml(text)}</code>`;
      },
      code({ text, lang }: Tokens.Code): string {
        const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
        const codeBlockIndex = codeBlockCount++;
        return `<pre><code${langAttr}>${codeBlockStartMarker(codeBlockIndex)}\n${escapeHtml(text)}\n${codeBlockEndMarker(codeBlockIndex)}</code></pre>\n`;
      },
    },
  });

  const rendered = marked.parse(preprocessed);
  if (typeof rendered !== "string") {
    throw new Error(
      "Google Docs renderer returned a promise. The plugin expects synchronous rendering.",
    );
  }

  return {
    html: buildDocumentHtml(options.title, rendered.trim()),
    mediaRefs,
    warnings,
  };
}

export function renderUnresolvedMediaPlaceholder(
  original: string,
  link?: string,
): string {
  const label = link ? `${original} (${link})` : original;
  return label;
}
