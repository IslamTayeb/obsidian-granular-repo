import { App, ButtonComponent, PluginSettingTab, Setting } from "obsidian";

import type VaultPublisherPlugin from "../plugin";
import { UnpublishConfirmModal } from "../modals/unpublish-confirm-modal";
import { RepoInventoryEntry } from "../types";

type EntryGroup = {
  title: string;
  description: string;
  emptyText: string;
  entries: RepoInventoryEntry[];
};

export class VaultPublisherSettingTab extends PluginSettingTab {
  private readonly vaultPublisher: VaultPublisherPlugin;

  private renderNonce = 0;

  constructor(app: App, plugin: VaultPublisherPlugin) {
    super(app, plugin);
    this.vaultPublisher = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("vault-publisher-settings");

    this.renderHeader(containerEl);
    containerEl.createDiv({
      cls: "vault-publisher-empty",
      text: "Loading repositories...",
    });

    const currentRender = ++this.renderNonce;
    void this.renderInventory(currentRender);
  }

  private async renderInventory(renderNonce: number): Promise<void> {
    const { containerEl } = this;

    try {
      const entries = await this.vaultPublisher.getRepoInventory();
      if (renderNonce !== this.renderNonce) {
        return;
      }

      containerEl.empty();
      containerEl.addClass("vault-publisher-settings");
      this.renderHeader(containerEl, entries.length);

      if (entries.length === 0) {
        containerEl.createDiv({
          cls: "vault-publisher-empty",
          text: "No tracked or discovered repositories were found.",
        });
        return;
      }

      const groups: EntryGroup[] = [
        {
          title: "Tracked Targets",
          description: "Repositories the plugin explicitly tracks for directories and file mirrors.",
          emptyText: "No tracked directory or file targets.",
          entries: entries.filter((entry) => entry.sourceKind === "tracked-directory" || entry.sourceKind === "tracked-file"),
        },
        {
          title: "Scanned Repositories",
          description: "Standalone Git repositories found by the existing vault scan.",
          emptyText: "No standalone scanned repositories.",
          entries: entries.filter((entry) => entry.sourceKind === "scanned-directory"),
        },
        {
          title: "Orphan Mirrors",
          description: "Mirror repositories under the plugin mirror root that are no longer tied to a tracked file target.",
          emptyText: "No orphan mirror repositories.",
          entries: entries.filter((entry) => entry.sourceKind === "orphan-mirror"),
        },
      ];

      for (const group of groups) {
        this.renderGroup(containerEl, group);
      }
    } catch (error: unknown) {
      if (renderNonce !== this.renderNonce) {
        return;
      }

      containerEl.empty();
      containerEl.addClass("vault-publisher-settings");
      this.renderHeader(containerEl);
      containerEl.createDiv({
        cls: "vault-publisher-empty",
        text: this.formatError(error),
      });
    }
  }

  private renderHeader(containerEl: HTMLElement, totalCount?: number): void {
    const heading = totalCount === undefined ? "Repository Management" : `Repository Management (${totalCount})`;
    new Setting(containerEl)
      .setName(heading)
      .setDesc(
        "View tracked targets, scanned repos, and orphan mirrors. Unpublish deletes the GitHub repo and removes local Git state while keeping vault content.",
      )
      .addButton((button) => {
        button.setButtonText("Refresh").onClick(() => {
          this.display();
        });
      });
  }

