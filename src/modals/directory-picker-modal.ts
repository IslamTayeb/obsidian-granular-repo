import { App, FuzzySuggestModal } from "obsidian";

export interface PublishTargetItem {
  path: string;
  kind: "file" | "directory";
}

export class DirectoryPickerModal extends FuzzySuggestModal<PublishTargetItem> {
  private readonly options: PublishTargetItem[];

  private readonly defaultPath?: string;

  private resolveSelection?: (value: PublishTargetItem | null) => void;

  private didChoose = false;

  constructor(app: App, options: PublishTargetItem[], defaultPath?: string) {
    super(app);
    this.options = [...options];
    this.defaultPath = defaultPath;

    this.setPlaceholder("Select a file or folder to publish");
    this.setInstructions([
      { command: "Type", purpose: "Search files and folders" },
      { command: "Enter", purpose: "Select target" },
      { command: "Esc", purpose: "Cancel" },
    ]);
  }

  getItems(): PublishTargetItem[] {
    if (!this.defaultPath) {
      return this.options;
    }

    return [...this.options].sort((left, right) => {
      if (left.path === this.defaultPath) {
        return -1;
      }
      if (right.path === this.defaultPath) {
        return 1;
      }
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return left.path.localeCompare(right.path);
    });
  }

  getItemText(item: PublishTargetItem): string {
    const prefix = item.kind === "directory" ? "DIR" : "FILE";
    return `[${prefix}] ${item.path}`;
  }

  onChooseItem(item: PublishTargetItem): void {
    this.didChoose = true;
    this.resolveSelection?.(item);
  }

  onClose(): void {
    super.onClose();

    if (!this.didChoose) {
      this.resolveSelection?.(null);
    }
  }

  openAndGetValue(): Promise<PublishTargetItem | null> {
    return new Promise<PublishTargetItem | null>((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }
}
