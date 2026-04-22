import { describe, expect, it } from "vitest";

import {
  renderFrontmatterBlock,
  splitFrontmatter,
  upsertFrontmatterFields,
} from "../src/utils/frontmatter-io";

describe("frontmatter-io", () => {
  it("splits frontmatter from the body", () => {
    const input = `---\ntitle: Hello\n---\nBody line one.\nBody line two.\n`;
    const { frontmatterRaw, body } = splitFrontmatter(input);
    expect(frontmatterRaw).toBe("title: Hello");
    expect(body).toBe("Body line one.\nBody line two.\n");
  });

  it("returns null frontmatter when no fence is present", () => {
    const input = "Just body, no fence.";
    const { frontmatterRaw, body } = splitFrontmatter(input);
    expect(frontmatterRaw).toBeNull();
    expect(body).toBe(input);
  });

  it("renders a minimal frontmatter block quoting when needed", () => {
    const block = renderFrontmatterBlock({
      title: 'On "Closing" Doors',
      slug: "on-closing-doors",
      date: "2025-12-18T23:53Z",
      description: "Much of our fears stem from uncertainty.",
    });
    expect(block).toContain('title: "On \\"Closing\\" Doors"');
    expect(block).toContain("slug: on-closing-doors");
    expect(block).toContain('date: "2025-12-18T23:53Z"');
    expect(block).toContain(
      "description: Much of our fears stem from uncertainty.",
    );
  });

  it("inserts frontmatter when the file has none", () => {
    const input = "Body paragraph.";
    const output = upsertFrontmatterFields(input, {
      title: "T",
      slug: "t",
      date: "2026-01-01",
      description: "d",
    });
    expect(
      output.startsWith(
        "---\ntitle: T\nslug: t\ndate: 2026-01-01\ndescription: d\n---\n",
      ),
    ).toBe(true);
    expect(output).toContain("Body paragraph.");
  });

  it("updates existing managed keys and preserves other keys", () => {
    const input = `---\ntitle: Old\ntags:\n  - a\n  - b\ncustom: keep-me\n---\nBody here.\n`;
    const output = upsertFrontmatterFields(input, {
      title: "New",
      slug: "new",
      date: "2026-01-01",
      description: "d",
    });
    expect(output).toContain("title: New");
    expect(output).not.toContain("title: Old");
    expect(output).toContain("custom: keep-me");
    expect(output).toContain("tags:\n  - a\n  - b");
    expect(output).toContain("Body here.");
  });

  it("includes host when provided", () => {
    const output = upsertFrontmatterFields("", {
      title: "t",
      slug: "t",
      date: "2026-01-01",
      description: "d",
      host: "apm-overflow",
    });
    expect(output).toContain("host: apm-overflow");
  });
});
