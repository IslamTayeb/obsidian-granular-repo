import { App, Modal, Setting } from "obsidian";

import { StaticSiteHostConfig, StaticSitePublishRecord } from "../types";

export class StaticSiteUnpublishConfirmModal extends Modal {
  private readonly host: StaticSiteHostConfig;

  private readonly record: StaticSitePublishRecord;

  private resolveSelection?: (value: boolean) => void;

  private didResolve = false;

  constructor(
    app: App,
    host: StaticSiteHostConfig,
    record: StaticSitePublishRecord,
  ) {
    super(app);
    this.host = host;
    this.record = record;
  }

  onOpen(): void {
    this.titleEl.setText(`Unpublish from ${this.host.name}`);

    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("p", {
      text: "This deletes the post directory from the static site and pushes the removal to GitHub.",
    });

    const details = contentEl.createEl("ul", {
      cls: "vault-publisher-confirm-list",
    });
    details.createEl("li", { text: `Host: ${this.host.name}` });
    details.createEl("li", { text: `Source note: ${this.record.vaultPath}` });
    details.createEl("li", { text: `Slug: ${this.record.slug}` });
    details.createEl("li", {
      text: `Will delete: ${this.host.siteSubdir.replace(/^\/+|\/+$/g, "")}/${this.record.slug}/`,
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => {
          this.finish(false);
        });
      })
      .addButton((button) => {
        button.setButtonText("Unpublish").onClick(() => {
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
}
