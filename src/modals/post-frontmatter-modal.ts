import {
  App,
  Modal,
  Notice,
  Setting,
  TextAreaComponent,
  TextComponent,
} from "obsidian";

import { StaticSiteHostConfig } from "../types";
import { isValidSlug, sanitizeSlug } from "../utils/slug";

export interface PostFrontmatterModalValues {
  title: string;
  slug: string;
  date: string;
  description: string;
  hostId?: string;
}

export interface PostFrontmatterModalResult {
  values: PostFrontmatterModalValues;
  persistToNote: boolean;
}

export interface PostFrontmatterModalOptions {
  hosts: StaticSiteHostConfig[];
  defaults: PostFrontmatterModalValues;
  noteBasename: string;
}

export class PostFrontmatterModal extends Modal {
  private readonly options: PostFrontmatterModalOptions;

  private working: PostFrontmatterModalValues;

  private persistToNote = true;

  private resolveResult?: (value: PostFrontmatterModalResult | null) => void;

  private didResolve = false;

  private slugEdited: boolean;

  constructor(app: App, options: PostFrontmatterModalOptions) {
    super(app);
    this.options = options;
    this.working = { ...options.defaults };
    // If the default slug matches what we'd compute from the default title,
    // treat it as auto-synced (so editing the title keeps updating the slug).
    this.slugEdited =
      sanitizeSlug(options.defaults.title) !== options.defaults.slug;
  }

  onOpen(): void {
    this.titleEl.setText(
      `Publish to Static Site — ${this.options.noteBasename}`,
    );

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vault-publisher-settings");

    contentEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Review the post metadata. Defaults are filled in from the filename and first paragraph. Saving persists these fields as YAML frontmatter at the top of your note.",
    });

    let slugInput: TextComponent | null = null;

    new Setting(contentEl)
      .setName("Title")
      .setDesc("Displayed as the post heading and <title>.")
      .addText((text) => {
        text.setValue(this.working.title);
        text.inputEl.style.width = "100%";
        text.onChange((value) => {
          this.working.title = value;
          if (!this.slugEdited) {
            const derived = sanitizeSlug(value);
            this.working.slug = derived;
            slugInput?.setValue(derived);
          }
        });
      });

    new Setting(contentEl)
      .setName("Slug")
      .setDesc(
        "URL segment. Lowercase letters, numbers, and dashes only. Reserved names (blog, feed, static, assets, public) are not allowed.",
      )
      .addText((text) => {
        slugInput = text;
        text.setValue(this.working.slug);
        text.inputEl.style.width = "100%";
        text.onChange((value) => {
          this.slugEdited = true;
          this.working.slug = value;
        });
      });

    new Setting(contentEl)
      .setName("Date")
      .setDesc(
        "Accepts YYYY-MM-DD or YYYY-MM-DDTHH:MMZ. Appears in the post's <time> element.",
      )
      .addText((text) => {
        text.setValue(this.working.date);
        text.inputEl.style.width = "100%";
        text.onChange((value) => {
          this.working.date = value;
        });
      });

    new Setting(contentEl)
      .setName("Description")
      .setDesc(
        "Short summary used in <meta> tags. Keep it under ~200 characters for social previews.",
      )
      .addTextArea((textarea: TextAreaComponent) => {
        textarea.setValue(this.working.description);
        textarea.inputEl.rows = 3;
        textarea.inputEl.style.width = "100%";
        textarea.onChange((value) => {
          this.working.description = value;
        });
      });

    if (this.options.hosts.length > 1) {
      new Setting(contentEl)
        .setName("Host")
        .setDesc("Which static site host to publish to.")
        .addDropdown((dropdown) => {
          for (const host of this.options.hosts) {
            dropdown.addOption(host.id, `${host.name} (${host.id})`);
          }
          const initial =
            this.working.hostId &&
            this.options.hosts.some((h) => h.id === this.working.hostId)
              ? this.working.hostId
              : this.options.hosts[0].id;
          this.working.hostId = initial;
          dropdown.setValue(initial);
          dropdown.onChange((value) => {
            this.working.hostId = value;
          });
        });
    }

    new Setting(contentEl)
      .setName("Write frontmatter back to the note")
      .setDesc(
        "Recommended. Inserts these fields as YAML frontmatter so they persist for future edits.",
      )
      .addToggle((toggle) => {
        toggle.setValue(this.persistToNote);
        toggle.onChange((value) => {
          this.persistToNote = value;
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Cancel").onClick(() => {
          this.finish(null);
        });
      })
      .addButton((button) => {
        button
          .setCta()
          .setButtonText("Publish")
          .onClick(() => {
            const error = this.validate();
            if (error) {
              new Notice(error, 8000);
              return;
            }
            this.finish({
              values: {
                ...this.working,
                slug: sanitizeSlug(this.working.slug),
              },
              persistToNote: this.persistToNote,
            });
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.didResolve) {
      this.resolveResult?.(null);
    }
  }

  openAndGetValue(): Promise<PostFrontmatterModalResult | null> {
    return new Promise((resolve) => {
      this.resolveResult = resolve;
      this.open();
    });
  }

  private finish(value: PostFrontmatterModalResult | null): void {
    this.didResolve = true;
    this.resolveResult?.(value);
    this.close();
  }

  private validate(): string | null {
    if (!this.working.title.trim()) {
      return "Title is required.";
    }
    const slug = sanitizeSlug(this.working.slug);
    if (!isValidSlug(slug)) {
      return `Slug '${this.working.slug}' is invalid. Use lowercase letters, numbers, and dashes; avoid reserved names.`;
    }
    if (!this.working.date.trim()) {
      return "Date is required.";
    }
    if (!this.working.description.trim()) {
      return "Description is required.";
    }
    return null;
  }
}
