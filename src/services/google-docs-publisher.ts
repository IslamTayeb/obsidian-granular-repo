import fsp from "node:fs/promises";
import http from "node:http";
import { AddressInfo } from "node:net";

import {
  GoogleDocsAssetKind,
  GoogleDocsAssetRecord,
  GoogleDocsPublishRecord,
  GoogleDocsSettings,
} from "../types";
import { normalizeVaultPath } from "../utils/path-utils";

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_ROOT = "https://www.googleapis.com/upload/drive/v3";
const DOCS_API_ROOT = "https://docs.googleapis.com/v1";
const DEFAULT_MEDIA_FOLDER_NAME = "Vault Publisher Media";
const GOOGLE_DOCS_PARAGRAPH_SPACE_AFTER_PT = 6;
const GOOGLE_DOCS_HEADING_SPACE_ABOVE_PT = 12;
const GOOGLE_DOCS_CODE_BLOCK_BACKGROUND = {
  red: 0.94509804,
  green: 0.9529412,
  blue: 0.95686275,
};
const GOOGLE_DOCS_CODE_BLOCK_MARKER = /GVP_CODE_BLOCK_(\d+)_(START|END)/g;

type GoogleClientBundle = {
  drive: any;
  docs: any;
};

export type GoogleClientFactory = (
  settings: GoogleDocsSettings,
) => Promise<GoogleClientBundle>;

type GoogleOAuthFile = {
  installed?: GoogleOAuthClientConfig;
  web?: GoogleOAuthClientConfig;
};

type GoogleOAuthClientConfig = {
  client_id?: string;
  client_secret?: string;
  redirect_uris?: string[];
};

export interface GoogleDocsMediaUpload {
  marker: string;
  original: string;
  vaultPath: string;
  name: string;
  mimeType: string;
  checksum: string;
  kind: GoogleDocsAssetKind;
  bytes: Buffer;
  inlineSupported: boolean;
}

export interface GoogleDocsMissingMedia {
  marker: string;
  original: string;
  message: string;
}

export interface GoogleDocsPublishInput {
  settings: GoogleDocsSettings;
  title: string;
  html: string;
  vaultPath: string;
  previousRecord?: GoogleDocsPublishRecord;
  mediaUploads: GoogleDocsMediaUpload[];
  missingMedia: GoogleDocsMissingMedia[];
}

export interface GoogleDocsPublishResult {
  record: GoogleDocsPublishRecord;
  settings: GoogleDocsSettings;
  status: "created" | "updated";
  warnings: string[];
}

type MediaReplacement = {
  marker: string;
  original: string;
  kind: GoogleDocsAssetKind;
  inlineSupported: boolean;
  asset?: GoogleDocsAssetRecord;
  warning?: string;
};

type TextRange = {
  startIndex: number;
  endIndex: number;
};

type ParagraphTextRun = {
  offsetStart: number;
  offsetEnd: number;
  startIndex: number;
};

type ParagraphText = {
  startIndex: number;
  endIndex: number;
  text: string;
  runs: ParagraphTextRun[];
};

type CodeBlockMarker = {
  blockIndex: number;
  type: "START" | "END";
  marker: string;
  offset: number;
  paragraph: ParagraphText;
};

type CodeBlockPatch = {
  styleRange: TextRange;
  deletionRanges: TextRange[];
};

export class GoogleDocsPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleDocsPublishError";
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeDriveName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

function fallbackDocUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit`;
}

function fallbackDriveUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function normalizeSettings(settings: GoogleDocsSettings): GoogleDocsSettings {
  return {
    credentialsPath: settings.credentialsPath?.trim() || undefined,
    refreshToken: settings.refreshToken?.trim() || undefined,
    docsFolderId: settings.docsFolderId?.trim() || undefined,
    mediaFolderId: settings.mediaFolderId?.trim() || undefined,
  };
}

async function loadOAuthConfig(
  credentialsPath: string | undefined,
): Promise<GoogleOAuthClientConfig> {
  if (!credentialsPath) {
    throw new GoogleDocsPublishError(
      "Google OAuth credentials path is not configured.",
    );
  }

  let parsed: GoogleOAuthFile;
  try {
    parsed = JSON.parse(await fsp.readFile(credentialsPath, "utf8"));
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    throw new GoogleDocsPublishError(
      `Could not read Google OAuth credentials: ${detail}`,
    );
  }

  const config = parsed.installed ?? parsed.web;
  if (!config?.client_id || !config.client_secret) {
    throw new GoogleDocsPublishError(
      "Google OAuth credentials must contain an installed or web client with client_id and client_secret.",
    );
  }

  return config;
}

function getErrorStatus(error: unknown): number | undefined {
  const candidate = error as {
    code?: number;
    response?: { status?: number };
  };
  return candidate.response?.status ?? candidate.code;
}

function isMissingFileError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 404 || status === 410;
}

function isGoogleDocsHeadingStyle(value: unknown): boolean {
  return typeof value === "string" && /^HEADING_[1-6]$/.test(value);
}

class GoogleDocsApiError extends Error {
  readonly code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = "GoogleDocsApiError";
    this.code = code;
  }
}

function makeAuthUrl(
  config: GoogleOAuthClientConfig,
  redirectUri: string,
): string {
  const params = new URLSearchParams({
    client_id: config.client_id ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message =
      data?.error_description ??
      data?.error?.message ??
      data?.error ??
      response.statusText;
    throw new GoogleDocsApiError(String(message), response.status);
  }
  return data as T;
}

async function exchangeCodeForRefreshToken(
  config: GoogleOAuthClientConfig,
  code: string,
  redirectUri: string,
): Promise<string> {
  const data = await fetchJson<{ refresh_token?: string }>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.client_id ?? "",
      client_secret: config.client_secret ?? "",
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!data.refresh_token) {
    throw new GoogleDocsPublishError(
      "Google did not return a refresh token. Revoke the app in your Google account and authorize again.",
    );
  }

  return data.refresh_token;
}

async function refreshAccessToken(
  config: GoogleOAuthClientConfig,
  refreshToken: string,
): Promise<string> {
  const data = await fetchJson<{ access_token?: string }>(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.client_id ?? "",
      client_secret: config.client_secret ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!data.access_token) {
    throw new GoogleDocsPublishError(
      "Google did not return an access token. Re-authorize Google Docs in settings.",
    );
  }

  return data.access_token;
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function multipartBody(
  metadata: Record<string, unknown>,
  media: { mimeType: string; body: Buffer },
): { body: Buffer; contentType: string } {
  const boundary = `vault-publisher-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const header = Buffer.from(
    [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${media.mimeType}`,
      "",
      "",
    ].join("\r\n"),
    "utf8",
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    body: Buffer.concat([header, media.body, footer]),
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

class GoogleDriveRestClient {
  readonly files: {
    create: (input: any) => Promise<{ data: any }>;
    update: (input: any) => Promise<{ data: any }>;
    get: (input: any) => Promise<{ data: any }>;
  };

  readonly permissions: {
    create: (input: any) => Promise<{ data: any }>;
  };

  constructor(private readonly accessToken: string) {
    this.files = {
      create: (input) => this.createFile(input),
      update: (input) => this.updateFile(input),
      get: (input) => this.getFile(input),
    };
    this.permissions = {
      create: (input) => this.createPermission(input),
    };
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      ...(extra ?? {}),
    };
  }

  private async createFile(input: any): Promise<{ data: any }> {
    if (input.media) {
      const multipart = multipartBody(input.requestBody, input.media);
      const data = await fetchJson(
        `${DRIVE_UPLOAD_ROOT}/files${buildQuery({
          uploadType: "multipart",
          fields: input.fields,
        })}`,
        {
          method: "POST",
          headers: this.authHeaders({ "Content-Type": multipart.contentType }),
          body: multipart.body,
        },
      );
      return { data };
    }

    const data = await fetchJson(
      `${DRIVE_API_ROOT}/files${buildQuery({ fields: input.fields })}`,
      {
        method: "POST",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input.requestBody),
      },
    );
    return { data };
  }

  private async updateFile(input: any): Promise<{ data: any }> {
    const encodedFileId = encodeURIComponent(input.fileId);
    if (input.media) {
      const multipart = multipartBody(input.requestBody, input.media);
      const data = await fetchJson(
        `${DRIVE_UPLOAD_ROOT}/files/${encodedFileId}${buildQuery({
          uploadType: "multipart",
          fields: input.fields,
        })}`,
        {
          method: "PATCH",
          headers: this.authHeaders({ "Content-Type": multipart.contentType }),
          body: multipart.body,
        },
      );
      return { data };
    }

    const data = await fetchJson(
      `${DRIVE_API_ROOT}/files/${encodedFileId}${buildQuery({
        fields: input.fields,
      })}`,
      {
        method: "PATCH",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input.requestBody),
      },
    );
    return { data };
  }

  private async getFile(input: any): Promise<{ data: any }> {
    const encodedFileId = encodeURIComponent(input.fileId);
    const data = await fetchJson(
      `${DRIVE_API_ROOT}/files/${encodedFileId}${buildQuery({
        fields: input.fields,
      })}`,
      {
        method: "GET",
        headers: this.authHeaders(),
      },
    );
    return { data };
  }

  private async createPermission(input: any): Promise<{ data: any }> {
    const encodedFileId = encodeURIComponent(input.fileId);
    const data = await fetchJson(
      `${DRIVE_API_ROOT}/files/${encodedFileId}/permissions${buildQuery({
        fields: input.fields,
      })}`,
      {
        method: "POST",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input.requestBody),
      },
    );
    return { data };
  }
}

class GoogleDocsRestClient {
  readonly documents: {
    get: (input: any) => Promise<{ data: any }>;
    batchUpdate: (input: any) => Promise<{ data: any }>;
  };

  constructor(private readonly accessToken: string) {
    this.documents = {
      get: (input) => this.getDocument(input),
      batchUpdate: (input) => this.batchUpdateDocument(input),
    };
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      ...(extra ?? {}),
    };
  }

  private async getDocument(input: any): Promise<{ data: any }> {
    const encodedDocumentId = encodeURIComponent(input.documentId);
    const data = await fetchJson(
      `${DOCS_API_ROOT}/documents/${encodedDocumentId}${buildQuery({
        fields: input.fields,
      })}`,
      {
        method: "GET",
        headers: this.authHeaders(),
      },
    );
    return { data };
  }

  private async batchUpdateDocument(input: any): Promise<{ data: any }> {
    const encodedDocumentId = encodeURIComponent(input.documentId);
    const data = await fetchJson(
      `${DOCS_API_ROOT}/documents/${encodedDocumentId}:batchUpdate`,
      {
        method: "POST",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input.requestBody),
      },
    );
    return { data };
  }
}

export class GoogleDocsPublisher {
  private readonly clientFactory?: GoogleClientFactory;

  constructor(clientFactory?: GoogleClientFactory) {
    this.clientFactory = clientFactory;
  }

  async authorizeWithLocalServer(
    settings: GoogleDocsSettings,
    openExternalUrl: (url: string) => Promise<void>,
  ): Promise<string> {
    const normalized = normalizeSettings(settings);
    const config = await loadOAuthConfig(normalized.credentialsPath);

    const authResult = await new Promise<{ code: string; redirectUri: string }>(
      (resolve, reject) => {
        const server = http.createServer();
        let resolved = false;
        let activeRedirectUri = "";

        const finish = (error: Error | null, value?: string): void => {
          if (resolved) {
            return;
          }
          resolved = true;
          server.close();
          if (error) {
            reject(error);
            return;
          }
          resolve({ code: value ?? "", redirectUri: activeRedirectUri });
        };

        server.on("request", (request, response) => {
          const host = request.headers.host ?? "127.0.0.1";
          const requestUrl = new URL(request.url ?? "/", `http://${host}`);
          const incomingCode = requestUrl.searchParams.get("code");
          const incomingError = requestUrl.searchParams.get("error");

          if (incomingError) {
            response.writeHead(400, { "Content-Type": "text/html" });
            response.end(
              "<p>Google authorization failed. Return to Obsidian.</p>",
            );
            finish(
              new GoogleDocsPublishError(
                `Google authorization failed: ${incomingError}`,
              ),
            );
            return;
          }

          if (!incomingCode) {
            response.writeHead(404, { "Content-Type": "text/plain" });
            response.end("Not found");
            return;
          }

          response.writeHead(200, { "Content-Type": "text/html" });
          response.end(
            "<p>Google authorization complete. You can close this tab and return to Obsidian.</p>",
          );
          finish(null, incomingCode);
        });

        server.on("error", (error) => {
          finish(error);
        });

        server.listen(0, "127.0.0.1", () => {
          const address = server.address() as AddressInfo;
          const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
          activeRedirectUri = redirectUri;
          const authUrl = makeAuthUrl(config, redirectUri);

          void openExternalUrl(authUrl).catch((error: unknown) => {
            const detail =
              error instanceof Error ? error.message : String(error);
            finish(
              new GoogleDocsPublishError(
                `Could not open Google authorization URL: ${detail}`,
              ),
            );
          });
        });
      },
    );

    const redirectConfig = await loadOAuthConfig(normalized.credentialsPath);
    return exchangeCodeForRefreshToken(
      redirectConfig,
      authResult.code,
      authResult.redirectUri,
    );
  }

  async publish(input: GoogleDocsPublishInput): Promise<GoogleDocsPublishResult> {
    const settings = normalizeSettings(input.settings);
    if (!settings.docsFolderId) {
      throw new GoogleDocsPublishError("Google Docs folder ID is not configured.");
    }
    if (!settings.refreshToken) {
      throw new GoogleDocsPublishError(
        "Google Docs is not authorized. Authorize it in Vault Publisher settings.",
      );
    }

    const clients = await this.createClients(settings);
    const warnings = [...input.missingMedia.map((media) => media.message)];

    const mediaRootId =
      settings.mediaFolderId ??
      (await this.createFolder(
        clients.drive,
        DEFAULT_MEDIA_FOLDER_NAME,
        settings.docsFolderId,
      ));
    const nextSettings: GoogleDocsSettings = {
      ...settings,
      mediaFolderId: mediaRootId,
    };

    const assetFolderId =
      input.previousRecord?.assetFolderId ??
      (await this.createFolder(
        clients.drive,
        `${sanitizeDriveName(input.title)} assets`,
        mediaRootId,
      ));

    const assetRecords: GoogleDocsAssetRecord[] = [];
    const replacements = new Map<string, MediaReplacement>();
    const previousAssets = new Map(
      (input.previousRecord?.assets ?? []).map((asset) => [
        normalizeVaultPath(asset.vaultPath),
        asset,
      ]),
    );

    for (const upload of input.mediaUploads) {
      const previous = previousAssets.get(normalizeVaultPath(upload.vaultPath));
      try {
        const asset = await this.uploadAsset(
          clients.drive,
          upload,
          assetFolderId,
          previous,
        );
        assetRecords.push(asset);
        replacements.set(upload.marker, {
          marker: upload.marker,
          original: upload.original,
          kind: upload.kind,
          inlineSupported: upload.inlineSupported,
          asset,
        });
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        warnings.push(`Could not upload ${upload.original}: ${detail}`);
        replacements.set(upload.marker, {
          marker: upload.marker,
          original: upload.original,
          kind: upload.kind,
          inlineSupported: false,
          warning: detail,
        });
      }
    }

    for (const missing of input.missingMedia) {
      replacements.set(missing.marker, {
        marker: missing.marker,
        original: missing.original,
        kind: "other",
        inlineSupported: false,
        warning: missing.message,
      });
    }

    if (input.previousRecord?.docId) {
      await this.clearDocumentBody(clients.docs, input.previousRecord.docId);
    }

    const doc = await this.createOrUpdateDoc(clients.drive, {
      docId: input.previousRecord?.docId,
      title: input.title,
      html: input.html,
      parentFolderId: settings.docsFolderId,
    });
    await this.ensureAnyoneReader(clients.drive, doc.id);

    const spacingWarning = await this.applyDocumentSpacing(
      clients.docs,
      doc.id,
    );
    if (spacingWarning) {
      warnings.push(spacingWarning);
    }

    const codeBlockWarnings = await this.patchCodeBlocks(clients.docs, doc.id);
    warnings.push(...codeBlockWarnings);

    const patchWarnings = await this.patchMediaPlaceholders(
      clients.docs,
      doc.id,
      Array.from(replacements.values()),
    );
    warnings.push(...patchWarnings);

    await this.trashRemovedAssets(
      clients.drive,
      input.previousRecord?.assets ?? [],
      assetRecords,
    );

    const nowIso = new Date().toISOString();
    return {
      settings: nextSettings,
      status: input.previousRecord ? "updated" : "created",
      warnings,
      record: {
        vaultPath: normalizeVaultPath(input.vaultPath),
        docId: doc.id,
        docUrl: doc.webViewLink ?? fallbackDocUrl(doc.id),
        assetFolderId,
        lastUploaded: nowIso,
        assets: assetRecords,
      },
    };
  }

  private async createClients(
    settings: GoogleDocsSettings,
  ): Promise<GoogleClientBundle> {
    if (this.clientFactory) {
      return this.clientFactory(settings);
    }

    const config = await loadOAuthConfig(settings.credentialsPath);
    const accessToken = await refreshAccessToken(
      config,
      settings.refreshToken ?? "",
    );
    return {
      drive: new GoogleDriveRestClient(accessToken),
      docs: new GoogleDocsRestClient(accessToken),
    };
  }

  private async createFolder(
    drive: any,
    name: string,
    parentFolderId: string,
  ): Promise<string> {
    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType: GOOGLE_FOLDER_MIME,
        parents: [parentFolderId],
      },
      fields: "id",
    });
    const id = asString(response.data.id);
    if (!id) {
      throw new GoogleDocsPublishError(`Could not create Drive folder ${name}.`);
    }
    return id;
  }

  private async createOrUpdateDoc(
    drive: any,
    input: {
      docId?: string;
      title: string;
      html: string;
      parentFolderId: string;
    },
  ): Promise<{ id: string; webViewLink?: string }> {
    const media = {
      mimeType: "text/html",
      body: Buffer.from(input.html, "utf8"),
    };

    const requestBody = {
      name: sanitizeDriveName(input.title) || "Untitled",
      mimeType: GOOGLE_DOC_MIME,
      parents: input.docId ? undefined : [input.parentFolderId],
    };

    const response = input.docId
      ? await drive.files.update({
          fileId: input.docId,
          requestBody,
          media,
          fields: "id,webViewLink",
        })
      : await drive.files.create({
          requestBody,
          media,
          fields: "id,webViewLink",
        });

    const id = asString(response.data.id);
    if (!id) {
      throw new GoogleDocsPublishError("Google Drive did not return a doc ID.");
    }
    return {
      id,
      webViewLink: asString(response.data.webViewLink) || undefined,
    };
  }

  private async uploadAsset(
    drive: any,
    upload: GoogleDocsMediaUpload,
    assetFolderId: string,
    previous?: GoogleDocsAssetRecord,
  ): Promise<GoogleDocsAssetRecord> {
    let fileId = previous?.fileId;
    if (fileId && previous?.checksum === upload.checksum) {
      try {
        const existing = await this.getDriveFile(drive, fileId);
        await this.ensureAnyoneReader(drive, fileId);
        return this.toAssetRecord(upload, existing, fileId);
      } catch (error: unknown) {
        if (!isMissingFileError(error)) {
          throw error;
        }
        fileId = undefined;
      }
    }

    const media = {
      mimeType: upload.mimeType,
      body: upload.bytes,
    };

    const requestBody = {
      name: sanitizeDriveName(upload.name) || "media",
      mimeType: upload.mimeType,
      parents: fileId ? undefined : [assetFolderId],
    };

    const response = fileId
      ? await drive.files.update({
          fileId,
          requestBody,
          media,
          fields: "id,name,mimeType,webViewLink,webContentLink",
        })
      : await drive.files.create({
          requestBody,
          media,
          fields: "id,name,mimeType,webViewLink,webContentLink",
        });

    fileId = asString(response.data.id);
    if (!fileId) {
      throw new GoogleDocsPublishError(
        `Google Drive did not return an asset ID for ${upload.name}.`,
      );
    }

    await this.ensureAnyoneReader(drive, fileId);
    const file = await this.getDriveFile(drive, fileId);
    return this.toAssetRecord(upload, file, fileId);
  }

  private async getDriveFile(drive: any, fileId: string): Promise<any> {
    const response = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,webViewLink,webContentLink",
    });
    return response.data;
  }

  private toAssetRecord(
    upload: GoogleDocsMediaUpload,
    file: any,
    fileId: string,
  ): GoogleDocsAssetRecord {
    return {
      vaultPath: normalizeVaultPath(upload.vaultPath),
      fileId,
      name: asString(file.name) || upload.name,
      mimeType: asString(file.mimeType) || upload.mimeType,
      checksum: upload.checksum,
      kind: upload.kind,
      webViewLink: asString(file.webViewLink) || fallbackDriveUrl(fileId),
      webContentLink: asString(file.webContentLink) || undefined,
      lastUploaded: new Date().toISOString(),
    };
  }

  private async ensureAnyoneReader(drive: any, fileId: string): Promise<void> {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          type: "anyone",
          role: "reader",
        },
        fields: "id",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        getErrorStatus(error) !== 409 &&
        !message.includes("already exists") &&
        !message.includes("duplicate")
      ) {
        throw error;
      }
    }
  }

  private async patchCodeBlocks(
    docs: any,
    documentId: string,
  ): Promise<string[]> {
    const warnings: string[] = [];

    try {
      const document = await docs.documents.get({
        documentId,
        fields:
          "body(content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content))),table(tableRows(tableCells(content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content)))))))))",
      });
      const paragraphs = this.collectParagraphTexts(document.data);
      const patches = this.findCodeBlockPatches(paragraphs, warnings);
      if (patches.length === 0) {
        return warnings;
      }

      const requests: any[] = [];
      for (const patch of patches) {
        requests.push({
          updateParagraphStyle: {
            range: patch.styleRange,
            paragraphStyle: {
              shading: {
                backgroundColor: {
                  color: {
                    rgbColor: GOOGLE_DOCS_CODE_BLOCK_BACKGROUND,
                  },
                },
              },
            },
            fields: "shading",
          },
        });
      }

      const deletionRanges = patches
        .flatMap((patch) => patch.deletionRanges)
        .filter((range) => range.endIndex > range.startIndex)
        .sort((left, right) => right.startIndex - left.startIndex);
      for (const range of deletionRanges) {
        requests.push({ deleteContentRange: { range } });
      }

      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      warnings.push(`Could not apply Google Docs code block styling: ${detail}`);
    }

    return warnings;
  }

  private collectParagraphTexts(document: any): ParagraphText[] {
    const paragraphs: ParagraphText[] = [];

    const scanContent = (content: any[]): void => {
      for (const element of content ?? []) {
        const paragraph = element.paragraph;
        if (
          paragraph &&
          typeof element.startIndex === "number" &&
          typeof element.endIndex === "number"
        ) {
          let text = "";
          const runs: ParagraphTextRun[] = [];
          for (const paragraphElement of paragraph.elements ?? []) {
            const content = paragraphElement.textRun?.content;
            const startIndex = paragraphElement.startIndex;
            if (typeof content !== "string" || typeof startIndex !== "number") {
              continue;
            }
            const offsetStart = text.length;
            text += content;
            runs.push({
              offsetStart,
              offsetEnd: text.length,
              startIndex,
            });
          }

          paragraphs.push({
            startIndex: element.startIndex,
            endIndex: element.endIndex,
            text,
            runs,
          });
        }

        if (Array.isArray(element.table?.tableRows)) {
          for (const row of element.table.tableRows) {
            for (const cell of row.tableCells ?? []) {
              scanContent(cell.content ?? []);
            }
          }
        }
      }
    };

    scanContent(document.body?.content ?? []);
    return paragraphs.sort((left, right) => left.startIndex - right.startIndex);
  }

  private findCodeBlockPatches(
    paragraphs: ParagraphText[],
    warnings: string[],
  ): CodeBlockPatch[] {
    const markers: CodeBlockMarker[] = [];
    for (const paragraph of paragraphs) {
      GOOGLE_DOCS_CODE_BLOCK_MARKER.lastIndex = 0;
      let match = GOOGLE_DOCS_CODE_BLOCK_MARKER.exec(paragraph.text);
      while (match) {
        markers.push({
          blockIndex: Number(match[1]),
          type: match[2] as "START" | "END",
          marker: match[0],
          offset: match.index,
          paragraph,
        });
        match = GOOGLE_DOCS_CODE_BLOCK_MARKER.exec(paragraph.text);
      }
    }

    const starts = new Map<number, CodeBlockMarker>();
    const patches: CodeBlockPatch[] = [];
    for (const marker of markers) {
      if (marker.type === "START") {
        starts.set(marker.blockIndex, marker);
        continue;
      }

      const start = starts.get(marker.blockIndex);
      if (!start) {
        warnings.push(
          `Could not find start marker for code block ${marker.blockIndex}.`,
        );
        continue;
      }
      starts.delete(marker.blockIndex);

      const styleStart = start.paragraph.startIndex;
      const styleEnd = Math.max(styleStart, marker.paragraph.endIndex - 1);
      patches.push({
        styleRange: { startIndex: styleStart, endIndex: styleEnd },
        deletionRanges: [
          this.codeBlockMarkerDeletionRange(start),
          this.codeBlockMarkerDeletionRange(marker),
        ],
      });
    }

    for (const blockIndex of starts.keys()) {
      warnings.push(`Could not find end marker for code block ${blockIndex}.`);
    }

    return patches;
  }

  private codeBlockMarkerDeletionRange(marker: CodeBlockMarker): TextRange {
    const paragraph = marker.paragraph;
    let startOffset = marker.offset;
    let endOffset = marker.offset + marker.marker.length;

    if (marker.type === "START") {
      endOffset = this.includeFollowingLineBreak(paragraph.text, endOffset);
    } else {
      startOffset = this.includePrecedingLineBreak(paragraph.text, startOffset);
    }

    return {
      startIndex: this.paragraphOffsetToDocumentIndex(paragraph, startOffset),
      endIndex: this.paragraphOffsetToDocumentIndex(paragraph, endOffset),
    };
  }

  private includeFollowingLineBreak(text: string, offset: number): number {
    if (text[offset] === "\r" && text[offset + 1] === "\n") {
      return offset + 2;
    }
    if (
      text[offset] === "\n" ||
      text[offset] === "\r" ||
      text[offset] === "\v"
    ) {
      return offset + 1;
    }
    return offset;
  }

  private includePrecedingLineBreak(text: string, offset: number): number {
    if (text[offset - 2] === "\r" && text[offset - 1] === "\n") {
      return offset - 2;
    }
    if (
      text[offset - 1] === "\n" ||
      text[offset - 1] === "\r" ||
      text[offset - 1] === "\v"
    ) {
      return offset - 1;
    }
    return offset;
  }

  private paragraphOffsetToDocumentIndex(
    paragraph: ParagraphText,
    offset: number,
  ): number {
    for (const run of paragraph.runs) {
      if (offset >= run.offsetStart && offset <= run.offsetEnd) {
        return run.startIndex + offset - run.offsetStart;
      }
    }
    return Math.max(paragraph.startIndex, paragraph.endIndex - 1);
  }

  private async clearDocumentBody(
    docs: any,
    documentId: string,
  ): Promise<void> {
    const document = await docs.documents.get({
      documentId,
      fields: "body(content(endIndex))",
    });
    const { bodyEndIndex } = this.collectDocumentParagraphRanges(document.data);
    if (!bodyEndIndex || bodyEndIndex <= 2) {
      return;
    }

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            deleteContentRange: {
              range: { startIndex: 1, endIndex: bodyEndIndex - 1 },
            },
          },
        ],
      },
    });
  }

  private async applyDocumentSpacing(
    docs: any,
    documentId: string,
  ): Promise<string | null> {
    try {
      const document = await docs.documents.get({
        documentId,
        fields: "body(content(startIndex,endIndex,paragraph(paragraphStyle),table(tableRows(tableCells(content(startIndex,endIndex,paragraph(paragraphStyle)))))))",
      });
      const { bodyEndIndex, headingRanges } =
        this.collectDocumentParagraphRanges(document.data);
      if (!bodyEndIndex || bodyEndIndex <= 2) {
        return null;
      }

      const requests: any[] = [
        {
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: bodyEndIndex - 1 },
            paragraphStyle: {
              spaceBelow: {
                magnitude: GOOGLE_DOCS_PARAGRAPH_SPACE_AFTER_PT,
                unit: "PT",
              },
            },
            fields: "spaceBelow",
          },
        },
      ];
      for (const range of headingRanges) {
        requests.push({
          updateParagraphStyle: {
            range,
            paragraphStyle: {
              spaceAbove: {
                magnitude: GOOGLE_DOCS_HEADING_SPACE_ABOVE_PT,
                unit: "PT",
              },
            },
            fields: "spaceAbove",
          },
        });
      }

      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });
      return null;
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      return `Could not apply Google Docs document spacing: ${detail}`;
    }
  }

  private collectDocumentParagraphRanges(document: any): {
    bodyEndIndex?: number;
    headingRanges: TextRange[];
  } {
    let endIndex = 0;
    const headingRanges: TextRange[] = [];

    const scanContent = (content: any[]): void => {
      for (const element of content ?? []) {
        if (typeof element.endIndex === "number") {
          endIndex = Math.max(endIndex, element.endIndex);
        }

        const namedStyleType = element.paragraph?.paragraphStyle?.namedStyleType;
        if (
          typeof element.startIndex === "number" &&
          typeof element.endIndex === "number" &&
          element.endIndex > element.startIndex &&
          isGoogleDocsHeadingStyle(namedStyleType)
        ) {
          headingRanges.push({
            startIndex: element.startIndex,
            endIndex: Math.max(element.startIndex, element.endIndex - 1),
          });
        }

        if (Array.isArray(element.table?.tableRows)) {
          for (const row of element.table.tableRows) {
            for (const cell of row.tableCells ?? []) {
              scanContent(cell.content ?? []);
            }
          }
        }
      }
    };

    scanContent(document.body?.content ?? []);
    return {
      bodyEndIndex: endIndex || undefined,
      headingRanges,
    };
  }

  private async patchMediaPlaceholders(
    docs: any,
    documentId: string,
    replacements: MediaReplacement[],
  ): Promise<string[]> {
    const warnings: string[] = [];
    if (replacements.length === 0) {
      return warnings;
    }

    const document = await docs.documents.get({ documentId });
    const found = this.findMarkerRanges(document.data, replacements);

    for (const replacement of found.sort(
      (left, right) => right.range.startIndex - left.range.startIndex,
    )) {
      const warning = await this.patchSinglePlaceholder(
        docs,
        documentId,
        replacement.range,
        replacement.replacement,
      );
      if (warning) {
        warnings.push(warning);
      }
    }

    const foundMarkers = new Set(found.map((entry) => entry.replacement.marker));
    for (const replacement of replacements) {
      if (!foundMarkers.has(replacement.marker)) {
        warnings.push(`Could not find placeholder for ${replacement.original}.`);
      }
    }

    return warnings;
  }

  private findMarkerRanges(
    document: any,
    replacements: MediaReplacement[],
  ): Array<{ replacement: MediaReplacement; range: TextRange }> {
    const byMarker = new Map(replacements.map((item) => [item.marker, item]));
    const ranges: Array<{ replacement: MediaReplacement; range: TextRange }> =
      [];

    const scanElements = (elements: any[]): void => {
      for (const element of elements ?? []) {
        const paragraphElements = element.paragraph?.elements;
        if (Array.isArray(paragraphElements)) {
          for (const paragraphElement of paragraphElements) {
            const content = paragraphElement.textRun?.content;
            const startIndex = paragraphElement.startIndex;
            if (typeof content !== "string" || typeof startIndex !== "number") {
              continue;
            }

            for (const [marker, replacement] of byMarker) {
              let index = content.indexOf(marker);
              while (index >= 0) {
                ranges.push({
                  replacement,
                  range: {
                    startIndex: startIndex + index,
                    endIndex: startIndex + index + marker.length,
                  },
                });
                index = content.indexOf(marker, index + marker.length);
              }
            }
          }
        }

        if (Array.isArray(element.table?.tableRows)) {
          for (const row of element.table.tableRows) {
            for (const cell of row.tableCells ?? []) {
              scanElements(cell.content ?? []);
            }
          }
        }
      }
    };

    scanElements(document.body?.content ?? []);
    return ranges;
  }

  private async patchSinglePlaceholder(
    docs: any,
    documentId: string,
    range: TextRange,
    replacement: MediaReplacement,
  ): Promise<string | null> {
    const imageUri = replacement.asset?.webContentLink;
    const viewLink = replacement.asset?.webViewLink;

    if (
      replacement.kind === "image" &&
      replacement.inlineSupported &&
      imageUri
    ) {
      try {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [
              { deleteContentRange: { range } },
              {
                insertInlineImage: {
                  uri: imageUri,
                  location: { index: range.startIndex },
                },
              },
            ],
          },
        });
        return null;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.insertFallbackText(docs, documentId, range, replacement);
        return `Could not inline ${replacement.original}: ${detail}`;
      }
    }

    if (replacement.kind === "video" && viewLink) {
      try {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [
              { deleteContentRange: { range } },
              {
                insertRichLink: {
                  richLinkProperties: {
                    uri: viewLink,
                  },
                  location: { index: range.startIndex },
                },
              },
            ],
          },
        });
        return null;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.insertFallbackText(docs, documentId, range, replacement);
        return `Could not insert video link for ${replacement.original}: ${detail}`;
      }
    }

    await this.insertFallbackText(docs, documentId, range, replacement);
    return replacement.warning ?? null;
  }

  private async insertFallbackText(
    docs: any,
    documentId: string,
    range: TextRange,
    replacement: MediaReplacement,
  ): Promise<void> {
    const link = replacement.asset?.webViewLink;
    const text = link
      ? `${replacement.original} ${link}`
      : replacement.original;
    const textEnd = range.startIndex + text.length;
    const textStyle: Record<string, unknown> = {
      italic: true,
      foregroundColor: {
        color: {
          rgbColor: {
            red: 0.45,
            green: 0.45,
            blue: 0.45,
          },
        },
      },
    };
    let fields = "italic,foregroundColor";
    if (link) {
      textStyle.link = { url: link };
      fields += ",link";
    }

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          { deleteContentRange: { range } },
          { insertText: { location: { index: range.startIndex }, text } },
          {
            updateTextStyle: {
              range: { startIndex: range.startIndex, endIndex: textEnd },
              textStyle,
              fields,
            },
          },
        ],
      },
    });
  }

  private async trashRemovedAssets(
    drive: any,
    previousAssets: GoogleDocsAssetRecord[],
    nextAssets: GoogleDocsAssetRecord[],
  ): Promise<void> {
    const nextIds = new Set(nextAssets.map((asset) => asset.fileId));
    const removed = previousAssets.filter((asset) => !nextIds.has(asset.fileId));
    await Promise.all(
      removed.map(async (asset) => {
        try {
          await drive.files.update({
            fileId: asset.fileId,
            requestBody: { trashed: true },
            fields: "id",
          });
        } catch {
          // Best effort cleanup; stale Drive files should not block publishing.
        }
      }),
    );
  }
}
