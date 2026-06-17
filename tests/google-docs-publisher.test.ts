import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  GoogleDocsMediaUpload,
  GoogleDocsPublishError,
  GoogleDocsPublisher,
} from "../src/services/google-docs-publisher";

function createFakeGoogleClients() {
  let counter = 0;
  const files = new Map<string, any>();
  const permissions: Array<{ fileId: string; requestBody: unknown }> = [];
  const batchUpdates: unknown[] = [];
  const fileUpdates: Array<{
    fileId: string;
    requestBody: any;
    media?: { mimeType: string; body: Buffer };
  }> = [];
  const trashed: string[] = [];
  const codeBlockText =
    "GVP_CODE_BLOCK_0_START\nconst value = 1;\nGVP_CODE_BLOCK_0_END\n";

  const nextId = (prefix: string) => `${prefix}-${++counter}`;

  const drive = {
    files: {
      create: async ({ requestBody }: any) => {
        const isFolder =
          requestBody.mimeType === "application/vnd.google-apps.folder";
        const isDoc =
          requestBody.mimeType === "application/vnd.google-apps.document";
        const id = nextId(isFolder ? "folder" : isDoc ? "doc" : "asset");
        const file = {
          id,
          name: requestBody.name,
          mimeType: requestBody.mimeType,
          webViewLink: isDoc
            ? `https://docs.google.com/document/d/${id}/edit`
            : `https://drive.google.com/file/d/${id}/view`,
          webContentLink: isDoc
            ? undefined
            : `https://drive.google.com/uc?id=${id}`,
        };
        files.set(id, file);
        return { data: file };
      },
      update: async ({ fileId, requestBody, media }: any) => {
        fileUpdates.push({ fileId, requestBody, media });
        const existing = files.get(fileId) ?? { id: fileId };
        const next = {
          ...existing,
          ...requestBody,
          id: fileId,
          webViewLink:
            existing.webViewLink ??
            `https://drive.google.com/file/d/${fileId}/view`,
          webContentLink:
            existing.webContentLink ??
            (requestBody.mimeType?.startsWith?.("image/")
              ? `https://drive.google.com/uc?id=${fileId}`
              : undefined),
        };
        if (requestBody.trashed) {
          trashed.push(fileId);
        }
        files.set(fileId, next);
        return { data: next };
      },
      get: async ({ fileId }: any) => ({ data: files.get(fileId) }),
    },
    permissions: {
      create: async ({ fileId, requestBody }: any) => {
        permissions.push({ fileId, requestBody });
        return { data: { id: `perm-${fileId}` } };
      },
    },
  };

  const docs = {
    documents: {
      get: async () => ({
        data: {
          body: {
            content: [
              {
                startIndex: 1,
                endIndex: 10,
                paragraph: {
                  paragraphStyle: { namedStyleType: "HEADING_2" },
                  elements: [
                    {
                      startIndex: 1,
                      textRun: { content: "Heading\n" },
                    },
                  ],
                },
              },
              {
                startIndex: 10,
                endIndex: 10 + codeBlockText.length,
                paragraph: {
                  elements: [
                    {
                      startIndex: 10,
                      textRun: { content: codeBlockText },
                    },
                  ],
                },
              },
              {
                startIndex: 100,
                endIndex: 130,
                paragraph: {
                  elements: [
                    {
                      startIndex: 100,
                      textRun: { content: "GVP_MEDIA_0_PLACEHOLDER\n" },
                    },
                  ],
                },
              },
              {
                startIndex: 140,
                endIndex: 170,
                paragraph: {
                  elements: [
                    {
                      startIndex: 140,
                      textRun: { content: "GVP_MEDIA_1_PLACEHOLDER\n" },
                    },
                  ],
                },
              },
            ],
          },
        },
      }),
      batchUpdate: async (request: any) => {
        batchUpdates.push(request.requestBody.requests);
        return { data: {} };
      },
    },
  };

  return { drive, docs, permissions, batchUpdates, fileUpdates, trashed };
}

