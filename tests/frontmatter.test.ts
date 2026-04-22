import { describe, expect, it } from "vitest";

import { validatePostFrontmatter } from "../src/utils/frontmatter";

describe("validatePostFrontmatter", () => {
  it("accepts full required fields and sanitizes slug", () => {
    const result = validatePostFrontmatter({
      title: "On Fingerspitzengefühl",
      slug: "On Fingerspitzengefühl",
      date: "2026-03-18T18:25Z",
      description: "I used to play this rhythm game called osu!",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slug).toBe("on-fingerspitzengefuhl");
      expect(result.value.title).toBe("On Fingerspitzengefühl");
      expect(result.value.description).toBe(
        "I used to play this rhythm game called osu!",
      );
      expect(result.value.date).toBe("2026-03-18T18:25Z");
    }
  });

  it("derives slug from title when slug absent", () => {
    const result = validatePostFrontmatter({
      title: "On Closing Doors",
      date: "2025-12-18",
      description: "Much of our fears stem from uncertainty.",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slug).toBe("on-closing-doors");
    }
  });

  it("rejects missing title/description/date", () => {
    const result = validatePostFrontmatter({ slug: "foo" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fields = result.errors.map((error) => error.field);
      expect(fields).toContain("title");
      expect(fields).toContain("description");
      expect(fields).toContain("date");
    }
  });

  it("rejects reserved slugs", () => {
    const result = validatePostFrontmatter({
      title: "Blog",
      slug: "blog",
      date: "2026-01-01",
      description: "x",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.field === "slug")).toBe(true);
    }
  });

  it("passes through host id when provided", () => {
    const result = validatePostFrontmatter({
      title: "A",
      slug: "a",
      date: "2026-01-01",
      description: "x",
      host: "apm-overflow",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hostId).toBe("apm-overflow");
    }
  });
});
