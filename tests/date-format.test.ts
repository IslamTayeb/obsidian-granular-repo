import { describe, expect, it } from "vitest";

import {
  formatDisplayDate,
  formatIsoMinutesZ,
  parsePostDate,
} from "../src/utils/date-format";

describe("date-format", () => {
  it("parses YYYY-MM-DD as UTC midnight", () => {
    const parsed = parsePostDate("2026-03-18");
    expect(parsed).not.toBeNull();
    expect(parsed!.date.getUTCFullYear()).toBe(2026);
    expect(parsed!.date.getUTCMonth()).toBe(2);
    expect(parsed!.date.getUTCDate()).toBe(18);
    expect(parsed!.date.getUTCHours()).toBe(0);
    expect(parsed!.hasTime).toBe(false);
  });

  it("parses YYYY-MM-DDTHH:MMZ datetimes", () => {
    const parsed = parsePostDate("2026-03-18T18:25Z");
    expect(parsed).not.toBeNull();
    expect(parsed!.date.getUTCHours()).toBe(18);
    expect(parsed!.date.getUTCMinutes()).toBe(25);
    expect(parsed!.hasTime).toBe(true);
  });

  it("returns null for nonsense input", () => {
    expect(parsePostDate("not-a-date")).toBeNull();
    expect(parsePostDate("")).toBeNull();
    expect(parsePostDate(undefined)).toBeNull();
  });

  it("formats apmoverflow style iso minutes", () => {
    const parsed = parsePostDate("2026-03-18T18:25Z")!;
    expect(formatIsoMinutesZ(parsed.date)).toBe("2026-03-18T18:25Z");
  });

  it("formats apmoverflow style display date", () => {
    const parsed = parsePostDate("2025-12-18T23:53Z")!;
    expect(formatDisplayDate(parsed.date)).toBe("Dec 18, 2025");
  });
});
