import { Plugin } from "obsidian";

import {
  LegacyPublishedDirRecord,
  PublishedTargetRecord,
  PublishTargetType,
  VaultPublisherData,
} from "../types";
import { normalizeVaultPath } from "../utils/path-utils";

const DEFAULT_DATA: VaultPublisherData = {
  publishedTargets: [],
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

  if (candidate.originUrl !== undefined && typeof candidate.originUrl !== "string") {
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

function normalizeTargetRecord(record: PublishedTargetRecord): PublishedTargetRecord {
  return {
    ...record,
    targetType: record.targetType,
    vaultPath: normalizeVaultPath(record.vaultPath),
    remote: "origin",
    originUrl: typeof record.originUrl === "string" && record.originUrl.length > 0 ? record.originUrl : undefined,
    mirrorPath: record.targetType === "file" ? normalizeVaultPath(record.mirrorPath ?? "") : undefined,
    mirrorFileName: record.targetType === "file" ? record.mirrorFileName : undefined,
  };
}

function legacyToTargetRecord(record: LegacyPublishedDirRecord): PublishedTargetRecord {
  return {
    targetType: "directory",
    vaultPath: normalizeVaultPath(record.vaultPath),
    repoName: record.repoName,
    remote: "origin",
    visibility: record.visibility,
    lastPushed: record.lastPushed,
  };
}

export class ConfigStore {
  private readonly plugin: Plugin;

  private data: VaultPublisherData = { ...DEFAULT_DATA };

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  async load(): Promise<void> {
    const loaded = await this.plugin.loadData();
    if (!loaded || typeof loaded !== "object") {
      this.data = { ...DEFAULT_DATA };
      return;
    }

    const candidate = loaded as Partial<VaultPublisherData> & LegacyDataShape;
    let migrated = false;

    let records: PublishedTargetRecord[] = [];
    if (Array.isArray(candidate.publishedTargets)) {
      records = candidate.publishedTargets.filter(isValidTargetRecord).map((record) => normalizeTargetRecord(record));
    } else if (Array.isArray(candidate.publishedDirs)) {
      records = candidate.publishedDirs.filter(isLegacyRecord).map((record) => legacyToTargetRecord(record));
      migrated = true;
    }

    this.data = {
      publishedTargets: records,
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
    return this.data.publishedTargets.filter((record) => record.targetType === targetType);
  }

  findTarget(targetType: PublishTargetType, vaultPath: string): PublishedTargetRecord | undefined {
    const normalized = normalizeVaultPath(vaultPath);
    return this.data.publishedTargets.find(
      (record) => record.targetType === targetType && record.vaultPath === normalized,
    );
  }

  upsertTarget(record: PublishedTargetRecord): void {
    const normalized = normalizeTargetRecord(record);
    const existingIndex = this.data.publishedTargets.findIndex(
      (entry) => entry.targetType === normalized.targetType && entry.vaultPath === normalized.vaultPath,
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
      (record) => !(record.targetType === targetType && record.vaultPath === normalized),
    );
    return this.data.publishedTargets.length !== initialLength;
  }
}
