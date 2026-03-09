import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  absolutePathForVaultPath,
  ensureInsideVault,
  fileStemFromVaultPath,
  folderNameFromVaultPath,
  isVaultRoot,
  normalizeVaultPath,
} from "../src/utils/path-utils";

describe("path-utils", () => {
  it("normalizes slashes and trims leading/trailing separators", () => {
    expect(normalizeVaultPath("/notes/blog/")) .toBe("notes/blog");
    expect(normalizeVaultPath("notes\\blog\\")) .toBe("notes/blog");
  });

  it("detects vault root", () => {
    expect(isVaultRoot("/")).toBe(true);
    expect(isVaultRoot("notes")).toBe(false);
  });

  it("builds absolute path under vault", () => {
    const absolute = absolutePathForVaultPath("/vault", "notes/blog");
    expect(absolute).toBe(path.resolve("/vault", "notes/blog"));
  });

  it("checks vault boundary correctly", () => {
    expect(ensureInsideVault("/vault", "/vault/notes")).toBe(true);
    expect(ensureInsideVault("/vault", "/etc")).toBe(false);
  });

  it("extracts folder name", () => {
    expect(folderNameFromVaultPath("notes/blog")).toBe("blog");
  });

  it("extracts file stem from file path", () => {
    expect(fileStemFromVaultPath("notes/My Note.md")).toBe("My Note");
  });
});
