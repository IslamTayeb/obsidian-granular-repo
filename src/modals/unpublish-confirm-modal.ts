import { App, Modal, Setting } from "obsidian";

import { RepoInventoryEntry } from "../types";

export class UnpublishConfirmModal extends Modal {
  private readonly entry: RepoInventoryEntry;

  private resolveSelection?: (value: boolean) => void;

  private didResolve = false;

  constructor(app: App, entry: RepoInventoryEntry) {
    super(app);
    this.entry = entry;
  }

  onOpen(): void {
    this.titleEl.setText("Unpublish Repository");

    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("p", {
      text: "This removes the GitHub repository and local Git repo state, but keeps your vault content.",
    });

    const details = contentEl.createEl("ul", { cls: "vault-publisher-confirm-list" });
    details.createEl("li", {
      text: `Target: ${this.getTargetLabel()}`,
    });
    details.createEl("li", {
      text: `GitHub repo: ${this.entry.githubRepoSlug ?? "Unknown"}`,
    });
    details.createEl("li", {
      text: this.getLocalCleanupLabel(),
    });
    details.createEl("li", {
      text: this.getKeptContentLabel(),
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => {
          this.finish(false);
        });
      })
      .addButton((button) => {
        button
          .setButtonText("Unpublish")
          .onClick(() => {
            this.finish(true);
          });
        button.buttonEl.addClass("mod-warning");
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.didResolve) {
      this.resolveSelection?.(false);
    }
  }

  openAndConfirm(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }

  private finish(value: boolean): void {
    this.didResolve = true;
    this.resolveSelection?.(value);
    this.close();
  }

  private getTargetLabel(): string {
    if (this.entry.sourceKind === "tracked-file") {
      return `File ${this.entry.vaultPath}`;
    }

    if (this.entry.sourceKind === "orphan-mirror") {
      return `Mirror ${this.entry.localRepoVaultPath}`;
    }

    return `Directory ${this.entry.vaultPath}`;
  }

  private getLocalCleanupLabel(): string {
    if (this.entry.sourceKind === "tracked-directory" || this.entry.sourceKind === "scanned-directory") {
      return `Local cleanup: remove only ${this.entry.localRepoVaultPath}/.git`;
    }

    return `Local cleanup: delete mirror directory ${this.entry.localRepoVaultPath}`;
  }

  private getKeptContentLabel(): string {
    if (this.entry.sourceKind === "tracked-file") {
      return `Keeps source file ${this.entry.vaultPath}`;
    }

    if (this.entry.sourceKind === "orphan-mirror") {
      return "Keeps the rest of the vault unchanged";
    }

    return `Keeps directory contents in ${this.entry.vaultPath}`;
  }
}
