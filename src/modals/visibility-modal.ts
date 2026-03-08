import { App, ButtonComponent, Modal, Setting } from "obsidian";

import { RepoVisibility } from "../types";

export class VisibilityModal extends Modal {
  private selected: RepoVisibility | null = null;

  private resolveSelection?: (value: RepoVisibility | null) => void;

  private didResolve = false;

  private confirmButton?: ButtonComponent;

  private publicButton?: ButtonComponent;

  private privateButton?: ButtonComponent;

  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Repository Visibility");

    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("p", {
      text: "Choose visibility for this repository.",
    });

    const visibilitySetting = new Setting(contentEl)
      .setName("Visibility")
      .setDesc("Required: pick one option");

    const buttonContainer = visibilitySetting.controlEl.createDiv({
      cls: "vault-publisher-visibility-buttons",
    });

    this.publicButton = new ButtonComponent(buttonContainer)
      .setButtonText("Public")
      .onClick(() => {
        this.selected = "public";
        this.refreshSelectionState();
      });

    this.privateButton = new ButtonComponent(buttonContainer)
      .setButtonText("Private")
      .onClick(() => {
        this.selected = "private";
        this.refreshSelectionState();
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => {
          this.finish(null);
        });
      })
      .addButton((button) => {
        this.confirmButton = button;
        button
          .setCta()
          .setButtonText("Confirm")
          .setDisabled(true)
          .onClick(() => {
            if (!this.selected) {
              return;
            }

            this.finish(this.selected);
          });
      });

    this.refreshSelectionState();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.didResolve) {
      this.resolveSelection?.(null);
    }
  }

  openAndGetValue(): Promise<RepoVisibility | null> {
    return new Promise<RepoVisibility | null>((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }

  private finish(value: RepoVisibility | null): void {
    this.didResolve = true;
    this.resolveSelection?.(value);
    this.close();
  }

  private refreshSelectionState(): void {
    this.confirmButton?.setDisabled(!this.selected);
    this.publicButton?.buttonEl.toggleClass("mod-cta", this.selected === "public");
    this.privateButton?.buttonEl.toggleClass("mod-cta", this.selected === "private");
  }
}
