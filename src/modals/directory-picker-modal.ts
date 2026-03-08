import { App, FuzzySuggestModal } from "obsidian";

export class DirectoryPickerModal extends FuzzySuggestModal<string> {
  private readonly options: string[];

  private readonly defaultPath?: string;

  private resolveSelection?: (value: string | null) => void;

  private didChoose = false;

  constructor(app: App, options: string[], defaultPath?: string) {
    super(app);
    this.options = [...options];
    this.defaultPath = defaultPath;

    this.setPlaceholder("Select a directory to publish");
    this.setInstructions([
      { command: "Type", purpose: "Search subdirectories" },
      { command: "Enter", purpose: "Select directory" },
      { command: "Esc", purpose: "Cancel" },
    ]);
  }

  onOpen(): void {
    super.onOpen();

    if (this.defaultPath) {
      this.inputEl.value = this.defaultPath;
      this.inputEl.dispatchEvent(new Event("input"));
    }
  }

  getItems(): string[] {
    if (!this.defaultPath) {
      return this.options;
    }

    return [...this.options].sort((left, right) => {
      if (left === this.defaultPath) {
        return -1;
      }
      if (right === this.defaultPath) {
        return 1;
      }
      return left.localeCompare(right);
    });
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string): void {
    this.didChoose = true;
    this.resolveSelection?.(item);
  }

  onClose(): void {
    super.onClose();

    if (!this.didChoose) {
      this.resolveSelection?.(null);
    }
  }

  openAndGetValue(): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }
}
