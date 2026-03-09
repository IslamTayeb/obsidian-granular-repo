import { describe, expect, it, vi } from "vitest";

import { ConfigStore } from "../src/services/config-store";

describe("ConfigStore", () => {
  it("migrates legacy publishedDirs to publishedTargets", async () => {
    const saveData = vi.fn(async () => undefined);
    const plugin = {
      loadData: vi.fn(async () => ({
        publishedDirs: [
          {
            vaultPath: "notes/blog",
            repoName: "blog",
            remote: "origin",
            visibility: "public",
            lastPushed: "2026-03-08T00:00:00Z",
          },
        ],
      })),
      saveData,
    } as any;

    const store = new ConfigStore(plugin);
    await store.load();

    const record = store.findTarget("directory", "notes/blog");
    expect(record?.targetType).toBe("directory");
    expect(record?.repoName).toBe("blog");
    expect(saveData).toHaveBeenCalledTimes(1);
  });

  it("loads v2 file records and upserts by target type + path", async () => {
    const plugin = {
      loadData: vi.fn(async () => ({
        publishedTargets: [
          {
            targetType: "file",
            vaultPath: "notes/idea.md",
            repoName: "idea",
            remote: "origin",
            visibility: "private",
            lastPushed: "2026-03-08T00:00:00Z",
            mirrorPath: ".obsidian/plugins/vault-publisher/mirrors/idea-abc12345",
            mirrorFileName: "idea.md",
          },
        ],
      })),
      saveData: vi.fn(async () => undefined),
    } as any;

    const store = new ConfigStore(plugin);
    await store.load();

    const fileRecord = store.findTarget("file", "notes/idea.md");
    expect(fileRecord?.mirrorFileName).toBe("idea.md");

    store.upsertTarget({
      targetType: "directory",
      vaultPath: "notes",
      repoName: "notes",
      remote: "origin",
      visibility: "public",
      lastPushed: "2026-03-09T00:00:00Z",
    });

    expect(store.getTargetsByType("file")).toHaveLength(1);
    expect(store.getTargetsByType("directory")).toHaveLength(1);
  });
});
