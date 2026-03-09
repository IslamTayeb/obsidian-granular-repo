import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

import { App, Notice, Plugin, TFile, TFolder } from "obsidian";

import { DirectoryPickerModal, PublishTargetItem } from "./modals/directory-picker-modal";
import { VisibilityModal } from "./modals/visibility-modal";
import { ConfigStore } from "./services/config-store";
import { GitCommandError, GitService } from "./services/git-service";
import {
  PublishedTargetRecord,
  PublishTargetType,
  PushAllSummary,
  PushRepoResult,
  RepoVisibility,
} from "./types";
import { isGitHubOrigin, originToWebUrl } from "./utils/github-url";
import {
  absolutePathForVaultPath,
  ensureInsideVault,
  fileStemFromVaultPath,
  folderNameFromVaultPath,
  isVaultRoot,
  normalizeVaultPath,
} from "./utils/path-utils";
import { parseRepoNameFromOrigin, sanitizeRepoName } from "./utils/repo-name-utils";

type FileSystemAdapterLike = {
  basePath?: string;
};

type ResolvedPublishTarget = {
  targetType: PublishTargetType;
  vaultPath: string;
};

const MIRROR_ROOT = ".obsidian/plugins/vault-publisher/mirrors";

export default class VaultPublisherPlugin extends Plugin {
  private configStore!: ConfigStore;

  private gitService!: GitService;

  private isRunning = false;

