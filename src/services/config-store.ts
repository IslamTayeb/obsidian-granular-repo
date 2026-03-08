import { Plugin } from "obsidian";

import { PublishedDirRecord, VaultPublisherData } from "../types";
import { normalizeVaultPath } from "../utils/path-utils";

const DEFAULT_DATA: VaultPublisherData = {
  publishedDirs: [],
};

function normalizeRecord(record: PublishedDirRecord): PublishedDirRecord {
  return {
    ...record,
    vaultPath: normalizeVaultPath(record.vaultPath),
    remote: "origin",
  };
}

function isValidRecord(value: unknown): value is PublishedDirRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PublishedDirRecord>;
  return (
    typeof candidate.vaultPath === "string" &&
    typeof candidate.repoName === "string" &&
    (candidate.visibility === "public" || candidate.visibility === "private") &&
    typeof candidate.lastPushed === "string"
  );
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

    const candidate = loaded as Partial<VaultPublisherData>;
    const records = Array.isArray(candidate.publishedDirs)
      ? candidate.publishedDirs.filter(isValidRecord).map((record) => normalizeRecord(record))
      : [];

    this.data = {
      publishedDirs: records,
    };
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.data);
  }

  getAll(): PublishedDirRecord[] {
    return [...this.data.publishedDirs];
  }

  findByVaultPath(vaultPath: string): PublishedDirRecord | undefined {
    const normalized = normalizeVaultPath(vaultPath);
    return this.data.publishedDirs.find((record) => record.vaultPath === normalized);
  }

  upsert(record: PublishedDirRecord): void {
    const normalized = normalizeRecord(record);
    const existingIndex = this.data.publishedDirs.findIndex(
      (entry) => entry.vaultPath === normalized.vaultPath,
    );

    if (existingIndex >= 0) {
      this.data.publishedDirs[existingIndex] = normalized;
      return;
    }

    this.data.publishedDirs.push(normalized);
  }
}
