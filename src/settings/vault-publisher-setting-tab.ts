import {
  App,
  ButtonComponent,
  Notice,
  PluginSettingTab,
  Setting,
} from "obsidian";

import type VaultPublisherPlugin from "../plugin";
import { StaticSiteHostModal } from "../modals/static-site-host-modal";
import { UnpublishConfirmModal } from "../modals/unpublish-confirm-modal";
import { RepoInventoryEntry, StaticSiteHostConfig } from "../types";
import {
  APM_OVERFLOW_HOST_ID,
  APM_OVERFLOW_REPO_ROOT,
  createApmOverflowPreset,
} from "../services/static-site-presets";

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
      } else {
        const groups: EntryGroup[] = [
          {
            title: "Tracked Targets",
            description:
              "Repositories the plugin explicitly tracks for directories and file mirrors.",
            emptyText: "No tracked directory or file targets.",
            entries: entries.filter(
              (entry) =>
                entry.sourceKind === "tracked-directory" ||
                entry.sourceKind === "tracked-file",
            ),
          },
          {
            title: "Scanned Repositories",
            description:
              "Standalone Git repositories found by the existing vault scan.",
            emptyText: "No standalone scanned repositories.",
            entries: entries.filter(
              (entry) => entry.sourceKind === "scanned-directory",
            ),
          },
          {
            title: "Orphan Mirrors",
            description:
              "Mirror repositories under the plugin mirror root that are no longer tied to a tracked file target.",
            emptyText: "No orphan mirror repositories.",
            entries: entries.filter(
              (entry) => entry.sourceKind === "orphan-mirror",
            ),
          },
        ];

        for (const group of groups) {
          this.renderGroup(containerEl, group);
        }
      }

      this.renderGoogleDocsSection(containerEl);
      this.renderStaticSiteHostsSection(containerEl);
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
      this.renderGoogleDocsSection(containerEl);
      this.renderStaticSiteHostsSection(containerEl);
    }
  }

  private renderHeader(containerEl: HTMLElement, totalCount?: number): void {
    const heading =
      totalCount === undefined
        ? "Repository Management"
        : `Repository Management (${totalCount})`;
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

  private renderEntry(
    containerEl: HTMLElement,
    entry: RepoInventoryEntry,
  ): void {
    const setting = new Setting(containerEl);
    setting.settingEl.addClass("vault-publisher-entry");

    setting.nameEl.empty();
    const titleEl = setting.nameEl.createDiv({
      cls: "vault-publisher-entry-title",
    });
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
      const lineEl = setting.descEl.createDiv({
        cls: "vault-publisher-entry-line",
      });
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

  private async handleUnpublish(
    entry: RepoInventoryEntry,
    button: ButtonComponent,
  ): Promise<void> {
    const confirmed = await new UnpublishConfirmModal(
      this.app,
      entry,
    ).openAndConfirm();
    if (!confirmed) {
      return;
    }

    button.setButtonText("Working...");
    button.setDisabled(true);

    await this.vaultPublisher.unpublishRepo(entry);
    this.display();
  }

  private renderGoogleDocsSection(containerEl: HTMLElement): void {
    const sectionEl = containerEl.createDiv({ cls: "vault-publisher-section" });
    sectionEl.createEl("h3", { text: "Google Docs" });
    sectionEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Upload the active Markdown note to one Google Doc per note. Local image and video embeds are uploaded to Drive; supported images are inserted inline and videos are linked.",
    });

    const settings = this.vaultPublisher.getGoogleDocsSettings();
    const publishCount = this.vaultPublisher
      .getConfigStore()
      .getGoogleDocsPublishes().length;

    new Setting(sectionEl)
      .setName("Status")
      .setDesc(
        settings.refreshToken
          ? `Authorized. Tracked Google Docs: ${publishCount}.`
          : `Not authorized. Tracked Google Docs: ${publishCount}.`,
      )
      .addButton((button) => {
        button
          .setButtonText(settings.refreshToken ? "Re-authorize" : "Authorize")
          .onClick(async () => {
            button.setDisabled(true);
            button.setButtonText("Opening...");
            await this.vaultPublisher.authorizeGoogleDocs();
            this.display();
          });
      })
      .addButton((button) => {
        button.setButtonText("Forget token");
        button.setDisabled(!settings.refreshToken);
        button.onClick(async () => {
          button.setDisabled(true);
          await this.vaultPublisher.forgetGoogleDocsAuth();
          this.display();
        });
      });

    new Setting(sectionEl)
      .setName("OAuth credentials JSON path")
      .setDesc(
        "Absolute path to a Google OAuth desktop-client credentials JSON file.",
      )
      .addText((text) => {
        text.setPlaceholder("/Users/you/Downloads/client_secret.json");
        text.setValue(settings.credentialsPath ?? "");
        text.inputEl.style.width = "100%";
        text.onChange((value) => {
          void this.vaultPublisher.updateGoogleDocsSettings({
            credentialsPath: value.trim() || undefined,
          });
        });
      });

    new Setting(sectionEl)
      .setName("Google Drive folder ID")
      .setDesc("New Google Docs are created in this Drive folder.")
      .addText((text) => {
        text.setPlaceholder("Drive folder ID");
        text.setValue(settings.docsFolderId ?? "");
        text.inputEl.style.width = "100%";
        text.onChange((value) => {
          void this.vaultPublisher.updateGoogleDocsSettings({
            docsFolderId: value.trim() || undefined,
          });
        });
      });

    new Setting(sectionEl)
      .setName("Generated media folder ID")
      .setDesc(
        "Optional. Leave blank and the plugin will create 'Vault Publisher Media' under the Drive folder.",
      )
      .addText((text) => {
        text.setPlaceholder("Created automatically");
        text.setValue(settings.mediaFolderId ?? "");
        text.inputEl.style.width = "100%";
        text.onChange((value) => {
          void this.vaultPublisher.updateGoogleDocsSettings({
            mediaFolderId: value.trim() || undefined,
          });
        });
      });
  }

  private renderStaticSiteHostsSection(containerEl: HTMLElement): void {
    const sectionEl = containerEl.createDiv({ cls: "vault-publisher-section" });

    const headerRow = sectionEl.createDiv({
      cls: "vault-publisher-static-header",
    });
    headerRow.createEl("h3", {
      text: "Static Site Hosts — Bring Your Own Host",
    });
    headerRow.createSpan({
      cls: "vault-publisher-experimental-badge",
      text: "EXPERIMENTAL",
    });

    const warning = sectionEl.createDiv({
      cls: "vault-publisher-experimental-warning",
    });
    warning.createSpan({
      text: "This feature is experimental. It writes into your local static-site repo and force-pushes a commit on the current branch — double-check your host config before publishing, and expect rough edges.",
    });

    sectionEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Publish Markdown notes as HTML pages in any git-backed static site. The plugin renders Markdown through a host-provided HTML template, writes the file into your repo, and commits + pushes only that file. It does not touch blog indexes or feeds, so posts are unlisted and reachable only by direct URL.",
    });

    const requirements = sectionEl.createEl("ul", {
      cls: "vault-publisher-confirm-list",
    });
    requirements.createEl("li", {
      text: "Your note needs YAML frontmatter with `title`, `slug`, `date`, `description`, and optionally `host: <host-id>`.",
    });
    requirements.createEl("li", {
      text: "Your template must contain the token strings (POST_TITLE, POST_SLUG, POST_DESCRIPTION, YYYY-MM-DDTHH:MMZ, Mon DD, YYYY) and a content marker (e.g. <p>Article content...</p>) that the plugin will replace.",
    });
    requirements.createEl("li", {
      text: "The repo root must be a git worktree; the plugin uses `git` on PATH to stage, commit, and push.",
    });

    const hosts = this.vaultPublisher.getStaticSiteHosts();

    this.renderPresetsRow(sectionEl, hosts);

    if (hosts.length === 0) {
      sectionEl.createDiv({
        cls: "vault-publisher-empty",
        text: "No static site hosts configured yet.",
      });
    } else {
      for (const host of hosts) {
        this.renderHostEntry(sectionEl, host);
      }
    }

    new Setting(sectionEl)
      .setName("Add custom host")
      .setDesc("Configure a new static site target from scratch.")
      .addButton((button) => {
        button.setButtonText("Add host").onClick(() => {
          void this.handleAddHost();
        });
      });
  }

  private renderPresetsRow(
    sectionEl: HTMLElement,
    hosts: StaticSiteHostConfig[],
  ): void {
    const hasApmOverflow = hosts.some(
      (host) => host.id === APM_OVERFLOW_HOST_ID,
    );
    if (hasApmOverflow) {
      return;
    }

    const setting = new Setting(sectionEl)
      .setName("APM Overflow preset")
      .setDesc(
        `Seed a host pointing at ${APM_OVERFLOW_REPO_ROOT}/apmoverflow using the existing _template.html. You can edit it afterwards.`,
      )
      .addButton((button) => {
        button.setButtonText("Add APM Overflow preset").onClick(() => {
          void this.handleAddPreset();
        });
      });
    setting.settingEl.addClass("vault-publisher-entry");
  }

  private async handleAddPreset(): Promise<void> {
    const preset = createApmOverflowPreset();
    await this.vaultPublisher.upsertStaticSiteHost(preset);
    new Notice(`Added preset: ${preset.name}.`);
    this.display();
  }

  private async handleAddHost(): Promise<void> {
    const modal = new StaticSiteHostModal(this.app, null);
    const result = await modal.openAndGetValue();
    if (!result) {
      return;
    }

    await this.vaultPublisher.upsertStaticSiteHost(result.host);
    new Notice(`Added host: ${result.host.name}.`);
    this.display();
  }

  private renderHostEntry(
    sectionEl: HTMLElement,
    host: StaticSiteHostConfig,
  ): void {
    const setting = new Setting(sectionEl);
    setting.settingEl.addClass("vault-publisher-entry");

    setting.nameEl.empty();
    const titleEl = setting.nameEl.createDiv({
      cls: "vault-publisher-entry-title",
    });
    titleEl.createSpan({ cls: "vault-publisher-entry-path", text: host.name });
    titleEl.createSpan({ cls: "vault-publisher-entry-badge", text: host.id });

    setting.descEl.empty();
    const lines: Array<{ label: string; value: string }> = [
      { label: "Repo root", value: host.repoRoot },
      { label: "Site dir", value: host.siteSubdir || "(repo root)" },
      { label: "Template", value: host.templateRelPath },
      { label: "Post path", value: host.postPathTemplate },
      { label: "Remote", value: host.remote },
    ];

    if (host.branch) {
      lines.push({ label: "Branch", value: host.branch });
    }

    if (host.publicBaseUrl) {
      lines.push({ label: "Public URL", value: host.publicBaseUrl });
    }

    const publishes = this.vaultPublisher
      .getConfigStore()
      .getStaticSitePublishesByHost(host.id);
    lines.push({ label: "Published notes", value: String(publishes.length) });

    for (const line of lines) {
      const lineEl = setting.descEl.createDiv({
        cls: "vault-publisher-entry-line",
      });
      lineEl.createSpan({
        cls: "vault-publisher-entry-label",
        text: `${line.label}: `,
      });
      lineEl.createSpan({ text: line.value });
    }

    setting.addButton((button) => {
      button.setButtonText("Edit").onClick(() => {
        void this.handleEditHost(host);
      });
    });

    setting.addButton((button) => {
      button.setButtonText("Delete");
      button.buttonEl.addClass("mod-warning");
      button.onClick(() => {
        void this.handleDeleteHost(host);
      });
    });
  }

  private async handleEditHost(host: StaticSiteHostConfig): Promise<void> {
    const modal = new StaticSiteHostModal(this.app, host);
    const result = await modal.openAndGetValue();
    if (!result) {
      return;
    }

    await this.vaultPublisher.upsertStaticSiteHost({
      ...result.host,
      id: host.id,
    });
    new Notice(`Updated host: ${host.name}.`);
    this.display();
  }

  private async handleDeleteHost(host: StaticSiteHostConfig): Promise<void> {
    const publishes = this.vaultPublisher
      .getConfigStore()
      .getStaticSitePublishesByHost(host.id);
    const suffix =
      publishes.length > 0
        ? ` This will also forget ${publishes.length} published-note record(s), but will not delete files from the static site.`
        : "";
    const confirmed = window.confirm(`Delete host '${host.name}'?${suffix}`);
    if (!confirmed) {
      return;
    }

    await this.vaultPublisher.removeStaticSiteHost(host.id);
    // Prune any publish records tied to this host so the settings list stays consistent.
    const configStore = this.vaultPublisher.getConfigStore();
    for (const publish of publishes) {
      configStore.removeStaticSitePublish(host.id, publish.vaultPath);
    }
    await this.vaultPublisher.saveConfig();

    new Notice(`Removed host: ${host.name}.`);
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

    if (
      entry.sourceKind === "tracked-directory" ||
      entry.sourceKind === "tracked-file"
    ) {
      badges.push("Tracked");
    } else if (entry.sourceKind === "scanned-directory") {
      badges.push("Scanned");
    } else {
      badges.push("Orphan");
    }

    if (
      entry.sourceKind === "tracked-file" ||
      entry.sourceKind === "orphan-mirror"
    ) {
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

  private getEntryLines(
    entry: RepoInventoryEntry,
  ): Array<{ label: string; value: string }> {
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
      value: entry.hasLocalGit
        ? entry.localRepoVaultPath
        : `${entry.localRepoVaultPath} (missing .git)`,
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

    if (
      entry.storedOriginUrl &&
      entry.storedOriginUrl !== entry.liveOriginUrl
    ) {
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
