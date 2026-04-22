import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";

import { App, Notice, Plugin, TFile, TFolder } from "obsidian";

import { MIRROR_ROOT } from "./constants";
import {
  DirectoryPickerModal,
  PublishTargetItem,
} from "./modals/directory-picker-modal";
import { PostFrontmatterModal } from "./modals/post-frontmatter-modal";
import { StaticSiteHostPickerModal } from "./modals/static-site-host-picker-modal";
import { StaticSiteUnpublishConfirmModal } from "./modals/static-site-unpublish-confirm-modal";
import { VisibilityModal } from "./modals/visibility-modal";
import { ConfigStore } from "./services/config-store";
import { GitCommandError, GitService } from "./services/git-service";
import { buildRepoInventory } from "./services/repo-inventory";
import {
  StaticSitePublishError,
  StaticSitePublisher,
} from "./services/static-site-publisher";
import { VaultPublisherSettingTab } from "./settings/vault-publisher-setting-tab";
import {
  PublishedTargetRecord,
  PublishTargetType,
  PushAllSummary,
  PushRepoResult,
  RepoInventoryEntry,
  RepoVisibility,
  StaticSiteHostConfig,
  StaticSitePublishRecord,
} from "./types";
import { validatePostFrontmatter } from "./utils/frontmatter";
import { upsertFrontmatterFields } from "./utils/frontmatter-io";
import { isGitHubOrigin, originToWebUrl } from "./utils/github-url";
import {
  absolutePathForVaultPath,
  ensureInsideVault,
  fileStemFromVaultPath,
  folderNameFromVaultPath,
  isVaultRoot,
  normalizeVaultPath,
} from "./utils/path-utils";
import { computePostDefaults, mergeDefaults } from "./utils/post-defaults";
import {
  parseRepoNameFromOrigin,
  sanitizeRepoName,
} from "./utils/repo-name-utils";

type FileSystemAdapterLike = {
  basePath?: string;
};

type ResolvedPublishTarget = {
  targetType: PublishTargetType;
  vaultPath: string;
};

type ElectronModuleLike = {
  shell?: {
    openExternal?: (url: string) => Promise<void> | void;
  };
};

export default class VaultPublisherPlugin extends Plugin {
  private configStore!: ConfigStore;

  private gitService!: GitService;

  private staticSitePublisher!: StaticSitePublisher;

  private isRunning = false;

