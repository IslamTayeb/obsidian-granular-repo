import { describe, expect, it } from "vitest";

import { renderGoogleDocsMarkdown } from "../src/services/google-docs-renderer";

describe("renderGoogleDocsMarkdown", () => {
  it("renders semantic HTML for Google Docs import", () => {
    const result = renderGoogleDocsMarkdown(
      [
        "# Heading",
        "",
        "A [link](https://example.com), **bold**, and `code`.",
        "",
        "- one",
        "- two",
        "",
        "| A | B |",
        "| - | - |",
        "| 1 | 2 |",
        "",
        "```ts",
        "const value = 1;",
        "```",
      ].join("\n"),
      { title: "Doc" },
    );

    expect(result.html).toContain("<h1>Heading</h1>");
    expect(result.html).toContain('<a href="https://example.com">link</a>');
    expect(result.html).toContain("<strong>bold</strong>");
    expect(result.html).toContain('<pre><code class="language-ts">');
    expect(result.html).toContain("<ul>");
    expect(result.html).toContain("<table>");
    expect(result.html).toContain(
      "body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.15;",
    );
    expect(result.html).toContain("p{margin:0 0 6pt 0;}");
    expect(result.html).toContain(
      "pre{margin:0 0 6pt 0;white-space:pre-wrap;background-color:#f1f3f4;padding:6pt;}",
    );
    expect(result.html).toContain(
      "GVP_CODE_BLOCK_0_START\nconst value = 1;\nGVP_CODE_BLOCK_0_END",
    );
    expect(result.html).toContain(
      "h1,h2,h3,h4,h5,h6{line-height:1.2;margin:12pt 0 6pt 0;}",
    );
  });

  it("extracts markdown images into deterministic media placeholders", () => {
    const result = renderGoogleDocsMarkdown("![Alt text](images/pic.png)", {
      title: "Doc",
    });

    expect(result.mediaRefs).toHaveLength(1);
    expect(result.mediaRefs[0]).toMatchObject({
      marker: "GVP_MEDIA_0_PLACEHOLDER",
      target: "images/pic.png",
      original: "![Alt text](images/pic.png)",
      altText: "Alt text",
      source: "markdown-image",
    });
    expect(result.html).toContain("GVP_MEDIA_0_PLACEHOLDER");
  });

  it("extracts Obsidian embeds and keeps wikilinks visible", () => {
    const result = renderGoogleDocsMarkdown(
      "See [[Draft Note]].\n\n![[clip.mp4]]",
      { title: "Doc" },
    );

    expect(result.mediaRefs).toHaveLength(1);
    expect(result.mediaRefs[0]).toMatchObject({
      marker: "GVP_MEDIA_0_PLACEHOLDER",
      target: "clip.mp4",
      original: "![[clip.mp4]]",
      source: "obsidian-embed",
    });
    expect(result.html).toContain("GVP_MEDIA_0_PLACEHOLDER");
    expect(result.html).toContain("font-style:italic");
    expect(result.html).toContain("[[Draft Note]]");
    expect(result.warnings[0]).toContain("[[Draft Note]]");
  });
});
