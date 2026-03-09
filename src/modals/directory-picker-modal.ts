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

  private keydownHandler?: (event: KeyboardEvent) => void;

  constructor(app: App, options: PublishTargetItem[], defaultPath?: string) {
    super(app);
    this.options = [...options];
    this.defaultPath = defaultPath;

    this.setPlaceholder("Select a file or folder to publish");
    this.setInstructions([
      { command: "Type", purpose: "Search files and folders" },
      { command: "Enter/Tab", purpose: "Select target" },
      { command: "Esc", purpose: "Cancel" },
    ]);
  }

  onOpen(): void {
    super.onOpen();
    this.keydownHandler = (event: KeyboardEvent) => {
      if (event.key !== "Tab") {
        return;
      }

      event.preventDefault();
      this.selectActiveSuggestion(event);
    };

    this.inputEl.addEventListener("keydown", this.keydownHandler);
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
    if (this.keydownHandler) {
      this.inputEl.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = undefined;
    }

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
