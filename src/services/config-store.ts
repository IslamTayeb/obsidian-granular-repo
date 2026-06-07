import { Plugin } from "obsidian";

import {
  GoogleDocsAssetRecord,
  GoogleDocsPublishRecord,
  GoogleDocsSettings,
  LegacyPublishedDirRecord,
  PublishedTargetRecord,
  PublishTargetType,
  StaticSiteHostConfig,
  StaticSitePublishRecord,
  VaultPublisherData,
} from "../types";
import { normalizeVaultPath } from "../utils/path-utils";

const DEFAULT_DATA: VaultPublisherData = {
  publishedTargets: [],
  staticSiteHosts: [],
  staticSitePublishes: [],
  googleDocs: {},
  googleDocsPublishes: [],
};

type LegacyDataShape = {
  publishedDirs?: unknown;
};

function isLegacyRecord(value: unknown): value is LegacyPublishedDirRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LegacyPublishedDirRecord>;
  return (
    typeof candidate.vaultPath === "string" &&
    typeof candidate.repoName === "string" &&
    (candidate.visibility === "public" || candidate.visibility === "private") &&
    typeof candidate.lastPushed === "string"
  );
}

function isTargetType(value: unknown): value is PublishTargetType {
  return value === "directory" || value === "file";
}

function isValidTargetRecord(value: unknown): value is PublishedTargetRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PublishedTargetRecord>;
  if (
    !isTargetType(candidate.targetType) ||
    typeof candidate.vaultPath !== "string" ||
    typeof candidate.repoName !== "string" ||
    (candidate.visibility !== "public" && candidate.visibility !== "private") ||
    typeof candidate.lastPushed !== "string"
  ) {
    return false;
  }

  if (
    candidate.originUrl !== undefined &&
    typeof candidate.originUrl !== "string"
  ) {
    return false;
  }

  if (candidate.targetType === "file") {
    return (
      typeof candidate.mirrorPath === "string" &&
      candidate.mirrorPath.length > 0 &&
      typeof candidate.mirrorFileName === "string" &&
      candidate.mirrorFileName.length > 0
    );
  }

  return true;
}

function normalizeTargetRecord(
  record: PublishedTargetRecord,
): PublishedTargetRecord {
  return {
    ...record,
    targetType: record.targetType,
    vaultPath: normalizeVaultPath(record.vaultPath),
    remote: "origin",
    originUrl:
      typeof record.originUrl === "string" && record.originUrl.length > 0
        ? record.originUrl
        : undefined,
    mirrorPath:
      record.targetType === "file"
        ? normalizeVaultPath(record.mirrorPath ?? "")
        : undefined,
    mirrorFileName:
      record.targetType === "file" ? record.mirrorFileName : undefined,
  };
}

function legacyToTargetRecord(
  record: LegacyPublishedDirRecord,
): PublishedTargetRecord {
  return {
    targetType: "directory",
    vaultPath: normalizeVaultPath(record.vaultPath),
    repoName: record.repoName,
    remote: "origin",
    visibility: record.visibility,
    lastPushed: record.lastPushed,
  };
}

function isStringField(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isValidStaticSiteHost(value: unknown): value is StaticSiteHostConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StaticSiteHostConfig>;
  if (
    !isStringField(candidate.id) ||
    !isStringField(candidate.name) ||
    !isStringField(candidate.repoRoot) ||
    !isStringField(candidate.siteSubdir) ||
    !isStringField(candidate.postPathTemplate) ||
    !isStringField(candidate.templateRelPath) ||
    !isStringField(candidate.contentMarker) ||
    !isStringField(candidate.commitMessagePublish) ||
    !isStringField(candidate.commitMessageUnpublish) ||
    !isStringField(candidate.remote)
  ) {
    return false;
  }

  const tokens = candidate.tokens;
  if (!tokens || typeof tokens !== "object") {
    return false;
  }

  return (
    isStringField(tokens.title) &&
    isStringField(tokens.slug) &&
    isStringField(tokens.description) &&
    isStringField(tokens.dateIso) &&
    isStringField(tokens.dateDisplay)
  );
}

function isValidPublishRecord(
  value: unknown,
): value is StaticSitePublishRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StaticSitePublishRecord>;
  return (
    isStringField(candidate.hostId) &&
    isStringField(candidate.vaultPath) &&
    isStringField(candidate.slug) &&
    isStringField(candidate.lastPublished)
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function normalizeGoogleDocsSettings(
  value: unknown,
): GoogleDocsSettings {
  if (!value || typeof value !== "object") {
    return {};
  }

  const candidate = value as Partial<GoogleDocsSettings>;
  return {
    credentialsPath: optionalString(candidate.credentialsPath),
    refreshToken: optionalString(candidate.refreshToken),
    docsFolderId: optionalString(candidate.docsFolderId),
    mediaFolderId: optionalString(candidate.mediaFolderId),
  };
}

function isValidGoogleDocsAsset(
  value: unknown,
): value is GoogleDocsAssetRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GoogleDocsAssetRecord>;
  return (
    isStringField(candidate.vaultPath) &&
    isStringField(candidate.fileId) &&
    isStringField(candidate.name) &&
    isStringField(candidate.mimeType) &&
    isStringField(candidate.checksum) &&
    (candidate.kind === "image" ||
      candidate.kind === "video" ||
      candidate.kind === "other") &&
    isStringField(candidate.lastUploaded)
  );
}