  private renderGroup(containerEl: HTMLElement, group: EntryGroup): void {
    const groupEl = containerEl.createDiv({ cls: "vault-publisher-section" });
    groupEl.createEl("h3", {
      text: `${group.title} (${group.entries.length})`,
    });
    groupEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: group.description,
    });

    if (group.entries.length === 0) {
      groupEl.createDiv({
        cls: "vault-publisher-empty",
        text: group.emptyText,
      });
      return;
    }

    for (const entry of group.entries) {
      this.renderEntry(groupEl, entry);
    }
  }

  private renderEntry(containerEl: HTMLElement, entry: RepoInventoryEntry): void {
    const setting = new Setting(containerEl);
    setting.settingEl.addClass("vault-publisher-entry");

    setting.nameEl.empty();
    const titleEl = setting.nameEl.createDiv({ cls: "vault-publisher-entry-title" });
    titleEl.createSpan({
      cls: "vault-publisher-entry-path",
      text: this.getEntryTitle(entry),
    });

    for (const badge of this.getEntryBadges(entry)) {
      titleEl.createSpan({
        cls: "vault-publisher-entry-badge",
        text: badge,
      });
    }

    setting.descEl.empty();
    for (const line of this.getEntryLines(entry)) {
      const lineEl = setting.descEl.createDiv({ cls: "vault-publisher-entry-line" });
      lineEl.createSpan({
        cls: "vault-publisher-entry-label",
        text: `${line.label}: `,
      });
      lineEl.createSpan({ text: line.value });
    }

    if (!entry.canUnpublish && entry.disabledReason) {
      setting.descEl.createDiv({
        cls: "vault-publisher-entry-warning",
        text: entry.disabledReason,
      });
    }

    setting.addButton((button) => {
      button.setButtonText("Unpublish");
      button.buttonEl.addClass("mod-warning");
      button.setDisabled(!entry.canUnpublish);
      button.onClick(() => {
        void this.handleUnpublish(entry, button);
      });
    });
  }

  private async handleUnpublish(entry: RepoInventoryEntry, button: ButtonComponent): Promise<void> {
    const confirmed = await new UnpublishConfirmModal(this.app, entry).openAndConfirm();
    if (!confirmed) {
      return;
    }

    button.setButtonText("Working...");
    button.setDisabled(true);

    await this.vaultPublisher.unpublishRepo(entry);
    this.display();
  }

  private getEntryTitle(entry: RepoInventoryEntry): string {
    if (entry.sourceKind === "tracked-file") {
      return entry.vaultPath;
    }

    if (entry.sourceKind === "orphan-mirror") {
      return entry.localRepoVaultPath;
    }

    return entry.vaultPath;
  }

  private getEntryBadges(entry: RepoInventoryEntry): string[] {
    const badges: string[] = [];

    if (entry.sourceKind === "tracked-directory" || entry.sourceKind === "tracked-file") {
      badges.push("Tracked");
    } else if (entry.sourceKind === "scanned-directory") {
      badges.push("Scanned");
    } else {
      badges.push("Orphan");
    }

    if (entry.sourceKind === "tracked-file" || entry.sourceKind === "orphan-mirror") {
      badges.push("File");
    } else {
      badges.push("Directory");
    }

    if (entry.githubRepoSlug) {
      badges.push("GitHub");
    } else if (entry.hasOrigin) {
      badges.push("Non-GitHub");
    } else {
      badges.push("No Remote");
    }

    return badges;
  }

  private getEntryLines(entry: RepoInventoryEntry): Array<{ label: string; value: string }> {
    const lines: Array<{ label: string; value: string }> = [];

    if (entry.sourceKind === "tracked-file") {
      lines.push({ label: "Source", value: entry.vaultPath });
      if (entry.mirrorPath) {
        lines.push({ label: "Mirror", value: entry.mirrorPath });
      }
    } else if (entry.sourceKind === "orphan-mirror") {
      lines.push({ label: "Mirror", value: entry.localRepoVaultPath });
    } else {
      lines.push({ label: "Path", value: entry.vaultPath });
    }

    lines.push({
      label: "Local Repo",
      value: entry.hasLocalGit ? entry.localRepoVaultPath : `${entry.localRepoVaultPath} (missing .git)`,
    });

    if (entry.githubRepoSlug) {
      lines.push({
        label: "GitHub",
        value: `https://github.com/${entry.githubRepoSlug}`,
      });
    }

    if (entry.liveOriginUrl) {
      lines.push({ label: "Origin", value: entry.liveOriginUrl });
    } else {
      lines.push({ label: "Origin", value: "Not configured" });
    }

    if (entry.storedOriginUrl && entry.storedOriginUrl !== entry.liveOriginUrl) {
      lines.push({ label: "Stored Origin", value: entry.storedOriginUrl });
    }

    if (entry.visibility) {
      lines.push({ label: "Visibility", value: entry.visibility });
    }

    return lines;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return `Could not load repositories: ${error.message}`;
    }

    return "Could not load repositories.";
  }
}
