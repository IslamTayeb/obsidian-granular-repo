import { describe, expect, it } from "vitest";

import { isValidSlug, sanitizeSlug, isReservedSlug } from "../src/utils/slug";

describe("slug utils", () => {
  it("sanitizes titles to kebab-case ascii", () => {
    expect(sanitizeSlug("On Fingerspitzengefühl")).toBe(
      "on-fingerspitzengefuhl",
    );
    expect(sanitizeSlug("  Hello   World!  ")).toBe("hello-world");
    expect(sanitizeSlug("___weird$%$@.characters___")).toBe("weird-characters");
  });

  it("rejects reserved slugs", () => {
    expect(isReservedSlug("blog")).toBe(true);
    expect(isReservedSlug("feed")).toBe(true);
    expect(isReservedSlug("static")).toBe(true);
    expect(isReservedSlug("whatever")).toBe(false);
  });

  it("validates slug shape", () => {
    expect(isValidSlug("on-closing-doors")).toBe(true);
    expect(isValidSlug("abc123")).toBe(true);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-leading-dash")).toBe(false);
    expect(isValidSlug("UPPER")).toBe(false);
    expect(isValidSlug("blog")).toBe(false);
  });
});
