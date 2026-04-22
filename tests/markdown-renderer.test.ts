import { describe, expect, it } from "vitest";

import { renderMarkdown } from "../src/services/markdown-renderer";

describe("renderMarkdown", () => {
  it("emits bare <p> tags for paragraphs", () => {
    const { html } = renderMarkdown("First paragraph.\n\nSecond paragraph.");
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
  });

  it("renders emphasis, strong, code spans", () => {
    const { html } = renderMarkdown("This is *italic*, **bold**, and `code`.");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
  });

  it("renders links with href and text", () => {
    const { html } = renderMarkdown("Visit [osu!](https://osu.ppy.sh/).");
    expect(html).toContain('<a href="https://osu.ppy.sh/">osu!</a>');
  });

  it("renders code blocks with escaped content", () => {
    const { html } = renderMarkdown("```\n<script>alert(1)</script>\n```");
    expect(html).toContain("<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("warns on wiki-links and strips them", () => {
    const result = renderMarkdown("See [[other note]] for details.");
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("[[other note]]");
    expect(result.html).not.toContain("[[");
  });

  it("passes through raw inline HTML", () => {
    const { html } = renderMarkdown('<span class="callout">Note</span>');
    expect(html).toContain('<span class="callout">Note</span>');
  });

  it("renders lists", () => {
    const { html } = renderMarkdown("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>three</li>");
  });
});