function normalizeGoogleDocsAsset(
  record: GoogleDocsAssetRecord,
): GoogleDocsAssetRecord {
  return {
    ...record,
    vaultPath: normalizeVaultPath(record.vaultPath),
    webViewLink: optionalString(record.webViewLink),
    webContentLink: optionalString(record.webContentLink),
  };
}

function isValidGoogleDocsPublish(
  value: unknown,
): value is GoogleDocsPublishRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GoogleDocsPublishRecord>;
  return (
    isStringField(candidate.vaultPath) &&
    isStringField(candidate.docId) &&
    isStringField(candidate.docUrl) &&
    isStringField(candidate.assetFolderId) &&
    isStringField(candidate.lastUploaded) &&
    Array.isArray(candidate.assets)
  );
}

function normalizeGoogleDocsPublish(
  record: GoogleDocsPublishRecord,
): GoogleDocsPublishRecord {
  return {
    ...record,
    vaultPath: normalizeVaultPath(record.vaultPath),
    assets: record.assets
      .filter(isValidGoogleDocsAsset)
      .map((asset) => normalizeGoogleDocsAsset(asset)),
  };
}

export class ConfigStore {
  private readonly plugin: Plugin;

  private data: VaultPublisherData = {
    publishedTargets: [],
    staticSiteHosts: [],
    staticSitePublishes: [],
    googleDocs: {},
    googleDocsPublishes: [],
  };

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  async load(): Promise<void> {
    const loaded = await this.plugin.loadData();
    if (!loaded || typeof loaded !== "object") {
      this.data = {
        publishedTargets: [],
        staticSiteHosts: [],
        staticSitePublishes: [],
        googleDocs: {},
        googleDocsPublishes: [],
      };
      return;
    }

    const candidate = loaded as Partial<VaultPublisherData> & LegacyDataShape;
    let migrated = false;

    let records: PublishedTargetRecord[] = [];
    if (Array.isArray(candidate.publishedTargets)) {
      records = candidate.publishedTargets
        .filter(isValidTargetRecord)
        .map((record) => normalizeTargetRecord(record));
    } else if (Array.isArray(candidate.publishedDirs)) {
      records = candidate.publishedDirs
        .filter(isLegacyRecord)
        .map((record) => legacyToTargetRecord(record));
      migrated = true;
    }

    const staticSiteHosts = Array.isArray(candidate.staticSiteHosts)
      ? candidate.staticSiteHosts.filter(isValidStaticSiteHost)
      : [];

    const staticSitePublishes = Array.isArray(candidate.staticSitePublishes)
      ? candidate.staticSitePublishes
          .filter(isValidPublishRecord)
          .map((record) => ({
            ...record,
            vaultPath: normalizeVaultPath(record.vaultPath),
          }))
      : [];

    const googleDocs = normalizeGoogleDocsSettings(candidate.googleDocs);
    const googleDocsPublishes = Array.isArray(candidate.googleDocsPublishes)
      ? candidate.googleDocsPublishes
          .filter(isValidGoogleDocsPublish)
          .map((record) => normalizeGoogleDocsPublish(record))
      : [];

    this.data = {
      publishedTargets: records,
      staticSiteHosts,
      staticSitePublishes,
      googleDocs,
      googleDocsPublishes,
    };

    if (migrated) {
      await this.save();
    }
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.data);
  }

  getAllTargets(): PublishedTargetRecord[] {
    return [...this.data.publishedTargets];
  }

  getTargetsByType(targetType: PublishTargetType): PublishedTargetRecord[] {
    return this.data.publishedTargets.filter(
      (record) => record.targetType === targetType,
    );
  }

  findTarget(
    targetType: PublishTargetType,
    vaultPath: string,
  ): PublishedTargetRecord | undefined {
    const normalized = normalizeVaultPath(vaultPath);
    return this.data.publishedTargets.find(
      (record) =>
        record.targetType === targetType && record.vaultPath === normalized,
    );
  }

  upsertTarget(record: PublishedTargetRecord): void {
    const normalized = normalizeTargetRecord(record);
    const existingIndex = this.data.publishedTargets.findIndex(
      (entry) =>
        entry.targetType === normalized.targetType &&
        entry.vaultPath === normalized.vaultPath,
    );

    if (existingIndex >= 0) {
      this.data.publishedTargets[existingIndex] = normalized;
      return;
    }

    this.data.publishedTargets.push(normalized);
  }

  removeTarget(targetType: PublishTargetType, vaultPath: string): boolean {
    const normalized = normalizeVaultPath(vaultPath);
    const initialLength = this.data.publishedTargets.length;
    this.data.publishedTargets = this.data.publishedTargets.filter(
      (record) =>
        !(record.targetType === targetType && record.vaultPath === normalized),
    );
    return this.data.publishedTargets.length !== initialLength;
  }

  getStaticSiteHosts(): StaticSiteHostConfig[] {
    return [...(this.data.staticSiteHosts ?? [])];
  }

  findStaticSiteHost(hostId: string): StaticSiteHostConfig | undefined {
    return (this.data.staticSiteHosts ?? []).find((host) => host.id === hostId);
  }

  upsertStaticSiteHost(host: StaticSiteHostConfig): void {
    const hosts = this.data.staticSiteHosts ?? [];
    const existingIndex = hosts.findIndex((entry) => entry.id === host.id);
    if (existingIndex >= 0) {
      hosts[existingIndex] = host;
    } else {
      hosts.push(host);
    }
    this.data.staticSiteHosts = hosts;
  }

  removeStaticSiteHost(hostId: string): boolean {
    const hosts = this.data.staticSiteHosts ?? [];
    const initialLength = hosts.length;
    this.data.staticSiteHosts = hosts.filter((entry) => entry.id !== hostId);
    return (this.data.staticSiteHosts?.length ?? 0) !== initialLength;
  }

  getStaticSitePublishes(): StaticSitePublishRecord[] {
    return [...(this.data.staticSitePublishes ?? [])];
  }

  getStaticSitePublishesByHost(hostId: string): StaticSitePublishRecord[] {
    return (this.data.staticSitePublishes ?? []).filter(
      (record) => record.hostId === hostId,
    );
  }

  findStaticSitePublish(
    hostId: string,
    vaultPath: string,
  ): StaticSitePublishRecord | undefined {
    const normalized = normalizeVaultPath(vaultPath);
    return (this.data.staticSitePublishes ?? []).find(
      (record) => record.hostId === hostId && record.vaultPath === normalized,
    );
  }

  upsertStaticSitePublish(record: StaticSitePublishRecord): void {
    const normalized: StaticSitePublishRecord = {
      ...record,
      vaultPath: normalizeVaultPath(record.vaultPath),
    };
    const publishes = this.data.staticSitePublishes ?? [];
    const existingIndex = publishes.findIndex(
      (entry) =>
        entry.hostId === normalized.hostId &&
        entry.vaultPath === normalized.vaultPath,
    );

    if (existingIndex >= 0) {
      publishes[existingIndex] = normalized;
    } else {
      publishes.push(normalized);
    }
    this.data.staticSitePublishes = publishes;
  }

  removeStaticSitePublish(hostId: string, vaultPath: string): boolean {
    const normalized = normalizeVaultPath(vaultPath);
    const publishes = this.data.staticSitePublishes ?? [];
    const initialLength = publishes.length;
    this.data.staticSitePublishes = publishes.filter(
      (entry) => !(entry.hostId === hostId && entry.vaultPath === normalized),
    );
    return (this.data.staticSitePublishes?.length ?? 0) !== initialLength;
  }

  getGoogleDocsSettings(): GoogleDocsSettings {
    return { ...(this.data.googleDocs ?? {}) };
  }

  updateGoogleDocsSettings(settings: GoogleDocsSettings): void {
    this.data.googleDocs = normalizeGoogleDocsSettings({
      ...(this.data.googleDocs ?? {}),
      ...settings,
    });
  }

  clearGoogleDocsRefreshToken(): void {
    this.data.googleDocs = {
      ...(this.data.googleDocs ?? {}),
      refreshToken: undefined,
    };
  }

  getGoogleDocsPublishes(): GoogleDocsPublishRecord[] {
    return [...(this.data.googleDocsPublishes ?? [])];
  }

  findGoogleDocsPublish(
    vaultPath: string,
  ): GoogleDocsPublishRecord | undefined {
    const normalized = normalizeVaultPath(vaultPath);
    return (this.data.googleDocsPublishes ?? []).find(
      (record) => record.vaultPath === normalized,
    );
  }

  upsertGoogleDocsPublish(record: GoogleDocsPublishRecord): void {
    const normalized = normalizeGoogleDocsPublish(record);
    const publishes = this.data.googleDocsPublishes ?? [];
    const existingIndex = publishes.findIndex(
      (entry) => entry.vaultPath === normalized.vaultPath,
    );

    if (existingIndex >= 0) {
      publishes[existingIndex] = normalized;
    } else {
      publishes.push(normalized);
    }
    this.data.googleDocsPublishes = publishes;
  }

  removeGoogleDocsPublish(vaultPath: string): boolean {
    const normalized = normalizeVaultPath(vaultPath);
    const publishes = this.data.googleDocsPublishes ?? [];
    const initialLength = publishes.length;
    this.data.googleDocsPublishes = publishes.filter(
      (entry) => entry.vaultPath !== normalized,
    );
    return (this.data.googleDocsPublishes?.length ?? 0) !== initialLength;
  }
}

export const DEFAULT_CONFIG_DATA = DEFAULT_DATA;
