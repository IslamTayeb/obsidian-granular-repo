import { describe, expect, it } from "vitest";

import { computePostDefaults, mergeDefaults } from "../src/utils/post-defaults";

describe("computePostDefaults", () => {
  it("uses the first heading as the title", () => {
    const defaults = computePostDefaults({
      fileBasename: "any-file",
      body: "# On Closing Doors\n\nSome body text here.",
      now: new Date(Date.UTC(2026, 2, 18, 18, 25)),
    });

    expect(defaults.title).toBe("On Closing Doors");
    expect(defaults.slug).toBe("on-closing-doors");
  });

  it("falls back to a title-cased filename when no heading exists", () => {
    const defaults = computePostDefaults({
      fileBasename: "multi-agent-communication-research",
      body: "Just body text without a heading.",
      now: new Date(Date.UTC(2026, 0, 1, 0, 0)),
    });

    expect(defaults.title).toBe("Multi Agent Communication Research");
    expect(defaults.slug).toBe("multi-agent-communication-research");
    expect(defaults.date).toBe("2026-01-01T00:00Z");
  });

  it("extracts a description from the first paragraph and truncates long text", () => {
    const longParagraph = "A ".repeat(120).trim();
    const defaults = computePostDefaults({
      fileBasename: "note",
      body: `# Title\n\n${longParagraph}`,
      now: new Date(Date.UTC(2026, 0, 1, 0, 0)),
    });

    expect(defaults.description.length).toBeLessThanOrEqual(180);
    expect(defaults.description.endsWith("...")).toBe(true);
  });

  it("strips markdown from the description", () => {
    const defaults = computePostDefaults({
      fileBasename: "note",
      body: "# Title\n\nSee [osu!](https://osu.ppy.sh/) and *italic* and `code`.",
      now: new Date(Date.UTC(2026, 0, 1, 0, 0)),
    });

    expect(defaults.description).toBe("See osu! and italic and code.");
  });

  it("handles notes with no body gracefully", () => {
    const defaults = computePostDefaults({
      fileBasename: "empty-note",
      body: "",
      now: new Date(Date.UTC(2026, 0, 1, 0, 0)),
    });

    expect(defaults.title).toBe("Empty Note");
    expect(defaults.description).toBe("");
    expect(defaults.slug).toBe("empty-note");
  });
});

describe("mergeDefaults", () => {
  it("prefers user-provided fields over defaults", () => {
    const merged = mergeDefaults(
      {
        title: "Real Title",
        description: "Real description.",
      },
      {
        title: "Default Title",
        slug: "default-title",
        date: "2026-01-01T00:00Z",
        description: "Default description.",
      },
    );

    expect(merged.title).toBe("Real Title");
    expect(merged.description).toBe("Real description.");
    expect(merged.slug).toBe("default-title");
    expect(merged.date).toBe("2026-01-01T00:00Z");
  });

  it("picks up `host` identifier when provided", () => {
    const merged = mergeDefaults(
      { host: "apm-overflow" },
      {
        title: "t",
        slug: "t",
        date: "2026-01-01T00:00Z",
        description: "d",
      },
    );

    expect(merged.hostId).toBe("apm-overflow");
  });

  it("handles absent existing frontmatter", () => {
    const merged = mergeDefaults(undefined, {
      title: "Default Title",
      slug: "default-title",
      date: "2026-01-01T00:00Z",
      description: "Default description.",
    });

    expect(merged).toEqual({
      title: "Default Title",
      slug: "default-title",
      date: "2026-01-01T00:00Z",
      description: "Default description.",
      hostId: undefined,
    });
  });
});
