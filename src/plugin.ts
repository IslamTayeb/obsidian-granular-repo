import path from "node:path";

import { App, Notice, Plugin, TFile, TFolder } from "obsidian";

import { ConfigStore } from "./services/config-store";
import { GitCommandError, GitService } from "./services/git-service";
import { VisibilityModal } from "./modals/visibility-modal";
import { DirectoryPickerModal, PublishTargetItem } from "./modals/directory-picker-modal";
import { PublishedDirRecord } from "./types";
import { isGitHubOrigin, originToWebUrl } from "./utils/github-url";
import {
  absolutePathForVaultPath,
  ensureInsideVault,
  folderNameFromVaultPath,
  isVaultRoot,
  normalizeVaultPath,
} from "./utils/path-utils";
import { parseRepoNameFromOrigin, sanitizeRepoName } from "./utils/repo-name-utils";

type FileSystemAdapterLike = {
  basePath?: string;
};

export default class VaultPublisherPlugin extends Plugin {
  private configStore!: ConfigStore;

  private gitService!: GitService;

  private isRunning = false;

  async onload(): Promise<void> {
    this.configStore = new ConfigStore(this);
    await this.configStore.load();

    this.gitService = new GitService();

    void this.noticePrerequisiteIssues();

    this.addCommand({
      id: "publish-directory",
      name: "Publish Directory to GitHub",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePublishDirectory();
        });
      },
    });

    this.addCommand({
      id: "publish-directory-select-target",
      name: "Publish Directory to GitHub (Choose Target)",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePublishDirectory({ forcePicker: true });
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

  private async noticePrerequisiteIssues(): Promise<void> {
    const status = await this.gitService.checkPrerequisites();
    if (!status.ok && status.message) {
      new Notice(status.message, 12000);
    }
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

  private getActiveDefaultDirectory(): string | undefined {
    const activeFile = this.app.workspace.getActiveFile();
    const parentPath = normalizeVaultPath(activeFile?.parent?.path ?? "");

    if (!parentPath || !this.isSelectableDirectory(parentPath)) {
      return undefined;
    }

    return parentPath;
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

    targets.sort((left, right) => {
      if (left.path === this.getActiveDefaultDirectory()) {
        return -1;
      }
      if (right.path === this.getActiveDefaultDirectory()) {
        return 1;
      }
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return left.path.localeCompare(right.path);
    });

    return targets;
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

  private async chooseDirectory(): Promise<string | null> {
    const selectableTargets = this.listSelectableTargets();
    if (selectableTargets.length === 0) {
      new Notice("No publishable files or subdirectories were found in this vault.");
      return null;
    }

    const defaultPath = this.getActiveDefaultDirectory();
    const modal = new DirectoryPickerModal(this.app, selectableTargets, defaultPath);
    const selected = await modal.openAndGetValue();

    if (!selected) {
      return null;
    }

    return this.resolveDirectoryPath(selected.path);
  }

  private resolveDirectoryPath(selection: string): string {
    const normalized = normalizeVaultPath(selection);
    const file = this.app.vault.getAbstractFileByPath(normalized);

    if (file instanceof TFile) {
      return normalizeVaultPath(file.parent?.path ?? "");
    }

    if (file instanceof TFolder) {
      return normalizeVaultPath(file.path);
    }

    return normalized;
  }

  private async handlePublishDirectory(options?: { forcePicker?: boolean }): Promise<void> {
    if (!(await this.ensurePrerequisites())) {
      return;
    }

    const activeDefaultDirectory = this.getActiveDefaultDirectory();
    let selectedVaultPath: string | null = null;

    if (options?.forcePicker || !activeDefaultDirectory) {
      selectedVaultPath = await this.chooseDirectory();
    } else {
      selectedVaultPath = activeDefaultDirectory;
      new Notice(`Using active file directory: ${selectedVaultPath}`, 3500);
    }

    if (!selectedVaultPath) {
      return;
    }

    if (isVaultRoot(selectedVaultPath)) {
      new Notice("Vault root cannot be published. Select a subdirectory.");
      return;
    }

    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new Notice("Could not resolve the vault base path.");
      return;
    }

    const targetPath = absolutePathForVaultPath(vaultBasePath, selectedVaultPath);
    if (!ensureInsideVault(vaultBasePath, targetPath)) {
      new Notice("Selected path is outside the vault. Aborting.");
      return;
    }

    new Notice(`Preparing publish for: ${selectedVaultPath}`, 3500);

    const repoState = await this.gitService.detectRepoState(targetPath);

    if (repoState.hasOrigin && repoState.originUrl && !repoState.isGitHubOrigin) {
      new Notice("This directory uses a non-GitHub origin. v1 supports GitHub remotes only.", 10000);
      return;
    }

    if (!repoState.hasLocalGit || !repoState.hasOrigin) {
      await this.handleFirstPublish(selectedVaultPath, targetPath, repoState);
      return;
    }

    await this.handleRepeatPublish(selectedVaultPath, targetPath, repoState.originUrl ?? null);
  }

  private async handleFirstPublish(
    vaultPath: string,
    targetPath: string,
    repoState: { hasLocalGit: boolean; hasOrigin: boolean },
  ): Promise<void> {
    const visibility = await new VisibilityModal(this.app).openAndGetValue();
    if (!visibility) {
      return;
    }

    const folderName = folderNameFromVaultPath(vaultPath);
    const baseRepoName = sanitizeRepoName(folderName);

    try {
      new Notice(`Configuring repo for ${vaultPath}...`, 5000);
      await this.gitService.ensureGitignore(targetPath);
      if (!repoState.hasLocalGit) {
        new Notice(`Initializing git in ${vaultPath}...`, 5000);
        await this.gitService.initRepo(targetPath);
      }

      new Notice(`Creating or linking GitHub repo for ${vaultPath}...`, 6000);
      const linked = await this.gitService.linkLocalRepoWithoutOrigin(
        targetPath,
        folderName,
        baseRepoName,
        visibility,
      );
      const repoName = linked.repoName;
      const originUrl = linked.originUrl;

      const record: PublishedDirRecord = {
        vaultPath,
        repoName,
        remote: "origin",
        visibility,
        lastPushed: new Date().toISOString(),
      };

      this.configStore.upsert(record);
      await this.configStore.save();

      const repoUrl = originUrl ? originToWebUrl(originUrl) ?? originUrl : `https://github.com/${repoName}`;
      const suffix = linked.pushed ? "" : " (linked remote, no commits yet)";
      new Notice(`Published ${vaultPath} -> ${repoUrl}${suffix}`, 8000);
    } catch (error: unknown) {
      this.showCommandError(error);
    }
  }

  private async handleRepeatPublish(
    vaultPath: string,
    targetPath: string,
    originUrl: string | null,
  ): Promise<void> {
    new Notice(`Pushing updates for ${vaultPath}...`, 5000);
    const folderName = folderNameFromVaultPath(vaultPath);
    const result = await this.gitService.pushDirectory(targetPath, folderName);

    if (result.status === "failed") {
      new Notice(result.error ?? "Push failed.", 12000);
      return;
    }

    if (result.status === "up_to_date") {
      new Notice("Already up to date.");
      return;
    }

    const existing = this.configStore.findByVaultPath(vaultPath);
    const repoName =
      existing?.repoName ||
      (originUrl ? parseRepoNameFromOrigin(originUrl) : null) ||
      sanitizeRepoName(folderName);
    const visibility = existing?.visibility ?? "private";

    this.configStore.upsert({
      vaultPath,
      repoName,
      remote: "origin",
      visibility,
      lastPushed: new Date().toISOString(),
    });
    await this.configStore.save();

    const pushedUrl = originUrl ? originToWebUrl(originUrl) ?? originUrl : repoName;
    const changedCount = result.changedCount ?? 0;
    new Notice(`Pushed ${changedCount} changes to ${pushedUrl}`, 8000);
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

    new Notice("Scanning vault for standalone repositories...", 5000);
    const summary = await this.gitService.pushAllRepos(vaultBasePath, {
      resolveVisibility: (vaultPath) => this.configStore.findByVaultPath(vaultPath)?.visibility ?? "private",
      resolveBaseRepoName: (vaultPath) =>
        this.configStore.findByVaultPath(vaultPath)?.repoName ?? folderNameFromVaultPath(vaultPath),
    });

    if (summary.total === 0) {
      new Notice("No standalone git repositories found in vault subdirectories.");
      return;
    }

    let shouldSaveConfig = false;
    const nowIso = new Date().toISOString();

    for (const result of summary.results) {
      if (!result.originUrl || !isGitHubOrigin(result.originUrl)) {
        continue;
      }

      const repoName = parseRepoNameFromOrigin(result.originUrl);
      if (!repoName) {
        continue;
      }

      const existing = this.configStore.findByVaultPath(result.vaultPath);
      const visibility = existing?.visibility ?? "private";
      const lastPushed = result.status === "pushed" ? nowIso : existing?.lastPushed ?? nowIso;

      this.configStore.upsert({
        vaultPath: result.vaultPath,
        repoName,
        remote: "origin",
        visibility,
        lastPushed,
      });
      shouldSaveConfig = true;
    }

    if (shouldSaveConfig) {
      await this.configStore.save();
    }

    new Notice(
      `Push All complete: ${summary.pushed} pushed, ${summary.upToDate} up to date, ${summary.failed} failed, ${summary.skipped} skipped.`,
      10000,
    );

    const failures = summary.results.filter((result) => result.status === "failed");
    if (failures.length > 0) {
      const details = failures
        .slice(0, 3)
        .map((failure) => `${failure.vaultPath}: ${failure.error ?? "Unknown error"}`)
        .join(" | ");
      new Notice(`Push failures: ${details}`, 12000);
    }
  }

  private showCommandError(error: unknown): void {
    if (error instanceof GitCommandError) {
      const message = `${error.command} failed: ${error.displayMessage()}`;
      new Notice(message, 15000);
      return;
    }

    if (error instanceof Error) {
      new Notice(error.message, 12000);
      return;
    }

    new Notice("An unknown error occurred.", 12000);
  }
}
