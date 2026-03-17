import { describe, expect, it } from "vitest";

import { buildRepoInventory } from "../src/services/repo-inventory";
import { RepoState } from "../src/types";

describe("buildRepoInventory", () => {
  it("dedupes tracked repos, keeps tracked file entries, and includes orphan mirrors", async () => {
    const repoStates = new Map<string, RepoState>([
      [
        "/vault/notes/blog",
        {
          hasLocalGit: true,
          hasOrigin: true,
          originUrl: "https://github.com/user/blog.git",
          isGitHubOrigin: true,
        },
      ],
      [
        "/vault/.obsidian/plugins/vault-publisher/mirrors/idea-abc12345",
        {
          hasLocalGit: false,
          hasOrigin: false,
          isGitHubOrigin: false,
        },
      ],
      [
        "/vault/archive/wiki",
        {
          hasLocalGit: true,
          hasOrigin: true,
          originUrl: "git@example.com:team/wiki.git",
          isGitHubOrigin: false,
        },
      ],
      [
        "/vault/.obsidian/plugins/vault-publisher/mirrors/orphan-def67890",
        {
          hasLocalGit: true,
          hasOrigin: true,
          originUrl: "https://github.com/user/orphan.git",
          isGitHubOrigin: true,
        },
      ],
    ]);

    const entries = await buildRepoInventory({
      vaultBasePath: "/vault",
      trackedTargets: [
        {
          targetType: "directory",
          vaultPath: "notes/blog",
          repoName: "blog",
          remote: "origin",
          visibility: "public",
          lastPushed: "2026-03-08T00:00:00Z",
          originUrl: "https://github.com/user/blog.git",
        },
        {
          targetType: "file",
          vaultPath: "notes/idea.md",
          repoName: "idea",
          remote: "origin",
          visibility: "private",
          lastPushed: "2026-03-08T00:00:00Z",
          originUrl: "https://github.com/user/idea.git",
          mirrorPath: ".obsidian/plugins/vault-publisher/mirrors/idea-abc12345",
          mirrorFileName: "idea.md",
        },
      ],
      standaloneRepoPaths: ["notes/blog", "archive/wiki"],
      orphanMirrorPaths: [
        ".obsidian/plugins/vault-publisher/mirrors/idea-abc12345",
        ".obsidian/plugins/vault-publisher/mirrors/orphan-def67890",
      ],
      resolveRepoState: async (absolutePath) =>
        repoStates.get(absolutePath) ?? {
          hasLocalGit: false,
          hasOrigin: false,
          isGitHubOrigin: false,
        },
    });

    expect(entries.map((entry) => `${entry.sourceKind}:${entry.vaultPath}`)).toEqual([
      "tracked-directory:notes/blog",
      "tracked-file:notes/idea.md",
      "scanned-directory:archive/wiki",
      "orphan-mirror:.obsidian/plugins/vault-publisher/mirrors/orphan-def67890",
    ]);

    const trackedFile = entries.find((entry) => entry.sourceKind === "tracked-file");
    expect(trackedFile?.canUnpublish).toBe(true);
    expect(trackedFile?.githubRepoSlug).toBe("user/idea");
    expect(trackedFile?.hasLocalGit).toBe(false);

    const scannedRepo = entries.find((entry) => entry.sourceKind === "scanned-directory");
    expect(scannedRepo?.canUnpublish).toBe(false);
    expect(scannedRepo?.disabledReason).toBe("Only GitHub remotes can be unpublished.");
  });

  it("allows unpublish for scanned repos with credentialed GitHub origins", async () => {
    const entries = await buildRepoInventory({
      vaultBasePath: "/vault",
      trackedTargets: [],
      standaloneRepoPaths: ["personal/duke-hacker-house"],
      orphanMirrorPaths: [],
      resolveRepoState: async () => ({
        hasLocalGit: true,
        hasOrigin: true,
        originUrl: "http://ghp_token@github.com/IslamTayeb/duke-hacker-house",
        isGitHubOrigin: true,
      }),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0].sourceKind).toBe("scanned-directory");
    expect(entries[0].githubRepoSlug).toBe("IslamTayeb/duke-hacker-house");
    expect(entries[0].canUnpublish).toBe(true);
  });
});