  async onload(): Promise<void> {
    this.configStore = new ConfigStore(this);
    await this.configStore.load();

    this.gitService = new GitService();

    this.addCommand({
      id: "publish-directory",
      name: "Publish Directory to GitHub",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePublishCommand();
        });
      },
    });

    this.addCommand({
      id: "publish-directory-select-target",
      name: "Publish Directory to GitHub (Choose Target)",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePublishCommand({ forcePicker: true });
        });
      },
    });

    this.addCommand({
      id: "push-all-repos",
      name: "Push All Repositories",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePushAllRepositories();
        });
      },
    });
  }

  private async ensurePrerequisites(): Promise<boolean> {
    const status = await this.gitService.checkPrerequisites();
    if (!status.ok) {
      new Notice(status.message ?? "Missing required tools.", 12000);
      return false;
    }

    return true;
  }

  private async executeExclusive(action: () => Promise<void>): Promise<void> {
    if (this.isRunning) {
      new Notice("Vault Publisher is already running.");
      return;
    }

    this.isRunning = true;
    try {
      await action();
    } catch (error: unknown) {
      this.showCommandError(error);
    } finally {
      this.isRunning = false;
    }
  }

  private getVaultBasePath(): string | null {
    const adapter = this.app.vault.adapter as FileSystemAdapterLike;
    if (typeof adapter.basePath === "string" && adapter.basePath.length > 0) {
      return adapter.basePath;
    }

    return null;
  }

  private isSelectableDirectory(vaultPath: string): boolean {
    const normalized = normalizeVaultPath(vaultPath);
    if (!normalized) {
      return false;
    }

    const segments = normalized.split("/");
    if (segments.some((segment) => segment.startsWith("."))) {
      return false;
    }

    if (segments.includes("node_modules")) {
      return false;
    }

    return true;
  }

  private isSelectableFile(vaultPath: string): boolean {
    const normalized = normalizeVaultPath(vaultPath);
    if (!normalized) {
      return false;
    }

    const segments = normalized.split("/");
    if (segments.some((segment) => segment.startsWith("."))) {
      return false;
    }

    if (segments.includes("node_modules")) {
      return false;
    }

    return true;
  }

  private getActiveDefaultTarget(): ResolvedPublishTarget | undefined {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      const activeFilePath = normalizeVaultPath(activeFile.path);
      if (this.isSelectableFile(activeFilePath)) {
        return {
          targetType: "file",
          vaultPath: activeFilePath,
        };
      }
    }

    const activeParent = normalizeVaultPath(activeFile?.parent?.path ?? "");
    if (activeParent && this.isSelectableDirectory(activeParent)) {
      return {
        targetType: "directory",
        vaultPath: activeParent,
      };
    }

    return undefined;
  }

  private listSelectableTargets(): PublishTargetItem[] {
    const allItems = this.app.vault.getAllLoadedFiles();
    const targets: PublishTargetItem[] = [];

    for (const item of allItems) {
      const normalizedPath = normalizeVaultPath(item.path);
      if (!normalizedPath) {
        continue;
      }

      if (item instanceof TFolder) {
        if (!this.isSelectableDirectory(normalizedPath)) {
          continue;
        }
        targets.push({ path: normalizedPath, kind: "directory" });
        continue;
      }

      if (item instanceof TFile) {
        if (!this.isSelectableFile(normalizedPath)) {
          continue;
        }
        targets.push({ path: normalizedPath, kind: "file" });
      }
    }

    const defaultTarget = this.getActiveDefaultTarget();
    targets.sort((left, right) => {
      if (defaultTarget && left.path === defaultTarget.vaultPath) {
        return -1;
      }
      if (defaultTarget && right.path === defaultTarget.vaultPath) {
        return 1;
      }
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return left.path.localeCompare(right.path);
    });

    return targets;
  }

  private resolveTargetSelection(item: PublishTargetItem): ResolvedPublishTarget {
    const normalizedPath = normalizeVaultPath(item.path);
    const abstractItem = this.app.vault.getAbstractFileByPath(normalizedPath);

    if (item.kind === "file" || abstractItem instanceof TFile) {
      return {
        targetType: "file",
        vaultPath: normalizedPath,
      };
    }

    return {
      targetType: "directory",
      vaultPath: normalizedPath,
    };
  }

  private getDefaultDirectoryPath(target: ResolvedPublishTarget | undefined): string | null {
    if (!target) {
      return null;
    }

    if (target.targetType === "directory") {
      return normalizeVaultPath(target.vaultPath) || null;
    }

    const normalizedFilePath = normalizeVaultPath(target.vaultPath);
    const segments = normalizedFilePath.split("/");
    const parentDirectory = segments.slice(0, -1).join("/");
    return parentDirectory || null;
  }

  private async resolveExactTargetByVaultPath(vaultPath: string): Promise<ResolvedPublishTarget | null> {
    const normalizedPath = normalizeVaultPath(vaultPath);
    if (!normalizedPath) {
      return null;
    }

    const abstractItem = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (abstractItem instanceof TFolder && this.isSelectableDirectory(normalizedPath)) {
      return {
        targetType: "directory",
        vaultPath: normalizedPath,
      };
    }

    if (abstractItem instanceof TFile && this.isSelectableFile(normalizedPath)) {
      return {
        targetType: "file",
        vaultPath: normalizedPath,
      };
    }

    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      return null;
    }

    const absolutePath = absolutePathForVaultPath(vaultBasePath, normalizedPath);
    if (!ensureInsideVault(vaultBasePath, absolutePath)) {
      return null;
    }

    try {
      const stats = await fsp.stat(absolutePath);
      if (stats.isDirectory() && this.isSelectableDirectory(normalizedPath)) {
        return {
          targetType: "directory",
          vaultPath: normalizedPath,
        };
      }

      if (stats.isFile() && this.isSelectableFile(normalizedPath)) {
        return {
          targetType: "file",
          vaultPath: normalizedPath,
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  private async findUniqueTargetByBasename(query: string): Promise<ResolvedPublishTarget | null> {
    const normalizedQuery = normalizeVaultPath(query);
    if (!normalizedQuery || normalizedQuery.includes("/")) {
      return null;
    }

    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      return null;
    }

    let foundMatch: ResolvedPublishTarget | null = null;
    let hasMultipleMatches = false;

    const walk = async (absoluteDirectory: string, relativeDirectory: string): Promise<void> => {
      if (hasMultipleMatches) {
        return;
      }

      let entries;
      try {
        entries = await fsp.readdir(absoluteDirectory, { withFileTypes: true, encoding: "utf8" });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (hasMultipleMatches) {
          return;
        }

        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }

        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        const normalizedPath = normalizeVaultPath(relativePath);

        if (entry.isDirectory()) {
          if (entry.name === normalizedQuery && this.isSelectableDirectory(normalizedPath)) {
            const candidate: ResolvedPublishTarget = {
              targetType: "directory",
              vaultPath: normalizedPath,
            };

            if (foundMatch) {
              hasMultipleMatches = true;
              return;
            }

            foundMatch = candidate;
          }

          await walk(path.join(absoluteDirectory, entry.name), relativePath);
          continue;
        }

        if (entry.isFile() && entry.name === normalizedQuery && this.isSelectableFile(normalizedPath)) {
          const candidate: ResolvedPublishTarget = {
            targetType: "file",
            vaultPath: normalizedPath,
          };

          if (foundMatch) {
            hasMultipleMatches = true;
            return;
          }

          foundMatch = candidate;
        }
      }
    };

    await walk(vaultBasePath, "");
    if (hasMultipleMatches) {
      return null;
    }

    return foundMatch;
  }

  private async resolveTypedTargetFromQuery(
    unmatchedQuery: string,
    defaultTarget: ResolvedPublishTarget | undefined,
    selectableTargets: PublishTargetItem[],
  ): Promise<ResolvedPublishTarget | null> {
    const normalizedQuery = normalizeVaultPath(unmatchedQuery);
    if (!normalizedQuery) {
      return null;
    }

    const exactMatch = await this.resolveExactTargetByVaultPath(normalizedQuery);
    if (exactMatch) {
      return exactMatch;
    }

    const defaultDirectory = this.getDefaultDirectoryPath(defaultTarget);
    if (defaultDirectory) {
      const relativeCandidate = normalizeVaultPath(`${defaultDirectory}/${normalizedQuery}`);
      const relativeMatch = await this.resolveExactTargetByVaultPath(relativeCandidate);
      if (relativeMatch) {
        return relativeMatch;
      }
    }

    if (normalizedQuery.includes("/")) {
      return null;
    }

    const normalizedQueryLower = normalizedQuery.toLowerCase();
    const basenameMatches = selectableTargets.filter((target) => {
      const normalizedTargetPath = normalizeVaultPath(target.path).toLowerCase();
      const segments = normalizedTargetPath.split("/");
      return segments[segments.length - 1] === normalizedQueryLower;
    });

    if (basenameMatches.length === 1) {
      return this.resolveTargetSelection(basenameMatches[0]);
    }

    if (basenameMatches.length > 1 && defaultDirectory) {
      const normalizedDefaultDirectory = normalizeVaultPath(defaultDirectory).toLowerCase();
      const scopedMatches = basenameMatches.filter((target) =>
        normalizeVaultPath(target.path).toLowerCase().startsWith(`${normalizedDefaultDirectory}/`),
      );

      if (scopedMatches.length === 1) {
        return this.resolveTargetSelection(scopedMatches[0]);
      }
    }

    return this.findUniqueTargetByBasename(normalizedQuery);
  }

  private async chooseTarget(): Promise<ResolvedPublishTarget | null> {
    const selectableTargets = this.listSelectableTargets();
    if (selectableTargets.length === 0) {
      new Notice("No publishable files or subdirectories were found in this vault.");
      return null;
    }

    const defaultTarget = this.getActiveDefaultTarget();
    const modal = new DirectoryPickerModal(this.app, selectableTargets, defaultTarget?.vaultPath);
    const selected = await modal.openAndGetValue();

    if (!selected) {
      const unmatchedQuery = modal.getUnmatchedQuery();
      if (unmatchedQuery) {
        const resolvedFromQuery = await this.resolveTypedTargetFromQuery(
          unmatchedQuery,
          defaultTarget,
          selectableTargets,
        );
        if (resolvedFromQuery) {
          return resolvedFromQuery;
        }

        new Notice(`No matching target found for: ${unmatchedQuery}`, 6000);
      }
      return null;
    }

    return this.resolveTargetSelection(selected);
  }

  private formatTargetLabel(target: ResolvedPublishTarget): string {
    const prefix = target.targetType === "file" ? "file" : "directory";
    return `${prefix}: ${target.vaultPath}`;
  }

  private buildMirrorRelativePath(fileVaultPath: string): string {
    const stemSlug = sanitizeRepoName(fileStemFromVaultPath(fileVaultPath));
    const hash = crypto.createHash("sha1").update(fileVaultPath).digest("hex").slice(0, 8);
    return `${MIRROR_ROOT}/${stemSlug}-${hash}`;
  }

  private async resolveVisibility(existing: PublishedTargetRecord | undefined): Promise<RepoVisibility | null> {
    if (existing) {
      return existing.visibility;
    }

    return new VisibilityModal(this.app).openAndGetValue();
  }

  private getRepoWebUrl(repoName: string, originUrl: string | null): string {
    if (originUrl) {
      return originToWebUrl(originUrl) ?? originUrl;
    }

    return `https://github.com/${repoName}`;
  }

  private async handlePublishCommand(options?: { forcePicker?: boolean }): Promise<void> {
    if (!(await this.ensurePrerequisites())) {
      return;
    }

    let target: ResolvedPublishTarget | null = null;
    const defaultTarget = this.getActiveDefaultTarget();
    if (options?.forcePicker || !defaultTarget) {
      target = await this.chooseTarget();
    } else {
      target = defaultTarget;
    }

    if (!target) {
      return;
    }

    if (target.targetType === "directory" && isVaultRoot(target.vaultPath)) {
      new Notice("Vault root cannot be published. Select a subdirectory.");
      return;
    }

    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new Notice("Could not resolve the vault base path.");
      return;
    }

    if (target.targetType === "directory") {
      await this.publishDirectoryTarget(target.vaultPath, vaultBasePath);
      return;
    }

    await this.publishFileTarget(target.vaultPath, vaultBasePath);
  }

  private async publishDirectoryTarget(vaultPath: string, vaultBasePath: string): Promise<void> {
    const targetPath = absolutePathForVaultPath(vaultBasePath, vaultPath);
    if (!ensureInsideVault(vaultBasePath, targetPath)) {
      new Notice("Selected path is outside the vault. Aborting.");
      return;
    }

    const existingRecord = this.configStore.findTarget("directory", vaultPath);
    const visibility = await this.resolveVisibility(existingRecord);
    if (!visibility) {
      return;
    }

    const folderName = folderNameFromVaultPath(vaultPath);
    const baseRepoName = sanitizeRepoName(existingRecord?.repoName ?? folderName);

    const repoState = await this.gitService.detectRepoState(targetPath);
    if (repoState.hasOrigin && repoState.originUrl && !repoState.isGitHubOrigin) {
      new Notice("This directory uses a non-GitHub origin. v1 supports GitHub remotes only.", 10000);
      return;
    }

    const nowIso = new Date().toISOString();

    if (!repoState.hasLocalGit || !repoState.hasOrigin) {
      new Notice(`Connecting directory ${vaultPath} to GitHub...`, 5000);
      await this.gitService.ensureGitignore(targetPath);
      if (!repoState.hasLocalGit) {
        await this.gitService.initRepo(targetPath);
      }

      const linked = await this.gitService.linkLocalRepoWithoutOrigin(
        targetPath,
        folderName,
        baseRepoName,
        visibility,
      );

      this.configStore.upsertTarget({
        targetType: "directory",
        vaultPath,
        repoName: linked.repoName,
        remote: "origin",
        visibility,
        lastPushed: nowIso,
      });
      await this.configStore.save();

      const repoUrl = this.getRepoWebUrl(linked.repoName, linked.originUrl);
      const suffix = linked.pushed ? "" : " (linked remote, no commits yet)";
      new Notice(`Published ${vaultPath} -> ${repoUrl}${suffix}`, 8000);
      return;
    }

    new Notice(`Pushing directory repo ${vaultPath}...`, 5000);
    const pushResult = await this.gitService.pushDirectory(targetPath, folderName);
    if (pushResult.status === "failed") {
      new Notice(pushResult.error ?? "Push failed.", 12000);
      return;
    }

    const repoName =
      existingRecord?.repoName ||
      (repoState.originUrl ? parseRepoNameFromOrigin(repoState.originUrl) : null) ||
      baseRepoName;
    const nextLastPushed = pushResult.status === "pushed" ? nowIso : existingRecord?.lastPushed ?? nowIso;

    this.configStore.upsertTarget({
      targetType: "directory",
      vaultPath,
      repoName,
      remote: "origin",
      visibility,
      lastPushed: nextLastPushed,
    });
    await this.configStore.save();

    if (pushResult.status === "up_to_date") {
      new Notice("Already up to date.");
      return;
    }

    const repoUrl = this.getRepoWebUrl(repoName, repoState.originUrl ?? null);
    new Notice(`Pushed ${pushResult.changedCount ?? 0} changes to ${repoUrl}`, 8000);
  }

  private async publishFileTarget(vaultPath: string, vaultBasePath: string): Promise<void> {
    const sourceFile = this.app.vault.getAbstractFileByPath(vaultPath);
    if (!(sourceFile instanceof TFile)) {
      new Notice(`File not found: ${vaultPath}`);
      return;
    }

    const existingRecord = this.configStore.findTarget("file", vaultPath);
    const visibility = await this.resolveVisibility(existingRecord);
    if (!visibility) {
      return;
    }

    const sourceAbsolutePath = absolutePathForVaultPath(vaultBasePath, vaultPath);
    const mirrorPath = existingRecord?.mirrorPath ?? this.buildMirrorRelativePath(vaultPath);
    const mirrorFileName = existingRecord?.mirrorFileName ?? path.posix.basename(vaultPath);
    const mirrorAbsolutePath = absolutePathForVaultPath(vaultBasePath, mirrorPath);

    if (!ensureInsideVault(vaultBasePath, sourceAbsolutePath) || !ensureInsideVault(vaultBasePath, mirrorAbsolutePath)) {
      new Notice("File publish path resolved outside vault. Aborting.");
      return;
    }

    const fileStem = fileStemFromVaultPath(vaultPath);
    const baseRepoName = sanitizeRepoName(existingRecord?.repoName ?? fileStem);
    await this.gitService.syncSingleFileToRepo(sourceAbsolutePath, mirrorAbsolutePath, mirrorFileName);

    let repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
    if (repoState.hasOrigin && repoState.originUrl && !repoState.isGitHubOrigin) {
      new Notice("This file target uses a non-GitHub origin. v1 supports GitHub remotes only.", 12000);
      return;
    }

    if (!repoState.hasLocalGit) {
      await this.gitService.initRepo(mirrorAbsolutePath);
      repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
    }

    const nowIso = new Date().toISOString();

    if (!repoState.hasOrigin) {
      new Notice(`Connecting file ${vaultPath} to GitHub...`, 5000);
      const linked = await this.gitService.linkLocalRepoWithoutOrigin(
        mirrorAbsolutePath,
        fileStem,
        baseRepoName,
        visibility,
      );

      this.configStore.upsertTarget({
        targetType: "file",
        vaultPath,
        repoName: linked.repoName,
        remote: "origin",
        visibility,
        lastPushed: nowIso,
        mirrorPath,
        mirrorFileName,
      });
      await this.configStore.save();

      const repoUrl = this.getRepoWebUrl(linked.repoName, linked.originUrl);
      const suffix = linked.pushed ? "" : " (linked remote, no commits yet)";
      new Notice(`Published file ${vaultPath} -> ${repoUrl}${suffix}`, 9000);
      return;
    }

    new Notice(`Pushing file repo ${vaultPath}...`, 5000);
    const pushResult = await this.gitService.pushDirectory(mirrorAbsolutePath, fileStem);
    if (pushResult.status === "failed") {
      new Notice(pushResult.error ?? "File push failed.", 12000);
      return;
    }

    const repoName =
      existingRecord?.repoName ||
      (repoState.originUrl ? parseRepoNameFromOrigin(repoState.originUrl) : null) ||
      baseRepoName;
    const nextLastPushed = pushResult.status === "pushed" ? nowIso : existingRecord?.lastPushed ?? nowIso;

    this.configStore.upsertTarget({
      targetType: "file",
      vaultPath,
      repoName,
      remote: "origin",
      visibility,
      lastPushed: nextLastPushed,
      mirrorPath,
      mirrorFileName,
    });
    await this.configStore.save();

    if (pushResult.status === "up_to_date") {
      new Notice(`File repo already up to date: ${vaultPath}`, 6000);
      return;
    }

    const repoUrl = this.getRepoWebUrl(repoName, repoState.originUrl ?? null);
    new Notice(`Pushed ${pushResult.changedCount ?? 0} file changes to ${repoUrl}`, 9000);
  }

  private summarizeResults(results: PushRepoResult[]): PushAllSummary {
    return {
      total: results.length,
      pushed: results.filter((result) => result.status === "pushed").length,
      upToDate: results.filter((result) => result.status === "up_to_date").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    };
  }

  private async pushManagedFileTargets(vaultBasePath: string): Promise<{ results: PushRepoResult[]; changed: boolean }> {
    const records = this.configStore.getTargetsByType("file");
    const results: PushRepoResult[] = [];
    let changed = false;

    for (const record of records) {
      const sourceItem = this.app.vault.getAbstractFileByPath(record.vaultPath);
      if (!(sourceItem instanceof TFile)) {
        results.push({
          targetType: "file",
          vaultPath: record.vaultPath,
          status: "failed",
          error: "Source file no longer exists.",
        });
        continue;
      }

      if (!record.mirrorPath || !record.mirrorFileName) {
        results.push({
          targetType: "file",
          vaultPath: record.vaultPath,
          status: "failed",
          error: "Missing mirror metadata for file target.",
        });
        continue;
      }

      const sourceAbsolutePath = absolutePathForVaultPath(vaultBasePath, record.vaultPath);
      const mirrorAbsolutePath = absolutePathForVaultPath(vaultBasePath, record.mirrorPath);
      if (!ensureInsideVault(vaultBasePath, sourceAbsolutePath) || !ensureInsideVault(vaultBasePath, mirrorAbsolutePath)) {
        results.push({
          targetType: "file",
          vaultPath: record.vaultPath,
          status: "failed",
          error: "Resolved file or mirror path outside vault.",
        });
        continue;
      }

      try {
        await this.gitService.syncSingleFileToRepo(sourceAbsolutePath, mirrorAbsolutePath, record.mirrorFileName);

        let repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
        if (repoState.hasOrigin && repoState.originUrl && !repoState.isGitHubOrigin) {
          results.push({
            targetType: "file",
            vaultPath: record.vaultPath,
            status: "failed",
            error: "Non-GitHub origin is configured for this file mirror.",
          });
          continue;
        }

        if (!repoState.hasLocalGit) {
          await this.gitService.initRepo(mirrorAbsolutePath);
          repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
        }

        const nowIso = new Date().toISOString();
        const fileStem = fileStemFromVaultPath(record.vaultPath);
        const baseRepoName = sanitizeRepoName(record.repoName || fileStem);

        if (!repoState.hasOrigin) {
          const linked = await this.gitService.linkLocalRepoWithoutOrigin(
            mirrorAbsolutePath,
            fileStem,
            baseRepoName,
            record.visibility,
          );

          const status = linked.pushed ? "pushed" : "up_to_date";
          results.push({
            targetType: "file",
            vaultPath: record.vaultPath,
            status,
            originUrl: linked.originUrl ?? undefined,
          });

          this.configStore.upsertTarget({
            ...record,
            repoName: linked.repoName,
            lastPushed: status === "pushed" ? nowIso : record.lastPushed,
          });
          changed = true;
          continue;
        }

        const pushResult = await this.gitService.pushDirectory(mirrorAbsolutePath, fileStem);
        results.push({
          ...pushResult,
          targetType: "file",
          vaultPath: record.vaultPath,
          originUrl: repoState.originUrl,
        });

        const repoName =
          record.repoName ||
          (repoState.originUrl ? parseRepoNameFromOrigin(repoState.originUrl) : null) ||
          baseRepoName;
        this.configStore.upsertTarget({
          ...record,
          repoName,
          lastPushed: pushResult.status === "pushed" ? nowIso : record.lastPushed,
        });
        changed = true;
      } catch (error: unknown) {
        const message =
          error instanceof GitCommandError
            ? error.displayMessage()
            : error instanceof Error
              ? error.message
              : "Unknown file push failure.";

        results.push({
          targetType: "file",
          vaultPath: record.vaultPath,
          status: "failed",
          error: message,
        });
      }
    }

    return { results, changed };
  }

  private async handlePushAllRepositories(): Promise<void> {
    if (!(await this.ensurePrerequisites())) {
      return;
    }

    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new Notice("Could not resolve the vault base path.");
      return;
    }

    new Notice("Pushing all repositories...", 5000);
    const directorySummary = await this.gitService.pushAllRepos(vaultBasePath, {
      resolveVisibility: (vaultPath) =>
        this.configStore.findTarget("directory", vaultPath)?.visibility ?? "private",
      resolveBaseRepoName: (vaultPath) =>
        this.configStore.findTarget("directory", vaultPath)?.repoName ?? folderNameFromVaultPath(vaultPath),
    });

    const nowIso = new Date().toISOString();
    let shouldSave = false;

    for (const result of directorySummary.results) {
      if (!result.originUrl || !isGitHubOrigin(result.originUrl)) {
        continue;
      }

      const repoName = parseRepoNameFromOrigin(result.originUrl);
      if (!repoName) {
        continue;
      }

      const existing = this.configStore.findTarget("directory", result.vaultPath);
      const visibility = existing?.visibility ?? "private";
      const lastPushed = result.status === "pushed" ? nowIso : existing?.lastPushed ?? nowIso;

      this.configStore.upsertTarget({
        targetType: "directory",
        vaultPath: result.vaultPath,
        repoName,
        remote: "origin",
        visibility,
        lastPushed,
      });
      shouldSave = true;
    }

    const filePush = await this.pushManagedFileTargets(vaultBasePath);
    if (filePush.changed) {
      shouldSave = true;
    }

    if (shouldSave) {
      await this.configStore.save();
    }

    const summary = this.summarizeResults([...directorySummary.results, ...filePush.results]);
    if (summary.total === 0) {
      new Notice("No standalone or managed file repositories found to push.");
      return;
    }

    new Notice(
      `Push All complete: ${summary.pushed} pushed, ${summary.upToDate} up to date, ${summary.failed} failed, ${summary.skipped} skipped.`,
      10000,
    );

    const failures = summary.results.filter((result) => result.status === "failed");
    if (failures.length > 0) {
      const details = failures
        .slice(0, 3)
        .map((failure) => `${failure.targetType}:${failure.vaultPath}: ${failure.error ?? "Unknown error"}`)
        .join(" | ");
      new Notice(`Push failures: ${details}`, 12000);
    }
  }

  private showCommandError(error: unknown): void {
    if (error instanceof GitCommandError) {
      new Notice(`${error.command} failed: ${error.displayMessage()}`, 15000);
      return;
    }

    if (error instanceof Error) {
      new Notice(error.message, 12000);
      return;
    }

    new Notice("An unknown error occurred.", 12000);
  }
}
