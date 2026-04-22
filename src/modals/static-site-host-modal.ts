import { App, Modal, Notice, Setting, TextComponent } from "obsidian";

import { StaticSiteHostConfig } from "../types";

export interface StaticSiteHostModalResult {
  host: StaticSiteHostConfig;
}

function generateHostId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return slug ? `${slug}-${random}` : `host-${random}`;
}

function cloneHost(host: StaticSiteHostConfig): StaticSiteHostConfig {
  return {
    ...host,
    tokens: { ...host.tokens },
  };
}

export class StaticSiteHostModal extends Modal {
  private readonly isNew: boolean;

  private working: StaticSiteHostConfig;

  private resolveResult?: (value: StaticSiteHostModalResult | null) => void;

  private didResolve = false;

  constructor(app: App, initial: StaticSiteHostConfig | null) {
    super(app);
    this.isNew = initial === null;
    this.working = initial
      ? cloneHost(initial)
      : {
          id: "",
          name: "",
          repoRoot: "",
          siteSubdir: "",
          postPathTemplate: "{slug}/index.html",
          templateRelPath: "_template.html",
          contentMarker: "<p>Article content...</p>",
          tokens: {
            title: "POST_TITLE",
            slug: "POST_SLUG",
            description: "POST_DESCRIPTION",
            dateIso: "YYYY-MM-DDTHH:MMZ",
            dateDisplay: "Mon DD, YYYY",
          },
          commitMessagePublish: "static-site: publish {slug}",
          commitMessageUnpublish: "static-site: unpublish {slug}",
          remote: "origin",
          branch: undefined,
          publicBaseUrl: undefined,
        };
  }

