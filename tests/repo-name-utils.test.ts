import { describe, expect, it } from "vitest";

import {
  parseRepoNameFromOrigin,
  repoNameCandidates,
  sanitizeRepoName,
} from "../src/utils/repo-name-utils";

describe("repo-name-utils", () => {
  it("sanitizes repository names", () => {
    expect(sanitizeRepoName(" blog notes ")).toBe("blog-notes");
    expect(sanitizeRepoName("***")).toBe("vault-publisher");
  });

  it("generates collision candidates", () => {
    expect(repoNameCandidates("blog", 3)).toEqual(["blog", "blog-2", "blog-3"]);
  });

  it("parses repo name from GitHub origin urls", () => {
    expect(parseRepoNameFromOrigin("git@github.com:user/blog.git")).toBe("blog");
    expect(parseRepoNameFromOrigin("https://github.com/user/blog.git")).toBe("blog");
    expect(parseRepoNameFromOrigin("ssh://git@github.com/user/blog.git")).toBe("blog");
  });
});