describe("GoogleDocsPublisher", () => {
  it("creates a doc, uploads media, shares files, and patches placeholders", async () => {
    const fake = createFakeGoogleClients();
    const publisher = new GoogleDocsPublisher(async () => ({
      drive: fake.drive,
      docs: fake.docs,
    }));
    const mediaUploads: GoogleDocsMediaUpload[] = [
      {
        marker: "GVP_MEDIA_0_PLACEHOLDER",
        original: "![Image](image.png)",
        vaultPath: "attachments/image.png",
        name: "image.png",
        mimeType: "image/png",
        checksum: "image-checksum",
        kind: "image",
        bytes: Buffer.from("image"),
        inlineSupported: true,
      },
      {
        marker: "GVP_MEDIA_1_PLACEHOLDER",
        original: "![[clip.mp4]]",
        vaultPath: "attachments/clip.mp4",
        name: "clip.mp4",
        mimeType: "video/mp4",
        checksum: "video-checksum",
        kind: "video",
        bytes: Buffer.from("video"),
        inlineSupported: false,
      },
    ];

    const result = await publisher.publish({
      settings: {
        credentialsPath: "/unused.json",
        refreshToken: "refresh",
        docsFolderId: "docs-folder",
      },
      title: "Post",
      html: "<html><body><p>GVP_MEDIA_0_PLACEHOLDER</p><p>GVP_MEDIA_1_PLACEHOLDER</p></body></html>",
      vaultPath: "notes/post.md",
      mediaUploads,
      missingMedia: [],
    });

    expect(result.status).toBe("created");
    expect(result.settings.mediaFolderId).toMatch(/^folder-/);
    expect(result.record.docId).toMatch(/^doc-/);
    expect(result.record.assets).toHaveLength(2);
    expect(fake.permissions).toHaveLength(3);
    expect(fake.batchUpdates.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: expect.objectContaining({
              spaceBelow: { magnitude: 6, unit: "PT" },
            }),
          }),
        }),
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: expect.objectContaining({
              spaceAbove: { magnitude: 12, unit: "PT" },
            }),
          }),
        }),
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: expect.objectContaining({
              shading: expect.objectContaining({
                backgroundColor: expect.any(Object),
              }),
            }),
          }),
        }),
        expect.objectContaining({ insertInlineImage: expect.any(Object) }),
        expect.objectContaining({
          insertRichLink: expect.objectContaining({
            richLinkProperties: expect.objectContaining({
              uri: expect.stringContaining("drive.google.com"),
            }),
          }),
        }),
      ]),
    );
    const codeBlockBatch = fake.batchUpdates.find((requests) =>
      (requests as any[]).some(
        (request) => request.updateParagraphStyle?.paragraphStyle?.shading,
      ),
    ) as any[];
    expect(codeBlockBatch).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deleteContentRange: expect.any(Object) }),
      ]),
    );
  });

  it("updates an existing doc and trashes removed assets", async () => {
    const fake = createFakeGoogleClients();
    const publisher = new GoogleDocsPublisher(async () => ({
      drive: fake.drive,
      docs: fake.docs,
    }));

    const result = await publisher.publish({
      settings: {
        credentialsPath: "/unused.json",
        refreshToken: "refresh",
        docsFolderId: "docs-folder",
        mediaFolderId: "media-root",
      },
      title: "Post",
      html: "<html><body><p>GVP_MEDIA_0_PLACEHOLDER</p></body></html>",
      vaultPath: "notes/post.md",
      previousRecord: {
        vaultPath: "notes/post.md",
        docId: "doc-existing",
        docUrl: "https://docs.google.com/document/d/doc-existing/edit",
        assetFolderId: "assets-existing",
        lastUploaded: "2026-06-07T00:00:00Z",
        assets: [
          {
            vaultPath: "attachments/old.png",
            fileId: "old-asset",
            name: "old.png",
            mimeType: "image/png",
            checksum: "old",
            kind: "image",
            lastUploaded: "2026-06-07T00:00:00Z",
          },
        ],
      },
      mediaUploads: [],
      missingMedia: [
        {
          marker: "GVP_MEDIA_0_PLACEHOLDER",
          original: "![[missing.png]]",
          message: "Could not resolve media ![[missing.png]].",
        },
      ],
    });

    expect(result.status).toBe("updated");
    expect(result.record.docId).toBe("doc-existing");
    expect(fake.batchUpdates[0]).toEqual([
      {
        deleteContentRange: {
          range: { startIndex: 1, endIndex: 169 },
        },
      },
    ]);
    expect(
      fake.fileUpdates.find((update) => update.fileId === "doc-existing")
        ?.media?.body.toString("utf8"),
    ).toContain("GVP_MEDIA_0_PLACEHOLDER");
    expect(fake.trashed).toContain("old-asset");
    expect(fake.batchUpdates.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: expect.objectContaining({
              spaceBelow: { magnitude: 6, unit: "PT" },
            }),
          }),
        }),
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: expect.objectContaining({
              spaceAbove: { magnitude: 12, unit: "PT" },
            }),
          }),
        }),
        expect.objectContaining({
          updateParagraphStyle: expect.objectContaining({
            paragraphStyle: expect.objectContaining({
              shading: expect.objectContaining({
                backgroundColor: expect.any(Object),
              }),
            }),
          }),
        }),
        expect.objectContaining({ insertText: expect.any(Object) }),
        expect.objectContaining({ updateTextStyle: expect.any(Object) }),
      ]),
    );
  });

  it("asks the user to re-authorize when Google rejects the refresh token", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "gvp-google-auth-"));
    const credentialsPath = path.join(tempDir, "client.json");
    await writeFile(
      credentialsPath,
      JSON.stringify({
        installed: {
          client_id: "client-id",
          client_secret: "client-secret",
        },
      }),
      "utf8",
    );

    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Bad Request",
        }),
        {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      await expect(
        new GoogleDocsPublisher().publish({
          settings: {
            credentialsPath,
            refreshToken: "stale-refresh-token",
            docsFolderId: "docs-folder",
          },
          title: "Post",
          html: "<html><body><p>Post</p></body></html>",
          vaultPath: "notes/post.md",
          mediaUploads: [],
          missingMedia: [],
        }),
      ).rejects.toThrow(
        new GoogleDocsPublishError(
          "Google Docs authorization expired or was revoked. Re-authorize Google Docs in Vault Publisher settings, then retry the upload.",
        ),
      );
    } finally {
      globalThis.fetch = originalFetch;
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
