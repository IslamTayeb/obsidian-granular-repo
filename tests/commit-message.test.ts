import { describe, expect, it } from "vitest";

import { buildCommitMessage, formatCommitTimestamp } from "../src/utils/commit-message";

describe("commit-message", () => {
  it("formats timestamp as YYYY-MM-DD HH:mm", () => {
    const value = formatCommitTimestamp(new Date("2026-03-08T14:05:00Z"));
    expect(value).toMatch(/^2026-03-08\s\d{2}:05$/);
  });

  it("builds commit message with folder name", () => {
    const message = buildCommitMessage("blog", new Date("2026-03-08T14:30:00Z"));
    expect(message).toMatch(/^vault-publisher: update blog - 2026-03-08 \d{2}:30$/);
  });
});