  onOpen(): void {
    this.titleEl.setText(
      this.isNew ? "Add Static Site Host" : "Edit Static Site Host",
    );

    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vault-publisher-settings");

    contentEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Configure a static site host. The plugin writes rendered HTML into <repo root>/<site subdirectory>/<post path>, then commits and pushes only the files it wrote.",
    });

    this.addTextSetting(contentEl, {
      name: "Display name",
      desc: "Shown in pickers and settings.",
      placeholder: "APM Overflow",
      value: this.working.name,
      onChange: (value) => {
        this.working.name = value;
      },
    });

    this.addTextSetting(contentEl, {
      name: "Repo root (absolute path)",
      desc: "Path to the git worktree root on disk.",
      placeholder: "/Users/you/Documents/GitHub/your-site",
      value: this.working.repoRoot,
      onChange: (value) => {
        this.working.repoRoot = value.trim();
      },
    });

    this.addTextSetting(contentEl, {
      name: "Site subdirectory",
      desc: "Relative path from repo root where posts live. Leave empty if posts live at the root.",
      placeholder: "apmoverflow",
      value: this.working.siteSubdir,
      onChange: (value) => {
        this.working.siteSubdir = value.trim();
      },
    });

    this.addTextSetting(contentEl, {
      name: "Post path template",
      desc: "Relative path inside the site subdirectory. Use {slug} for the post slug.",
      placeholder: "{slug}/index.html",
      value: this.working.postPathTemplate,
      onChange: (value) => {
        this.working.postPathTemplate = value.trim();
      },
    });

    this.addTextSetting(contentEl, {
      name: "Template file",
      desc: "Relative path inside the site subdirectory to the HTML template.",
      placeholder: "_template.html",
      value: this.working.templateRelPath,
      onChange: (value) => {
        this.working.templateRelPath = value.trim();
      },
    });

    this.addTextSetting(contentEl, {
      name: "Content marker",
      desc: "String in the template that will be replaced with the rendered Markdown body.",
      placeholder: "<p>Article content...</p>",
      value: this.working.contentMarker,
      onChange: (value) => {
        this.working.contentMarker = value;
      },
    });

    contentEl.createEl("h4", { text: "Template tokens" });
    contentEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Strings in your template that will be replaced on publish. Every occurrence of each token is substituted, so pick values that will not collide with real text.",
    });

    this.addTextSetting(contentEl, {
      name: "Title token",
      desc: "Replaced with the post's frontmatter `title` (HTML-escaped).",
      placeholder: "POST_TITLE",
      value: this.working.tokens.title,
      onChange: (value) => {
        this.working.tokens.title = value;
      },
    });

    this.addTextSetting(contentEl, {
      name: "Slug token",
      desc: "Replaced with the post slug (used inside URLs).",
      placeholder: "POST_SLUG",
      value: this.working.tokens.slug,
      onChange: (value) => {
        this.working.tokens.slug = value;
      },
    });

    this.addTextSetting(contentEl, {
      name: "Description token",
      desc: "Replaced with the post description (HTML-escaped).",
      placeholder: "POST_DESCRIPTION",
      value: this.working.tokens.description,
      onChange: (value) => {
        this.working.tokens.description = value;
      },
    });

    this.addTextSetting(contentEl, {
      name: "Date token (ISO)",
      desc: "Replaced with ISO datetime like 2026-03-18T18:25Z.",
      placeholder: "YYYY-MM-DDTHH:MMZ",
      value: this.working.tokens.dateIso,
      onChange: (value) => {
        this.working.tokens.dateIso = value;
      },
    });

    this.addTextSetting(contentEl, {
      name: "Date token (display)",
      desc: "Replaced with human-readable date like Mar 18, 2026.",
      placeholder: "Mon DD, YYYY",
      value: this.working.tokens.dateDisplay,
      onChange: (value) => {
        this.working.tokens.dateDisplay = value;
      },
    });

    contentEl.createEl("h4", { text: "Git" });

    this.addTextSetting(contentEl, {
      name: "Remote",
      desc: "Git remote to push to.",
      placeholder: "origin",
      value: this.working.remote,
      onChange: (value) => {
        this.working.remote = value.trim() || "origin";
      },
    });

    this.addTextSetting(contentEl, {
      name: "Branch (optional)",
      desc: "Leave empty to use the currently checked-out branch at publish time.",
      placeholder: "main",
      value: this.working.branch ?? "",
      onChange: (value) => {
        this.working.branch = value.trim() || undefined;
      },
    });

    this.addTextSetting(contentEl, {
      name: "Publish commit message template",
      desc: "Use {slug}, {title}, or {vaultPath} as placeholders.",
      placeholder: "apmoverflow: publish {slug}",
      value: this.working.commitMessagePublish,
      onChange: (value) => {
        this.working.commitMessagePublish = value;
      },
    });

    this.addTextSetting(contentEl, {
      name: "Unpublish commit message template",
      desc: "Same placeholders as publish.",
      placeholder: "apmoverflow: unpublish {slug}",
      value: this.working.commitMessageUnpublish,
      onChange: (value) => {
        this.working.commitMessageUnpublish = value;
      },
    });

    this.addTextSetting(contentEl, {
      name: "Public base URL (optional)",
      desc: "If set, the plugin will show a clickable URL after publish. e.g. https://apmoverflow.xyz",
      placeholder: "https://yoursite.example",
      value: this.working.publicBaseUrl ?? "",
      onChange: (value) => {
        this.working.publicBaseUrl = value.trim() || undefined;
      },
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
          .setButtonText(this.isNew ? "Add host" : "Save")
          .onClick(() => {
            const validationError = this.validate();
            if (validationError) {
              new Notice(validationError, 8000);
              return;
            }

            if (!this.working.id) {
              this.working.id = generateHostId(this.working.name);
            }

            this.finish({ host: cloneHost(this.working) });
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.didResolve) {
      this.resolveResult?.(null);
    }
  }

  openAndGetValue(): Promise<StaticSiteHostModalResult | null> {
    return new Promise((resolve) => {
      this.resolveResult = resolve;
      this.open();
    });
  }

  private finish(value: StaticSiteHostModalResult | null): void {
    this.didResolve = true;
    this.resolveResult?.(value);
    this.close();
  }

  private addTextSetting(
    containerEl: HTMLElement,
    options: {
      name: string;
      desc: string;
      placeholder: string;
      value: string;
      onChange: (value: string) => void;
    },
  ): void {
    new Setting(containerEl)
      .setName(options.name)
      .setDesc(options.desc)
      .addText((text: TextComponent) => {
        text.setPlaceholder(options.placeholder);
        text.setValue(options.value);
        text.onChange((value) => {
          options.onChange(value);
        });
        text.inputEl.style.width = "100%";
      });
  }

  private validate(): string | null {
    if (!this.working.name.trim()) {
      return "Display name is required.";
    }
    if (!this.working.repoRoot.trim()) {
      return "Repo root is required.";
    }
    if (!this.working.postPathTemplate.includes("{slug}")) {
      return "Post path template must include {slug}.";
    }
    if (!this.working.templateRelPath.trim()) {
      return "Template file path is required.";
    }
    if (!this.working.contentMarker.trim()) {
      return "Content marker is required.";
    }
    if (!this.working.tokens.title.trim()) {
      return "Title token is required.";
    }
    if (!this.working.tokens.slug.trim()) {
      return "Slug token is required.";
    }
    if (!this.working.tokens.description.trim()) {
      return "Description token is required.";
    }
    if (!this.working.tokens.dateIso.trim()) {
      return "Date token (ISO) is required.";
    }
    if (!this.working.tokens.dateDisplay.trim()) {
      return "Date token (display) is required.";
    }
    if (!this.working.remote.trim()) {
      return "Remote is required (e.g. origin).";
    }

    return null;
  }
}
