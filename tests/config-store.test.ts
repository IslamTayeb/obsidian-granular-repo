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
            originUrl: "https://github.com/user/idea.git",
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
    expect(fileRecord?.originUrl).toBe("https://github.com/user/idea.git");

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

  it("removes tracked targets by type and normalized path", async () => {
    const plugin = {
      loadData: vi.fn(async () => ({
        publishedTargets: [
          {
            targetType: "directory",
            vaultPath: "notes/blog",
            repoName: "blog",
            remote: "origin",
            visibility: "public",
            lastPushed: "2026-03-08T00:00:00Z",
          },
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

    expect(store.removeTarget("directory", "/notes/blog/")).toBe(true);
    expect(store.findTarget("directory", "notes/blog")).toBeUndefined();
    expect(store.findTarget("file", "notes/idea.md")).toBeDefined();
    expect(store.removeTarget("directory", "notes/blog")).toBe(false);
  });

  it("loads and updates Google Docs settings and per-note records", async () => {
    const plugin = {
      loadData: vi.fn(async () => ({
        googleDocs: {
          credentialsPath: "/Users/me/client.json",
          refreshToken: "refresh-token",
          docsFolderId: "docs-folder",
          mediaFolderId: "media-folder",
        },
        googleDocsPublishes: [
          {
            vaultPath: "/notes/post.md",
            docId: "doc-1",
            docUrl: "https://docs.google.com/document/d/doc-1/edit",
            assetFolderId: "assets-1",
            lastUploaded: "2026-06-07T00:00:00Z",
            assets: [
              {
                vaultPath: "/attachments/image.png",
                fileId: "asset-1",
                name: "image.png",
                mimeType: "image/png",
                checksum: "abc",
                kind: "image",
                webViewLink: "https://drive.google.com/file/d/asset-1/view",
                webContentLink: "https://drive.google.com/uc?id=asset-1",
                lastUploaded: "2026-06-07T00:00:00Z",
              },
            ],
          },
        ],
      })),
      saveData: vi.fn(async () => undefined),
    } as any;

    const store = new ConfigStore(plugin);
    await store.load();

    expect(store.getGoogleDocsSettings().docsFolderId).toBe("docs-folder");
    expect(store.findGoogleDocsPublish("notes/post.md")?.docId).toBe("doc-1");
    expect(
      store.findGoogleDocsPublish("notes/post.md")?.assets[0].vaultPath,
    ).toBe("attachments/image.png");

    store.updateGoogleDocsSettings({
      docsFolderId: "new-folder",
      refreshToken: "",
    });
    expect(store.getGoogleDocsSettings().docsFolderId).toBe("new-folder");
    expect(store.getGoogleDocsSettings().refreshToken).toBeUndefined();

    store.upsertGoogleDocsPublish({
      vaultPath: "notes/post.md",
      docId: "doc-2",
      docUrl: "https://docs.google.com/document/d/doc-2/edit",
      assetFolderId: "assets-2",
      lastUploaded: "2026-06-08T00:00:00Z",
      assets: [],
    });
    expect(store.getGoogleDocsPublishes()).toHaveLength(1);
    expect(store.findGoogleDocsPublish("notes/post.md")?.docId).toBe("doc-2");
  });
});