  async onload(): Promise<void> {
    this.configStore = new ConfigStore(this);
    await this.configStore.load();

    this.gitService = new GitService();
    this.staticSitePublisher = new StaticSitePublisher(this.gitService);
    this.addSettingTab(new VaultPublisherSettingTab(this.app, this));

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

    this.addCommand({
      id: "publish-to-static-site",
      name: "Publish Note to Static Site Host (Experimental)",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePublishToStaticSite();
        });
      },
    });

    this.addCommand({
      id: "unpublish-from-static-site",
      name: "Unpublish Note from Static Site Host (Experimental)",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handleUnpublishFromStaticSite();
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

  async getRepoInventory(): Promise<RepoInventoryEntry[]> {
    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      return [];
    }

    const [standaloneRepoPaths, orphanMirrorPaths] = await Promise.all([
      this.gitService.findStandaloneRepos(vaultBasePath),
      this.gitService.findMirrorRepos(vaultBasePath, MIRROR_ROOT),
    ]);

    return buildRepoInventory({
      vaultBasePath,
      trackedTargets: this.configStore.getAllTargets(),
      standaloneRepoPaths,
      orphanMirrorPaths,
      resolveRepoState: async (absolutePath) =>
        this.gitService.detectRepoState(absolutePath),
    });
  }

  async unpublishRepo(entry: RepoInventoryEntry): Promise<boolean> {
    let didSucceed = false;
    await this.executeExclusive(async () => {
      didSucceed = await this.performUnpublishRepo(entry);
    });
    return didSucceed;
  }

  private async performUnpublishRepo(
    entry: RepoInventoryEntry,
  ): Promise<boolean> {
    if (!entry.canUnpublish || !entry.githubRepoSlug) {
      new Notice(
        entry.disabledReason ?? "This repository cannot be unpublished.",
        10000,
      );
      return false;
    }

    const githubStatus = await this.gitService.checkGitHubPrerequisites();
    if (!githubStatus.ok) {
      new Notice(
        githubStatus.message ?? "Missing required GitHub tools.",
        12000,
      );
      return false;
    }

    let remoteResult: { status: "deleted" | "not_found" };
    try {
      remoteResult = await this.gitService.deleteGitHubRepo(
        entry.githubRepoSlug,
      );
    } catch (error: unknown) {
      this.showCommandError(error);
      return false;
    }

    try {
      if (
        entry.sourceKind === "tracked-directory" ||
        entry.sourceKind === "scanned-directory"
      ) {
        await this.gitService.removeGitDirectory(entry.localRepoPath);
      } else {
        await this.gitService.removeDirectory(entry.localRepoPath);
      }

      if (
        entry.sourceKind === "tracked-directory" ||
        entry.sourceKind === "tracked-file"
      ) {
        this.configStore.removeTarget(entry.targetType, entry.vaultPath);
        await this.configStore.save();
      }
    } catch (error: unknown) {
      const detail =
        error instanceof GitCommandError
          ? error.displayMessage()
          : error instanceof Error
            ? error.message
            : "Unknown local cleanup failure.";
      const remoteMessage =
        remoteResult.status === "deleted"
          ? `Deleted GitHub repo ${entry.githubRepoSlug}`
          : `GitHub repo ${entry.githubRepoSlug} was already absent`;
      new Notice(
        `${remoteMessage}, but local cleanup failed: ${detail}`,
        15000,
      );
      return false;
    }

    const targetLabel =
      entry.sourceKind === "tracked-file"
        ? `file ${entry.vaultPath}`
        : entry.sourceKind === "orphan-mirror"
          ? `mirror ${entry.localRepoVaultPath}`
          : `directory ${entry.vaultPath}`;
    const remoteMessage =
      remoteResult.status === "deleted"
        ? `Deleted GitHub repo ${entry.githubRepoSlug}`
        : `GitHub repo ${entry.githubRepoSlug} was already absent`;
    new Notice(`Unpublished ${targetLabel}. ${remoteMessage}.`, 10000);
    return true;
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

  private resolveTargetSelection(
    item: PublishTargetItem,
  ): ResolvedPublishTarget {
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

  private getDefaultDirectoryPath(
    target: ResolvedPublishTarget | undefined,
  ): string | null {
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

  private async resolveExactTargetByVaultPath(
    vaultPath: string,
  ): Promise<ResolvedPublishTarget | null> {
    const normalizedPath = normalizeVaultPath(vaultPath);
    if (!normalizedPath) {
      return null;
    }

    const abstractItem = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (
      abstractItem instanceof TFolder &&
      this.isSelectableDirectory(normalizedPath)
    ) {
      return {
        targetType: "directory",
        vaultPath: normalizedPath,
      };
    }

    if (
      abstractItem instanceof TFile &&
      this.isSelectableFile(normalizedPath)
    ) {
      return {
        targetType: "file",
        vaultPath: normalizedPath,
      };
    }

    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      return null;
    }

    const absolutePath = absolutePathForVaultPath(
      vaultBasePath,
      normalizedPath,
    );
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

  private async findUniqueTargetByBasename(
    query: string,
  ): Promise<ResolvedPublishTarget | null> {
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

    const walk = async (
      absoluteDirectory: string,
      relativeDirectory: string,
    ): Promise<void> => {
      if (hasMultipleMatches) {
        return;
      }

      let entries;
      try {
        entries = await fsp.readdir(absoluteDirectory, {
          withFileTypes: true,
          encoding: "utf8",
        });
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

        const relativePath = relativeDirectory
          ? `${relativeDirectory}/${entry.name}`
          : entry.name;
        const normalizedPath = normalizeVaultPath(relativePath);

        if (entry.isDirectory()) {
          if (
            entry.name === normalizedQuery &&
            this.isSelectableDirectory(normalizedPath)
          ) {
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

        if (
          entry.isFile() &&
          entry.name === normalizedQuery &&
          this.isSelectableFile(normalizedPath)
        ) {
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

    const exactMatch =
      await this.resolveExactTargetByVaultPath(normalizedQuery);
    if (exactMatch) {
      return exactMatch;
    }

    const defaultDirectory = this.getDefaultDirectoryPath(defaultTarget);
    if (defaultDirectory) {
      const relativeCandidate = normalizeVaultPath(
        `${defaultDirectory}/${normalizedQuery}`,
      );
      const relativeMatch =
        await this.resolveExactTargetByVaultPath(relativeCandidate);
      if (relativeMatch) {
        return relativeMatch;
      }
    }

    if (normalizedQuery.includes("/")) {
      return null;
    }

    const normalizedQueryLower = normalizedQuery.toLowerCase();
    const basenameMatches = selectableTargets.filter((target) => {
      const normalizedTargetPath = normalizeVaultPath(
        target.path,
      ).toLowerCase();
      const segments = normalizedTargetPath.split("/");
      return segments[segments.length - 1] === normalizedQueryLower;
    });

    if (basenameMatches.length === 1) {
      return this.resolveTargetSelection(basenameMatches[0]);
    }

    if (basenameMatches.length > 1 && defaultDirectory) {
      const normalizedDefaultDirectory =
        normalizeVaultPath(defaultDirectory).toLowerCase();
      const scopedMatches = basenameMatches.filter((target) =>
        normalizeVaultPath(target.path)
          .toLowerCase()
          .startsWith(`${normalizedDefaultDirectory}/`),
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
      new Notice(
        "No publishable files or subdirectories were found in this vault.",
      );
      return null;
    }

    const defaultTarget = this.getActiveDefaultTarget();
    const modal = new DirectoryPickerModal(
      this.app,
      selectableTargets,
      defaultTarget?.vaultPath,
    );
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
    const hash = crypto
      .createHash("sha1")
      .update(fileVaultPath)
      .digest("hex")
      .slice(0, 8);
    return `${MIRROR_ROOT}/${stemSlug}-${hash}`;
  }

  private async resolveVisibility(
    existing: PublishedTargetRecord | undefined,
  ): Promise<RepoVisibility | null> {
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

  private async openExternalUrl(url: string): Promise<void> {
    if (typeof require === "function") {
      try {
        const electron = require("electron") as ElectronModuleLike;
        if (electron.shell?.openExternal) {
          await electron.shell.openExternal(url);
          return;
        }
      } catch {
        // Fall through to the browser fallback below.
      }
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  private showPublishedRepoNotice(
    messagePrefix: string,
    repoUrl: string,
    suffix = "",
    autoOpen = false,
  ): void {
    let notice: Notice | null = null;
    const fragment = document.createDocumentFragment();
    fragment.append(`${messagePrefix} `);

    const linkEl = document.createElement("a");
    linkEl.href = repoUrl;
    linkEl.textContent = repoUrl;
    linkEl.target = "_blank";
    linkEl.rel = "noopener noreferrer";
    linkEl.className = "vault-publisher-notice-link";
    fragment.append(linkEl);

    if (suffix) {
      fragment.append(suffix.startsWith(" ") ? suffix : ` ${suffix}`);
    }

    notice = new Notice(fragment, 10000);
    notice.noticeEl.addClass("vault-publisher-clickable-notice");
    notice.noticeEl.setAttribute("aria-label", `Open ${repoUrl}`);
    notice.noticeEl.title = "Open repository in browser";

    const openRepo = (event?: Event): void => {
      event?.preventDefault();
      event?.stopPropagation();
      void this.openExternalUrl(repoUrl);
      notice?.hide();
    };

    linkEl.addEventListener("click", (event) => {
      openRepo(event);
    });

    notice.noticeEl.addEventListener("click", (event) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.target instanceof HTMLElement && event.target.closest("a")) {
        return;
      }

      openRepo(event);
    });

    if (autoOpen) {
      void this.openExternalUrl(repoUrl);
    }
  }

  private async handlePublishCommand(options?: {
    forcePicker?: boolean;
  }): Promise<void> {
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

  private async publishDirectoryTarget(
    vaultPath: string,
    vaultBasePath: string,
  ): Promise<void> {
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
    const baseRepoName = sanitizeRepoName(
      existingRecord?.repoName ?? folderName,
    );

    const repoState = await this.gitService.detectRepoState(targetPath);
    if (
      repoState.hasOrigin &&
      repoState.originUrl &&
      !repoState.isGitHubOrigin
    ) {
      new Notice(
        "This directory uses a non-GitHub origin. v1 supports GitHub remotes only.",
        10000,
      );
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
        originUrl: linked.originUrl ?? existingRecord?.originUrl,
      });
      await this.configStore.save();

      const repoUrl = this.getRepoWebUrl(linked.repoName, linked.originUrl);
      const suffix = linked.pushed ? "" : " (linked remote, no commits yet)";
      this.showPublishedRepoNotice(
        `Published ${vaultPath} ->`,
        repoUrl,
        suffix,
        true,
      );
      return;
    }

    new Notice(`Pushing directory repo ${vaultPath}...`, 5000);
    const pushResult = await this.gitService.pushDirectory(
      targetPath,
      folderName,
    );
    if (pushResult.status === "failed") {
      new Notice(pushResult.error ?? "Push failed.", 12000);
      return;
    }

    const repoName =
      existingRecord?.repoName ||
      (repoState.originUrl
        ? parseRepoNameFromOrigin(repoState.originUrl)
        : null) ||
      baseRepoName;
    const nextLastPushed =
      pushResult.status === "pushed"
        ? nowIso
        : (existingRecord?.lastPushed ?? nowIso);

    this.configStore.upsertTarget({
      targetType: "directory",
      vaultPath,
      repoName,
      remote: "origin",
      visibility,
      lastPushed: nextLastPushed,
      originUrl: repoState.originUrl ?? existingRecord?.originUrl,
    });
    await this.configStore.save();

    if (pushResult.status === "up_to_date") {
      new Notice("Already up to date.");
      return;
    }

    const repoUrl = this.getRepoWebUrl(repoName, repoState.originUrl ?? null);
    new Notice(
      `Pushed ${pushResult.changedCount ?? 0} changes to ${repoUrl}`,
      8000,
    );
  }

  private async publishFileTarget(
    vaultPath: string,
    vaultBasePath: string,
  ): Promise<void> {
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

    const sourceAbsolutePath = absolutePathForVaultPath(
      vaultBasePath,
      vaultPath,
    );
    const mirrorPath =
      existingRecord?.mirrorPath ?? this.buildMirrorRelativePath(vaultPath);
    const mirrorFileName =
      existingRecord?.mirrorFileName ?? path.posix.basename(vaultPath);
    const mirrorAbsolutePath = absolutePathForVaultPath(
      vaultBasePath,
      mirrorPath,
    );

    if (
      !ensureInsideVault(vaultBasePath, sourceAbsolutePath) ||
      !ensureInsideVault(vaultBasePath, mirrorAbsolutePath)
    ) {
      new Notice("File publish path resolved outside vault. Aborting.");
      return;
    }

    const fileStem = fileStemFromVaultPath(vaultPath);
    const baseRepoName = sanitizeRepoName(existingRecord?.repoName ?? fileStem);
    await this.gitService.syncSingleFileToRepo(
      sourceAbsolutePath,
      mirrorAbsolutePath,
      mirrorFileName,
    );

    let repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
    if (
      repoState.hasOrigin &&
      repoState.originUrl &&
      !repoState.isGitHubOrigin
    ) {
      new Notice(
        "This file target uses a non-GitHub origin. v1 supports GitHub remotes only.",
        12000,
      );
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
        originUrl: linked.originUrl ?? existingRecord?.originUrl,
        mirrorPath,
        mirrorFileName,
      });
      await this.configStore.save();

      const repoUrl = this.getRepoWebUrl(linked.repoName, linked.originUrl);
      const suffix = linked.pushed ? "" : " (linked remote, no commits yet)";
      this.showPublishedRepoNotice(
        `Published file ${vaultPath} ->`,
        repoUrl,
        suffix,
        true,
      );
      return;
    }

    new Notice(`Pushing file repo ${vaultPath}...`, 5000);
    const pushResult = await this.gitService.pushDirectory(
      mirrorAbsolutePath,
      fileStem,
    );
    if (pushResult.status === "failed") {
      new Notice(pushResult.error ?? "File push failed.", 12000);
      return;
    }

    const repoName =
      existingRecord?.repoName ||
      (repoState.originUrl
        ? parseRepoNameFromOrigin(repoState.originUrl)
        : null) ||
      baseRepoName;
    const nextLastPushed =
      pushResult.status === "pushed"
        ? nowIso
        : (existingRecord?.lastPushed ?? nowIso);

    this.configStore.upsertTarget({
      targetType: "file",
      vaultPath,
      repoName,
      remote: "origin",
      visibility,
      lastPushed: nextLastPushed,
      originUrl: repoState.originUrl ?? existingRecord?.originUrl,
      mirrorPath,
      mirrorFileName,
    });
    await this.configStore.save();

    if (pushResult.status === "up_to_date") {
      new Notice(`File repo already up to date: ${vaultPath}`, 6000);
      return;
    }

    const repoUrl = this.getRepoWebUrl(repoName, repoState.originUrl ?? null);
    new Notice(
      `Pushed ${pushResult.changedCount ?? 0} file changes to ${repoUrl}`,
      9000,
    );
  }

  private summarizeResults(results: PushRepoResult[]): PushAllSummary {
    return {
      total: results.length,
      pushed: results.filter((result) => result.status === "pushed").length,
      upToDate: results.filter((result) => result.status === "up_to_date")
        .length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    };
  }

  private async pushManagedFileTargets(
    vaultBasePath: string,
  ): Promise<{ results: PushRepoResult[]; changed: boolean }> {
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

      const sourceAbsolutePath = absolutePathForVaultPath(
        vaultBasePath,
        record.vaultPath,
      );
      const mirrorAbsolutePath = absolutePathForVaultPath(
        vaultBasePath,
        record.mirrorPath,
      );
      if (
        !ensureInsideVault(vaultBasePath, sourceAbsolutePath) ||
        !ensureInsideVault(vaultBasePath, mirrorAbsolutePath)
      ) {
        results.push({
          targetType: "file",
          vaultPath: record.vaultPath,
          status: "failed",
          error: "Resolved file or mirror path outside vault.",
        });
        continue;
      }

      try {
        await this.gitService.syncSingleFileToRepo(
          sourceAbsolutePath,
          mirrorAbsolutePath,
          record.mirrorFileName,
        );

        let repoState =
          await this.gitService.detectRepoState(mirrorAbsolutePath);
        if (
          repoState.hasOrigin &&
          repoState.originUrl &&
          !repoState.isGitHubOrigin
        ) {
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
            originUrl: linked.originUrl ?? record.originUrl,
            lastPushed: status === "pushed" ? nowIso : record.lastPushed,
          });
          changed = true;
          continue;
        }

        const pushResult = await this.gitService.pushDirectory(
          mirrorAbsolutePath,
          fileStem,
        );
        results.push({
          ...pushResult,
          targetType: "file",
          vaultPath: record.vaultPath,
          originUrl: repoState.originUrl,
        });

        const repoName =
          record.repoName ||
          (repoState.originUrl
            ? parseRepoNameFromOrigin(repoState.originUrl)
            : null) ||
          baseRepoName;
        this.configStore.upsertTarget({
          ...record,
          repoName,
          originUrl: repoState.originUrl ?? record.originUrl,
          lastPushed:
            pushResult.status === "pushed" ? nowIso : record.lastPushed,
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
        this.configStore.findTarget("directory", vaultPath)?.visibility ??
        "private",
      resolveBaseRepoName: (vaultPath) =>
        this.configStore.findTarget("directory", vaultPath)?.repoName ??
        folderNameFromVaultPath(vaultPath),
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

      const existing = this.configStore.findTarget(
        "directory",
        result.vaultPath,
      );
      const visibility = existing?.visibility ?? "private";
      const lastPushed =
        result.status === "pushed" ? nowIso : (existing?.lastPushed ?? nowIso);

      this.configStore.upsertTarget({
        targetType: "directory",
        vaultPath: result.vaultPath,
        repoName,
        remote: "origin",
        visibility,
        lastPushed,
        originUrl: result.originUrl ?? existing?.originUrl,
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

    const summary = this.summarizeResults([
      ...directorySummary.results,
      ...filePush.results,
    ]);
    if (summary.total === 0) {
      new Notice("No standalone or managed file repositories found to push.");
      return;
    }

    new Notice(
      `Push All complete: ${summary.pushed} pushed, ${summary.upToDate} up to date, ${summary.failed} failed, ${summary.skipped} skipped.`,
      10000,
    );

    const failures = summary.results.filter(
      (result) => result.status === "failed",
    );
    if (failures.length > 0) {
      const details = failures
        .slice(0, 3)
        .map(
          (failure) =>
            `${failure.targetType}:${failure.vaultPath}: ${failure.error ?? "Unknown error"}`,
        )
        .join(" | ");
      new Notice(`Push failures: ${details}`, 12000);
    }
  }

  private showCommandError(error: unknown): void {
    if (error instanceof GitCommandError) {
      new Notice(`${error.command} failed: ${error.displayMessage()}`, 15000);
      return;
    }

    if (error instanceof StaticSitePublishError) {
      new Notice(error.message, 15000);
      return;
    }

    if (error instanceof Error) {
      new Notice(error.message, 12000);
      return;
    }

    new Notice("An unknown error occurred.", 12000);
  }

  // --- Static Site Hosts (experimental) ---

  getConfigStore(): ConfigStore {
    return this.configStore;
  }

  async saveConfig(): Promise<void> {
    await this.configStore.save();
  }

  getStaticSiteHosts(): StaticSiteHostConfig[] {
    return this.configStore.getStaticSiteHosts();
  }

  async upsertStaticSiteHost(host: StaticSiteHostConfig): Promise<void> {
    this.configStore.upsertStaticSiteHost(host);
    await this.configStore.save();
  }

  async removeStaticSiteHost(hostId: string): Promise<boolean> {
    const removed = this.configStore.removeStaticSiteHost(hostId);
    if (removed) {
      await this.configStore.save();
    }
    return removed;
  }

  private async resolveStaticSiteHost(
    frontmatterHostId?: string,
  ): Promise<StaticSiteHostConfig | null> {
    const hosts = this.configStore.getStaticSiteHosts();
    if (hosts.length === 0) {
      new Notice(
        "No static site hosts configured. Open Vault Publisher settings and add a host under 'Static Site Hosts'.",
        10000,
      );
      return null;
    }

    if (frontmatterHostId) {
      const byId = hosts.find((host) => host.id === frontmatterHostId);
      if (byId) {
        return byId;
      }
      new Notice(
        `Frontmatter 'host' is '${frontmatterHostId}' but no host with that id is configured. Pick one manually.`,
        10000,
      );
    }

    if (hosts.length === 1) {
      return hosts[0];
    }

    return new StaticSiteHostPickerModal(this.app, hosts).openAndGetValue();
  }

  private async handlePublishToStaticSite(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      new Notice(
        "Open the Markdown note you want to publish, then run this command.",
        8000,
      );
      return;
    }

    const cache = this.app.metadataCache.getFileCache(activeFile);
    const rawFrontmatter = (cache?.frontmatter ?? {}) as Record<
      string,
      unknown
    >;
    const rawHostId =
      typeof rawFrontmatter.host === "string"
        ? (rawFrontmatter.host as string)
        : undefined;

    const host = await this.resolveStaticSiteHost(rawHostId);
    if (!host) {
      return;
    }

    let fileContent = await this.app.vault.read(activeFile);
    let markdownBody = this.stripFrontmatter(fileContent);
    let frontmatter: Record<string, unknown> = rawFrontmatter;

    const preflight = validatePostFrontmatter(frontmatter);
    if (!preflight.ok) {
      const hosts = this.configStore.getStaticSiteHosts();
      const fileBasename = activeFile.basename;
      const defaults = computePostDefaults({
        fileBasename,
        body: markdownBody,
      });
      const merged = mergeDefaults(frontmatter, defaults);

      const modal = new PostFrontmatterModal(this.app, {
        hosts,
        defaults: {
          title: merged.title,
          slug: merged.slug,
          date: merged.date,
          description: merged.description,
          hostId: merged.hostId ?? host.id,
        },
        noteBasename: activeFile.basename,
      });

      const outcome = await modal.openAndGetValue();
      if (!outcome) {
        return;
      }

      if (outcome.values.hostId && outcome.values.hostId !== host.id) {
        const alternate = this.configStore.findStaticSiteHost(
          outcome.values.hostId,
        );
        if (alternate) {
          Object.assign(host, alternate);
        }
      }

      const nextFrontmatter: Record<string, unknown> = {
        ...frontmatter,
        title: outcome.values.title,
        slug: outcome.values.slug,
        date: outcome.values.date,
        description: outcome.values.description,
      };
      if (outcome.values.hostId) {
        nextFrontmatter.host = outcome.values.hostId;
      }

      if (outcome.persistToNote) {
        const updatedContent = upsertFrontmatterFields(fileContent, {
          title: outcome.values.title,
          slug: outcome.values.slug,
          date: outcome.values.date,
          description: outcome.values.description,
          host: outcome.values.hostId,
        });
        await this.app.vault.modify(activeFile, updatedContent);
        fileContent = updatedContent;
        markdownBody = this.stripFrontmatter(updatedContent);
      }

      frontmatter = nextFrontmatter;
    }

    const previousRecord = this.configStore.findStaticSitePublish(
      host.id,
      activeFile.path,
    );

    new Notice(`Publishing ${activeFile.path} to ${host.name}...`, 4000);

    try {
      const result = await this.staticSitePublisher.publish({
        host,
        frontmatter,
        markdownBody,
        vaultPath: activeFile.path,
        previousRecord,
      });

      const record: StaticSitePublishRecord = {
        hostId: host.id,
        vaultPath: activeFile.path,
        slug: result.slug,
        lastPublished: new Date().toISOString(),
        lastCommitSha: result.commitSha ?? undefined,
      };
      this.configStore.upsertStaticSitePublish(record);
      await this.configStore.save();

      for (const warning of result.warnings) {
        new Notice(`Warning: ${warning}`, 8000);
      }

      if (result.status === "unchanged") {
        new Notice(`Already up to date on ${host.name}.`, 6000);
        return;
      }

      if (result.publicUrl) {
        this.showStaticSitePublishedNotice(
          host.name,
          result.publicUrl,
          result.removedPreviousSlug,
        );
      } else {
        const suffix = result.removedPreviousSlug
          ? ` (old slug '${result.removedPreviousSlug}' removed)`
          : "";
        new Notice(
          `Published to ${host.name}: ${result.postRelativePathFromRepo}${suffix}`,
          10000,
        );
      }
    } catch (error: unknown) {
      this.showCommandError(error);
    }
  }

  private async handleUnpublishFromStaticSite(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      new Notice(
        "Open the Markdown note you want to unpublish, then run this command.",
        8000,
      );
      return;
    }

    const publishes = this.configStore
      .getStaticSitePublishes()
      .filter(
        (record) => record.vaultPath === normalizeVaultPath(activeFile.path),
      );
    if (publishes.length === 0) {
      new Notice(
        "This note has not been published to any static site host.",
        8000,
      );
      return;
    }

    let record = publishes[0];
    if (publishes.length > 1) {
      const hosts = this.configStore.getStaticSiteHosts();
      const candidateHosts = publishes
        .map((publish) => hosts.find((host) => host.id === publish.hostId))
        .filter((host): host is StaticSiteHostConfig => host !== undefined);
      const chosenHost = await new StaticSiteHostPickerModal(
        this.app,
        candidateHosts,
      ).openAndGetValue();
      if (!chosenHost) {
        return;
      }
      const matching = publishes.find(
        (publish) => publish.hostId === chosenHost.id,
      );
      if (!matching) {
        return;
      }
      record = matching;
    }

    const host = this.configStore.findStaticSiteHost(record.hostId);
    if (!host) {
      new Notice(
        `Host '${record.hostId}' is no longer configured. Remove the publish record manually in settings.`,
        10000,
      );
      return;
    }

    const confirmed = await new StaticSiteUnpublishConfirmModal(
      this.app,
      host,
      record,
    ).openAndConfirm();
    if (!confirmed) {
      return;
    }

    try {
      const result = await this.staticSitePublisher.unpublish({ host, record });

      this.configStore.removeStaticSitePublish(host.id, record.vaultPath);
      await this.configStore.save();

      if (result.status === "not_found") {
        new Notice(
          `Post file not found on disk; publish record removed.`,
          8000,
        );
        return;
      }

      new Notice(`Unpublished from ${host.name}.`, 8000);
    } catch (error: unknown) {
      this.showCommandError(error);
    }
  }

  private stripFrontmatter(fileContent: string): string {
    if (!fileContent.startsWith("---")) {
      return fileContent;
    }

    const match = fileContent.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (!match) {
      return fileContent;
    }
    return fileContent.slice(match[0].length);
  }

  private showStaticSitePublishedNotice(
    hostName: string,
    url: string,
    removedPreviousSlug: string | null,
  ): void {
    const fragment = document.createDocumentFragment();
    fragment.append(`Published to ${hostName}: `);

    const linkEl = document.createElement("a");
    linkEl.href = url;
    linkEl.textContent = url;
    linkEl.target = "_blank";
    linkEl.rel = "noopener noreferrer";
    linkEl.className = "vault-publisher-notice-link";
    fragment.append(linkEl);

    if (removedPreviousSlug) {
      fragment.append(` (old slug '${removedPreviousSlug}' removed)`);
    }

    const notice = new Notice(fragment, 10000);
    notice.noticeEl.addClass("vault-publisher-clickable-notice");
    notice.noticeEl.setAttribute("aria-label", `Open ${url}`);
    notice.noticeEl.title = "Open post in browser";

    const openLink = (event?: Event): void => {
      event?.preventDefault();
      event?.stopPropagation();
      void this.openExternalUrl(url);
      notice.hide();
    };

    linkEl.addEventListener("click", (event) => {
      openLink(event);
    });

    notice.noticeEl.addEventListener("click", (event) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest("a")) {
        return;
      }
      openLink(event);
    });

    void this.openExternalUrl(url);
  }
}
