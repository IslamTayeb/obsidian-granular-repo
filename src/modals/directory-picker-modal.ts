import { App, FuzzyMatch, FuzzySuggestModal } from "obsidian";

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
    return item.path;
  }

  renderSuggestion(match: FuzzyMatch<PublishTargetItem>, el: HTMLElement): void {
    const item = match.item;
    el.empty();

    const kindLabel = item.kind === "directory" ? "DIR" : "FILE";
    const pathSpan = el.createSpan({ text: item.path });
    pathSpan.addClass("vault-publisher-target-path");

    const kindSpan = el.createSpan({ text: kindLabel });
    kindSpan.addClass("vault-publisher-target-kind");
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
        const resolved = this.resolveQueryToOption(normalizedQuery);
        if (resolved) {
          this.didChoose = true;
          this.resolveSelection?.(resolved);
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

  private normalizeForCompare(value: string): string {
    return this.normalizeQuery(value).toLowerCase();
  }

  private resolveQueryToOption(query: string): PublishTargetItem | null {
    const normalizedQuery = this.normalizeForCompare(query);

    const exactMatch = this.options.find(
      (option) => this.normalizeForCompare(option.path) === normalizedQuery,
    );
    if (exactMatch) {
      return exactMatch;
    }

    const relativeMatch = this.resolveRelativeToDefaultPath(normalizedQuery);
    if (relativeMatch) {
      return relativeMatch;
    }

    const prefixMatches = this.options.filter((option) =>
      this.normalizeForCompare(option.path).startsWith(normalizedQuery),
    );
    const bestPrefixMatch = this.pickBestCandidate(prefixMatches);
    if (bestPrefixMatch) {
      return bestPrefixMatch;
    }

    const basenameMatches = this.options.filter((option) => {
      const normalizedPath = this.normalizeForCompare(option.path);
      const segments = normalizedPath.split("/");
      return segments[segments.length - 1] === normalizedQuery;
    });
    const bestBasenameMatch = this.pickBestCandidate(basenameMatches);
    if (bestBasenameMatch) {
      return bestBasenameMatch;
    }

    const suffixMatches = this.options.filter((option) => {
      const normalizedPath = this.normalizeForCompare(option.path);
      return normalizedPath.endsWith(`/${normalizedQuery}`);
    });
    const bestSuffixMatch = this.pickBestCandidate(suffixMatches);
    if (bestSuffixMatch) {
      return bestSuffixMatch;
    }

    return null;
  }

  private resolveRelativeToDefaultPath(normalizedQuery: string): PublishTargetItem | null {
    const defaultDirectory = this.getDefaultDirectory();
    if (!defaultDirectory) {
      return null;
    }

    const candidatePath = `${defaultDirectory}/${normalizedQuery}`.replace(/\/+/g, "/");
    const candidateMatch = this.options.find(
      (option) => this.normalizeForCompare(option.path) === this.normalizeForCompare(candidatePath),
    );
    return candidateMatch ?? null;
  }

  private getDefaultDirectory(): string | null {
    if (!this.defaultPath) {
      return null;
    }

    const defaultPathNormalized = this.normalizeQuery(this.defaultPath);
    const defaultOption = this.options.find(
      (option) => this.normalizeForCompare(option.path) === this.normalizeForCompare(defaultPathNormalized),
    );

    if (defaultOption?.kind === "file") {
      const segments = defaultPathNormalized.split("/");
      const parentDirectory = segments.slice(0, -1).join("/");
      return parentDirectory || null;
    }

    return defaultPathNormalized || null;
  }

  private pickBestCandidate(candidates: PublishTargetItem[]): PublishTargetItem | null {
    if (candidates.length === 1) {
      return candidates[0];
    }

    if (candidates.length === 0) {
      return null;
    }

    const defaultDirectory = this.getDefaultDirectory();
    if (!defaultDirectory) {
      return null;
    }

    const ranked = [...candidates]
      .map((candidate) => ({
        candidate,
        distance: this.computePathDistance(candidate.path, defaultDirectory),
      }))
      .sort((left, right) => {
        if (left.distance !== right.distance) {
          return left.distance - right.distance;
        }

        if (left.candidate.kind !== right.candidate.kind) {
          return left.candidate.kind === "directory" ? -1 : 1;
        }

        return left.candidate.path.localeCompare(right.candidate.path);
      });

    if (ranked.length > 1 && ranked[0].distance === ranked[1].distance) {
      return null;
    }

    return ranked[0].candidate;
  }

  private computePathDistance(leftPath: string, rightPath: string): number {
    const leftSegments = this.normalizeForCompare(leftPath).split("/").filter((segment) => segment.length > 0);
    const rightSegments = this.normalizeForCompare(rightPath).split("/").filter((segment) => segment.length > 0);

    let commonPrefixLength = 0;
    const minLength = Math.min(leftSegments.length, rightSegments.length);

    while (
      commonPrefixLength < minLength &&
      leftSegments[commonPrefixLength] === rightSegments[commonPrefixLength]
    ) {
      commonPrefixLength += 1;
    }

    return (
      (leftSegments.length - commonPrefixLength) +
      (rightSegments.length - commonPrefixLength)
    );
  }
}
