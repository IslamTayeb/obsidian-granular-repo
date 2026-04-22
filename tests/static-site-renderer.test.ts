import { describe, expect, it } from "vitest";

import {
  renderPost,
  resolvePostRelativePath,
  TemplateRenderError,
} from "../src/services/static-site-renderer";
import { createApmOverflowPreset } from "../src/services/static-site-presets";
import { StaticSiteHostConfig } from "../src/types";

const APM_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <title>POST_TITLE | APM Overflow</title>
    <link rel="canonical" href="https://apmoverflow.xyz/POST_SLUG/" />
    <meta name="title" content="POST_TITLE" />
    <meta name="description" content="POST_DESCRIPTION" />
    <meta property="og:title" content="POST_TITLE" />
    <meta property="og:url" content="https://apmoverflow.xyz/POST_SLUG/" />
    <script type="application/ld+json">
      {
        "name": "POST_TITLE",
        "url": "https://apmoverflow.xyz/POST_SLUG/",
        "description": "POST_DESCRIPTION"
      }
    </script>
  </head>
  <body class="post">
    <main>
      <h1>POST_TITLE</h1>
      <p>
        <i><time datetime="YYYY-MM-DDTHH:MMZ">Mon DD, YYYY</time></i>
      </p>
      <p>Article content...</p>
    </main>
  </body>
</html>`;

function buildHost(
  overrides: Partial<StaticSiteHostConfig> = {},
): StaticSiteHostConfig {
  return { ...createApmOverflowPreset(), ...overrides };
}

describe("static site renderer", () => {
  it("substitutes all token occurrences in the APM Overflow template", () => {
    const host = buildHost();
    const result = renderPost({
      host,
      templateText: APM_TEMPLATE,
      title: "On Closing Doors",
      slug: "on-closing-doors",
      description: 'Much of our fears "stem" from uncertainty.',
      date: "2025-12-18T23:53Z",
      bodyHtml: "<p>Rendered body goes here.</p>",
    });

    expect(result.html).toContain(
      "<title>On Closing Doors | APM Overflow</title>",
    );
    expect(result.html).toContain(
      '<link rel="canonical" href="https://apmoverflow.xyz/on-closing-doors/" />',
    );
    expect(result.html).toContain(
      '<meta name="title" content="On Closing Doors" />',
    );
    expect(result.html).toContain(
      '<meta name="description" content="Much of our fears &quot;stem&quot; from uncertainty." />',
    );
    expect(result.html).toContain(
      '<meta property="og:title" content="On Closing Doors" />',
    );
    expect(result.html).toContain(
      '<meta property="og:url" content="https://apmoverflow.xyz/on-closing-doors/" />',
    );
    expect(result.html).toContain("<h1>On Closing Doors</h1>");
    expect(result.html).toContain(
      '<time datetime="2025-12-18T23:53Z">Dec 18, 2025</time>',
    );
    expect(result.html).toContain("<p>Rendered body goes here.</p>");
    expect(result.html).not.toContain("Article content...");
    expect(result.html).not.toContain("POST_TITLE");
    expect(result.html).not.toContain("POST_SLUG");
    expect(result.html).not.toContain("POST_DESCRIPTION");
    expect(result.dateIso).toBe("2025-12-18T23:53Z");
    expect(result.dateDisplay).toBe("Dec 18, 2025");
  });

  it("escapes HTML-sensitive chars in title and description", () => {
    const host = buildHost();
    const result = renderPost({
      host,
      templateText: APM_TEMPLATE,
      title: "A & B <C>",
      slug: "a-b-c",
      description: "<p>unsafe</p>",
      date: "2026-01-01",
      bodyHtml: "<p>Body</p>",
    });

    expect(result.html).toContain("A &amp; B &lt;C&gt;");
    expect(result.html).toContain("&lt;p&gt;unsafe&lt;/p&gt;");
  });

  it("throws when content marker is missing", () => {
    const host = buildHost();
    expect(() =>
      renderPost({
        host,
        templateText: "<html><body>no marker here</body></html>",
        title: "t",
        slug: "t",
        description: "d",
        date: "2026-01-01",
        bodyHtml: "<p>b</p>",
      }),
    ).toThrow(TemplateRenderError);
  });

  it("throws on invalid date", () => {
    const host = buildHost();
    expect(() =>
      renderPost({
        host,
        templateText: APM_TEMPLATE,
        title: "t",
        slug: "t",
        description: "d",
        date: "garbage",
        bodyHtml: "<p>b</p>",
      }),
    ).toThrow(TemplateRenderError);
  });

  it("resolves post relative paths using slug token", () => {
    const host = buildHost();
    expect(resolvePostRelativePath(host, "on-closing-doors")).toBe(
      "on-closing-doors/index.html",
    );
  });

  it("rejects path templates that traverse upward", () => {
    const host = buildHost({ postPathTemplate: "../{slug}/index.html" });
    expect(() => resolvePostRelativePath(host, "foo")).toThrow(
      TemplateRenderError,
    );
  });
});
