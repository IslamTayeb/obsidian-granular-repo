import { Marked, type Tokens } from "marked";

export interface MarkdownRenderResult {
  html: string;
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

/**
 * Renders markdown into HTML shaped to match the apmoverflow hand-written style:
 *   - bare tags (<p>, <em>, <strong>, <a>, <code>, <pre><code>)
 *   - no classes or ids injected on non-heading blocks
 *   - inline HTML in the source passes through unchanged (escape hatch)
 *   - Obsidian-style `[[wikilinks]]` and `![[embeds]]` are NOT supported; they
 *     produce a warning and are stripped from the output.
 */
export function renderMarkdown(source: string): MarkdownRenderResult {
  const warnings: string[] = [];
  const wikiLinkPattern = /!?\[\[[^\]]+\]\]/g;

  const preprocessed = source.replace(wikiLinkPattern, (match) => {
    warnings.push(
      `Obsidian wiki-link ${match} is not supported by the static-site publisher and was removed.`,
    );
    return "";
  });

  const marked = new Marked({
    gfm: true,
    breaks: false,
    pedantic: false,
  });

  marked.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading): string {
        const text = (
          this as unknown as {
            parser: {
              parseInline: (tokens: Tokens.Heading["tokens"]) => string;
            };
          }
        ).parser.parseInline(tokens);
        return `<h${depth}>${text}</h${depth}>\n`;
      },
      paragraph({ tokens }: Tokens.Paragraph): string {
        const text = (
          this as unknown as {
            parser: {
              parseInline: (tokens: Tokens.Paragraph["tokens"]) => string;
            };
          }
        ).parser.parseInline(tokens);
        return `<p>${text}</p>\n`;
      },
      link({ href, title, tokens }: Tokens.Link): string {
        const inner = (
          this as unknown as {
            parser: { parseInline: (tokens: Tokens.Link["tokens"]) => string };
          }
        ).parser.parseInline(tokens);
        const safeHref =
          isAbsoluteUrl(href) ||
          href.startsWith("/") ||
          href.startsWith("#") ||
          href.startsWith("mailto:")
            ? href
            : href;
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<a href="${escapeHtml(safeHref)}"${titleAttr}>${inner}</a>`;
      },
      image({ href, title, text }: Tokens.Image): string {
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${titleAttr} />`;
      },
      codespan({ text }: Tokens.Codespan): string {
        return `<code>${escapeHtml(text)}</code>`;
      },
      code({ text, lang }: Tokens.Code): string {
        const body = escapeHtml(text);
        if (lang) {
          return `<pre><code class="language-${escapeHtml(lang)}">${body}\n</code></pre>\n`;
        }
        return `<pre><code>${body}\n</code></pre>\n`;
      },
      blockquote({ tokens }: Tokens.Blockquote): string {
        const body = (
          this as unknown as {
            parser: { parse: (tokens: Tokens.Blockquote["tokens"]) => string };
          }
        ).parser.parse(tokens);
        return `<blockquote>\n${body}</blockquote>\n`;
      },
      hr(): string {
        return "<hr />\n";
      },
    },
  });

  const rendered = marked.parse(preprocessed);
  if (typeof rendered !== "string") {
    throw new Error(
      "Markdown renderer returned a promise. The plugin expects synchronous rendering.",
    );
  }

  return {
    html: rendered.trim(),
    warnings,
  };
}

export function escapeHtmlForAttribute(text: string): string {
  return escapeHtml(text);
}
