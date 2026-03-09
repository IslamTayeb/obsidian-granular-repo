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

  private unmatchedQuery?: string;

  private chosenItem?: PublishTargetItem;

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
    this.chosenItem = item;
  }

  onClose(): void {
    if (this.keydownHandler) {
      this.inputEl.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = undefined;
    }

    if (!this.didChoose) {
      const normalizedQuery = this.normalizeQuery(this.inputEl.value);
      if (normalizedQuery) {
        const exactMatch = this.options.find(
          (option) => this.normalizeQuery(option.path) === normalizedQuery,
        );
        if (exactMatch) {
          this.didChoose = true;
          this.resolveSelection?.(exactMatch);
          super.onClose();
          return;
        }

        const prefixMatches = this.options.filter((option) =>
          this.normalizeQuery(option.path).startsWith(normalizedQuery),
        );
        if (prefixMatches.length === 1) {
          this.didChoose = true;
          this.resolveSelection?.(prefixMatches[0]);
          super.onClose();
          return;
        }

        this.unmatchedQuery = normalizedQuery;
      }
    }

    super.onClose();

    if (this.didChoose && this.chosenItem) {
      this.resolveSelection?.(this.chosenItem);
      return;
    }

    this.resolveSelection?.(null);
  }

  openAndGetValue(): Promise<PublishTargetItem | null> {
    return new Promise<PublishTargetItem | null>((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }

  getUnmatchedQuery(): string | undefined {
    return this.unmatchedQuery;
  }

  private normalizeQuery(value: string): string {
    return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "").trim();
  }
}
