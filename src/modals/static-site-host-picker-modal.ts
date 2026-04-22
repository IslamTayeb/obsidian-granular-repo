import { App, FuzzySuggestModal } from "obsidian";

import { StaticSiteHostConfig } from "../types";

export class StaticSiteHostPickerModal extends FuzzySuggestModal<StaticSiteHostConfig> {
  private readonly hosts: StaticSiteHostConfig[];

  private resolveSelection?: (value: StaticSiteHostConfig | null) => void;

  private didChoose = false;

  constructor(app: App, hosts: StaticSiteHostConfig[]) {
    super(app);
    this.hosts = [...hosts];
    this.setPlaceholder("Select a static site host");
    this.setInstructions([
      { command: "Type", purpose: "Search hosts" },
      { command: "Enter", purpose: "Select host" },
      { command: "Esc", purpose: "Cancel" },
    ]);
  }

  getItems(): StaticSiteHostConfig[] {
    return this.hosts;
  }

  getItemText(item: StaticSiteHostConfig): string {
    return `${item.name} (${item.id})`;
  }

  onChooseItem(item: StaticSiteHostConfig): void {
    this.didChoose = true;
    this.resolveSelection?.(item);
  }

  onClose(): void {
    super.onClose();
    if (!this.didChoose) {
      this.resolveSelection?.(null);
    }
  }

  openAndGetValue(): Promise<StaticSiteHostConfig | null> {
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }
}
