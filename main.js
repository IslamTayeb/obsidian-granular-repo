"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);

// src/plugin.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_promises4 = __toESM(require("node:fs/promises"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);
var import_obsidian9 = require("obsidian");

// src/constants.ts
var MIRROR_ROOT = ".obsidian/plugins/vault-publisher/mirrors";

// src/modals/directory-picker-modal.ts
var import_obsidian = require("obsidian");
var DirectoryPickerModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, options, defaultPath) {
    super(app);
    this.didChoose = false;
    this.options = [...options];
    this.defaultPath = defaultPath;
    this.setPlaceholder("Select a file or folder to publish");
    this.setInstructions([
      { command: "Type", purpose: "Search files and folders" },
      { command: "Enter/Tab", purpose: "Select target" },
      { command: "Esc", purpose: "Cancel" }
    ]);
  }
  onOpen() {
    super.onOpen();
    this.keydownHandler = (event) => {
      if (event.key !== "Tab") {
        return;
      }
      event.preventDefault();
      this.selectActiveSuggestion(event);
    };
    this.inputEl.addEventListener("keydown", this.keydownHandler);
  }
  getItems() {
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
  getItemText(item) {
    return item.path;
  }
  renderSuggestion(match, el) {
    const item = match.item;
    el.empty();
    const kindLabel = item.kind === "directory" ? "DIR" : "FILE";
    const pathSpan = el.createSpan({ text: item.path });
    pathSpan.addClass("vault-publisher-target-path");
    const kindSpan = el.createSpan({ text: kindLabel });
    kindSpan.addClass("vault-publisher-target-kind");
  }
  onChooseItem(item) {
    this.didChoose = true;
    this.chosenItem = item;
  }
  onClose() {
    if (this.keydownHandler) {
      this.inputEl.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = void 0;
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
  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }
  getUnmatchedQuery() {
    return this.unmatchedQuery;
  }
  normalizeQuery(value) {
    return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "").trim();
  }
  normalizeForCompare(value) {
    return this.normalizeQuery(value).toLowerCase();
  }
  resolveQueryToOption(query) {
    const normalizedQuery = this.normalizeForCompare(query);
    const exactMatch = this.options.find(
      (option) => this.normalizeForCompare(option.path) === normalizedQuery
    );
    if (exactMatch) {
      return exactMatch;
    }
    const relativeMatch = this.resolveRelativeToDefaultPath(normalizedQuery);
    if (relativeMatch) {
      return relativeMatch;
    }
    const prefixMatches = this.options.filter(
      (option) => this.normalizeForCompare(option.path).startsWith(normalizedQuery)
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
  resolveRelativeToDefaultPath(normalizedQuery) {
    const defaultDirectory = this.getDefaultDirectory();
    if (!defaultDirectory) {
      return null;
    }
    const candidatePath = `${defaultDirectory}/${normalizedQuery}`.replace(/\/+/g, "/");
    const candidateMatch = this.options.find(
      (option) => this.normalizeForCompare(option.path) === this.normalizeForCompare(candidatePath)
    );
    return candidateMatch ?? null;
  }
  getDefaultDirectory() {
    if (!this.defaultPath) {
      return null;
    }
    const defaultPathNormalized = this.normalizeQuery(this.defaultPath);
    const defaultOption = this.options.find(
      (option) => this.normalizeForCompare(option.path) === this.normalizeForCompare(defaultPathNormalized)
    );
    if (defaultOption?.kind === "file") {
      const segments = defaultPathNormalized.split("/");
      const parentDirectory = segments.slice(0, -1).join("/");
      return parentDirectory || null;
    }
    return defaultPathNormalized || null;
  }
  pickBestCandidate(candidates) {
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
    const ranked = [...candidates].map((candidate) => ({
      candidate,
      distance: this.computePathDistance(candidate.path, defaultDirectory)
    })).sort((left, right) => {
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
  computePathDistance(leftPath, rightPath) {
    const leftSegments = this.normalizeForCompare(leftPath).split("/").filter((segment) => segment.length > 0);
    const rightSegments = this.normalizeForCompare(rightPath).split("/").filter((segment) => segment.length > 0);
    let commonPrefixLength = 0;
    const minLength = Math.min(leftSegments.length, rightSegments.length);
    while (commonPrefixLength < minLength && leftSegments[commonPrefixLength] === rightSegments[commonPrefixLength]) {
      commonPrefixLength += 1;
    }
    return leftSegments.length - commonPrefixLength + (rightSegments.length - commonPrefixLength);
  }
};

// src/modals/post-frontmatter-modal.ts
var import_obsidian2 = require("obsidian");

// src/utils/slug.ts
var RESERVED_SLUGS = /* @__PURE__ */ new Set(["blog", "feed", "static", "assets", "public"]);
function sanitizeSlug(input) {
  const lowered = input.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const dashed = lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return dashed;
}
function isReservedSlug(slug) {
  return RESERVED_SLUGS.has(slug);
}
function isValidSlug(slug) {
  if (slug.length === 0 || slug.length > 120) {
    return false;
  }
  if (isReservedSlug(slug)) {
    return false;
  }
  return /^[a-z0-9][a-z0-9-]*$/.test(slug);
}

// src/modals/post-frontmatter-modal.ts
var PostFrontmatterModal = class extends import_obsidian2.Modal {
  constructor(app, options) {
    super(app);
    this.persistToNote = true;
    this.didResolve = false;
    this.options = options;
    this.working = { ...options.defaults };
    this.slugEdited = sanitizeSlug(options.defaults.title) !== options.defaults.slug;
  }
  onOpen() {
    this.titleEl.setText(
      `Publish to Static Site \u2014 ${this.options.noteBasename}`
    );
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vault-publisher-settings");
    contentEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Review the post metadata. Defaults are filled in from the filename and first paragraph. Saving persists these fields as YAML frontmatter at the top of your note."
    });
    let slugInput = null;
    new import_obsidian2.Setting(contentEl).setName("Title").setDesc("Displayed as the post heading and <title>.").addText((text) => {
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
    new import_obsidian2.Setting(contentEl).setName("Slug").setDesc(
      "URL segment. Lowercase letters, numbers, and dashes only. Reserved names (blog, feed, static, assets, public) are not allowed."
    ).addText((text) => {
      slugInput = text;
      text.setValue(this.working.slug);
      text.inputEl.style.width = "100%";
      text.onChange((value) => {
        this.slugEdited = true;
        this.working.slug = value;
      });
    });
    new import_obsidian2.Setting(contentEl).setName("Date").setDesc(
      "Accepts YYYY-MM-DD or YYYY-MM-DDTHH:MMZ. Appears in the post's <time> element."
    ).addText((text) => {
      text.setValue(this.working.date);
      text.inputEl.style.width = "100%";
      text.onChange((value) => {
        this.working.date = value;
      });
    });
    new import_obsidian2.Setting(contentEl).setName("Description").setDesc(
      "Short summary used in <meta> tags. Keep it under ~200 characters for social previews."
    ).addTextArea((textarea) => {
      textarea.setValue(this.working.description);
      textarea.inputEl.rows = 3;
      textarea.inputEl.style.width = "100%";
      textarea.onChange((value) => {
        this.working.description = value;
      });
    });
    if (this.options.hosts.length > 1) {
      new import_obsidian2.Setting(contentEl).setName("Host").setDesc("Which static site host to publish to.").addDropdown((dropdown) => {
        for (const host of this.options.hosts) {
          dropdown.addOption(host.id, `${host.name} (${host.id})`);
        }
        const initial = this.working.hostId && this.options.hosts.some((h) => h.id === this.working.hostId) ? this.working.hostId : this.options.hosts[0].id;
        this.working.hostId = initial;
        dropdown.setValue(initial);
        dropdown.onChange((value) => {
          this.working.hostId = value;
        });
      });
    }
    new import_obsidian2.Setting(contentEl).setName("Write frontmatter back to the note").setDesc(
      "Recommended. Inserts these fields as YAML frontmatter so they persist for future edits."
    ).addToggle((toggle) => {
      toggle.setValue(this.persistToNote);
      toggle.onChange((value) => {
        this.persistToNote = value;
      });
    });
    new import_obsidian2.Setting(contentEl).addButton((button) => {
      button.setButtonText("Cancel").onClick(() => {
        this.finish(null);
      });
    }).addButton((button) => {
      button.setCta().setButtonText("Publish").onClick(() => {
        const error = this.validate();
        if (error) {
          new import_obsidian2.Notice(error, 8e3);
          return;
        }
        this.finish({
          values: {
            ...this.working,
            slug: sanitizeSlug(this.working.slug)
          },
          persistToNote: this.persistToNote
        });
      });
    });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.didResolve) {
      this.resolveResult?.(null);
    }
  }
  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolveResult = resolve;
      this.open();
    });
  }
  finish(value) {
    this.didResolve = true;
    this.resolveResult?.(value);
    this.close();
  }
  validate() {
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
};

// src/modals/static-site-host-picker-modal.ts
var import_obsidian3 = require("obsidian");
var StaticSiteHostPickerModal = class extends import_obsidian3.FuzzySuggestModal {
  constructor(app, hosts) {
    super(app);
    this.didChoose = false;
    this.hosts = [...hosts];
    this.setPlaceholder("Select a static site host");
    this.setInstructions([
      { command: "Type", purpose: "Search hosts" },
      { command: "Enter", purpose: "Select host" },
      { command: "Esc", purpose: "Cancel" }
    ]);
  }
  getItems() {
    return this.hosts;
  }
  getItemText(item) {
    return `${item.name} (${item.id})`;
  }
  onChooseItem(item) {
    this.didChoose = true;
    this.resolveSelection?.(item);
  }
  onClose() {
    super.onClose();
    if (!this.didChoose) {
      this.resolveSelection?.(null);
    }
  }
  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }
};

// src/modals/static-site-unpublish-confirm-modal.ts
var import_obsidian4 = require("obsidian");
var StaticSiteUnpublishConfirmModal = class extends import_obsidian4.Modal {
  constructor(app, host, record) {
    super(app);
    this.didResolve = false;
    this.host = host;
    this.record = record;
  }
  onOpen() {
    this.titleEl.setText(`Unpublish from ${this.host.name}`);
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", {
      text: "This deletes the post directory from the static site and pushes the removal to GitHub."
    });
    const details = contentEl.createEl("ul", {
      cls: "vault-publisher-confirm-list"
    });
    details.createEl("li", { text: `Host: ${this.host.name}` });
    details.createEl("li", { text: `Source note: ${this.record.vaultPath}` });
    details.createEl("li", { text: `Slug: ${this.record.slug}` });
    details.createEl("li", {
      text: `Will delete: ${this.host.siteSubdir.replace(/^\/+|\/+$/g, "")}/${this.record.slug}/`
    });
    new import_obsidian4.Setting(contentEl).addButton((button) => {
      button.setButtonText("Cancel").onClick(() => {
        this.finish(false);
      });
    }).addButton((button) => {
      button.setButtonText("Unpublish").onClick(() => {
        this.finish(true);
      });
      button.buttonEl.addClass("mod-warning");
    });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.didResolve) {
      this.resolveSelection?.(false);
    }
  }
  openAndConfirm() {
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }
  finish(value) {
    this.didResolve = true;
    this.resolveSelection?.(value);
    this.close();
  }
};

// src/modals/visibility-modal.ts
var import_obsidian5 = require("obsidian");
var VisibilityModal = class extends import_obsidian5.Modal {
  constructor(app) {
    super(app);
    this.selected = null;
    this.didResolve = false;
  }
  onOpen() {
    this.titleEl.setText("Repository Visibility");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", {
      text: "Choose visibility for this repository."
    });
    const visibilitySetting = new import_obsidian5.Setting(contentEl).setName("Visibility").setDesc("Required: pick one option");
    const buttonContainer = visibilitySetting.controlEl.createDiv({
      cls: "vault-publisher-visibility-buttons"
    });
    this.publicButton = new import_obsidian5.ButtonComponent(buttonContainer).setButtonText("Public").onClick(() => {
      this.selected = "public";
      this.refreshSelectionState();
    });
    this.privateButton = new import_obsidian5.ButtonComponent(buttonContainer).setButtonText("Private").onClick(() => {
      this.selected = "private";
      this.refreshSelectionState();
    });
    new import_obsidian5.Setting(contentEl).addButton((button) => {
      button.setButtonText("Cancel").onClick(() => {
        this.finish(null);
      });
    }).addButton((button) => {
      this.confirmButton = button;
      button.setCta().setButtonText("Confirm").setDisabled(true).onClick(() => {
        if (!this.selected) {
          return;
        }
        this.finish(this.selected);
      });
    });
    this.refreshSelectionState();
  }
  onClose() {
    this.contentEl.empty();
    if (!this.didResolve) {
      this.resolveSelection?.(null);
    }
  }
  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }
  finish(value) {
    this.didResolve = true;
    this.resolveSelection?.(value);
    this.close();
  }
  refreshSelectionState() {
    this.confirmButton?.setDisabled(!this.selected);
    this.publicButton?.buttonEl.toggleClass("mod-cta", this.selected === "public");
    this.privateButton?.buttonEl.toggleClass("mod-cta", this.selected === "private");
  }
};

// src/utils/path-utils.ts
var import_node_path = __toESM(require("node:path"), 1);
function normalizeVaultPath(input) {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "").trim();
  return normalized;
}
function isVaultRoot(vaultPath) {
  return normalizeVaultPath(vaultPath).length === 0;
}
function folderNameFromVaultPath(vaultPath) {
  const normalized = normalizeVaultPath(vaultPath);
  if (!normalized) {
    return "vault";
  }
  return import_node_path.default.posix.basename(normalized);
}
function fileStemFromVaultPath(vaultPath) {
  const fileName = folderNameFromVaultPath(vaultPath);
  const extension = import_node_path.default.posix.extname(fileName);
  if (!extension) {
    return fileName;
  }
  return fileName.slice(0, -extension.length);
}
function ensureInsideVault(vaultBasePath, absoluteTargetPath) {
  const relative = import_node_path.default.relative(vaultBasePath, absoluteTargetPath);
  return relative === "" || !relative.startsWith("..") && !import_node_path.default.isAbsolute(relative);
}
function absolutePathForVaultPath(vaultBasePath, vaultPath) {
  return import_node_path.default.resolve(vaultBasePath, normalizeVaultPath(vaultPath));
}

// src/services/config-store.ts
function isLegacyRecord(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return typeof candidate.vaultPath === "string" && typeof candidate.repoName === "string" && (candidate.visibility === "public" || candidate.visibility === "private") && typeof candidate.lastPushed === "string";
}
function isTargetType(value) {
  return value === "directory" || value === "file";
}
function isValidTargetRecord(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  if (!isTargetType(candidate.targetType) || typeof candidate.vaultPath !== "string" || typeof candidate.repoName !== "string" || candidate.visibility !== "public" && candidate.visibility !== "private" || typeof candidate.lastPushed !== "string") {
    return false;
  }
  if (candidate.originUrl !== void 0 && typeof candidate.originUrl !== "string") {
    return false;
  }
  if (candidate.targetType === "file") {
    return typeof candidate.mirrorPath === "string" && candidate.mirrorPath.length > 0 && typeof candidate.mirrorFileName === "string" && candidate.mirrorFileName.length > 0;
  }
  return true;
}
function normalizeTargetRecord(record) {
  return {
    ...record,
    targetType: record.targetType,
    vaultPath: normalizeVaultPath(record.vaultPath),
    remote: "origin",
    originUrl: typeof record.originUrl === "string" && record.originUrl.length > 0 ? record.originUrl : void 0,
    mirrorPath: record.targetType === "file" ? normalizeVaultPath(record.mirrorPath ?? "") : void 0,
    mirrorFileName: record.targetType === "file" ? record.mirrorFileName : void 0
  };
}
function legacyToTargetRecord(record) {
  return {
    targetType: "directory",
    vaultPath: normalizeVaultPath(record.vaultPath),
    repoName: record.repoName,
    remote: "origin",
    visibility: record.visibility,
    lastPushed: record.lastPushed
  };
}
function isStringField(value) {
  return typeof value === "string" && value.length > 0;
}
function isValidStaticSiteHost(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  if (!isStringField(candidate.id) || !isStringField(candidate.name) || !isStringField(candidate.repoRoot) || !isStringField(candidate.siteSubdir) || !isStringField(candidate.postPathTemplate) || !isStringField(candidate.templateRelPath) || !isStringField(candidate.contentMarker) || !isStringField(candidate.commitMessagePublish) || !isStringField(candidate.commitMessageUnpublish) || !isStringField(candidate.remote)) {
    return false;
  }
  const tokens = candidate.tokens;
  if (!tokens || typeof tokens !== "object") {
    return false;
  }
  return isStringField(tokens.title) && isStringField(tokens.slug) && isStringField(tokens.description) && isStringField(tokens.dateIso) && isStringField(tokens.dateDisplay);
}
function isValidPublishRecord(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return isStringField(candidate.hostId) && isStringField(candidate.vaultPath) && isStringField(candidate.slug) && isStringField(candidate.lastPublished);
}
function optionalString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
}
function normalizeGoogleDocsSettings(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  const candidate = value;
  return {
    credentialsPath: optionalString(candidate.credentialsPath),
    refreshToken: optionalString(candidate.refreshToken),
    docsFolderId: optionalString(candidate.docsFolderId),
    mediaFolderId: optionalString(candidate.mediaFolderId)
  };
}
function isValidGoogleDocsAsset(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return isStringField(candidate.vaultPath) && isStringField(candidate.fileId) && isStringField(candidate.name) && isStringField(candidate.mimeType) && isStringField(candidate.checksum) && (candidate.kind === "image" || candidate.kind === "video" || candidate.kind === "other") && isStringField(candidate.lastUploaded);
}
function normalizeGoogleDocsAsset(record) {
  return {
    ...record,
    vaultPath: normalizeVaultPath(record.vaultPath),
    webViewLink: optionalString(record.webViewLink),
    webContentLink: optionalString(record.webContentLink)
  };
}
function isValidGoogleDocsPublish(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  return isStringField(candidate.vaultPath) && isStringField(candidate.docId) && isStringField(candidate.docUrl) && isStringField(candidate.assetFolderId) && isStringField(candidate.lastUploaded) && Array.isArray(candidate.assets);
}
function normalizeGoogleDocsPublish(record) {
  return {
    ...record,
    vaultPath: normalizeVaultPath(record.vaultPath),
    assets: record.assets.filter(isValidGoogleDocsAsset).map((asset) => normalizeGoogleDocsAsset(asset))
  };
}
var ConfigStore = class {
  constructor(plugin) {
    this.data = {
      publishedTargets: [],
      staticSiteHosts: [],
      staticSitePublishes: [],
      googleDocs: {},
      googleDocsPublishes: []
    };
    this.plugin = plugin;
  }
  async load() {
    const loaded = await this.plugin.loadData();
    if (!loaded || typeof loaded !== "object") {
      this.data = {
        publishedTargets: [],
        staticSiteHosts: [],
        staticSitePublishes: [],
        googleDocs: {},
        googleDocsPublishes: []
      };
      return;
    }
    const candidate = loaded;
    let migrated = false;
    let records = [];
    if (Array.isArray(candidate.publishedTargets)) {
      records = candidate.publishedTargets.filter(isValidTargetRecord).map((record) => normalizeTargetRecord(record));
    } else if (Array.isArray(candidate.publishedDirs)) {
      records = candidate.publishedDirs.filter(isLegacyRecord).map((record) => legacyToTargetRecord(record));
      migrated = true;
    }
    const staticSiteHosts = Array.isArray(candidate.staticSiteHosts) ? candidate.staticSiteHosts.filter(isValidStaticSiteHost) : [];
    const staticSitePublishes = Array.isArray(candidate.staticSitePublishes) ? candidate.staticSitePublishes.filter(isValidPublishRecord).map((record) => ({
      ...record,
      vaultPath: normalizeVaultPath(record.vaultPath)
    })) : [];
    const googleDocs = normalizeGoogleDocsSettings(candidate.googleDocs);
    const googleDocsPublishes = Array.isArray(candidate.googleDocsPublishes) ? candidate.googleDocsPublishes.filter(isValidGoogleDocsPublish).map((record) => normalizeGoogleDocsPublish(record)) : [];
    this.data = {
      publishedTargets: records,
      staticSiteHosts,
      staticSitePublishes,
      googleDocs,
      googleDocsPublishes
    };
    if (migrated) {
      await this.save();
    }
  }
  async save() {
    await this.plugin.saveData(this.data);
  }
  getAllTargets() {
    return [...this.data.publishedTargets];
  }
  getTargetsByType(targetType) {
    return this.data.publishedTargets.filter(
      (record) => record.targetType === targetType
    );
  }
  findTarget(targetType, vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    return this.data.publishedTargets.find(
      (record) => record.targetType === targetType && record.vaultPath === normalized
    );
  }
  upsertTarget(record) {
    const normalized = normalizeTargetRecord(record);
    const existingIndex = this.data.publishedTargets.findIndex(
      (entry) => entry.targetType === normalized.targetType && entry.vaultPath === normalized.vaultPath
    );
    if (existingIndex >= 0) {
      this.data.publishedTargets[existingIndex] = normalized;
      return;
    }
    this.data.publishedTargets.push(normalized);
  }
  removeTarget(targetType, vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    const initialLength = this.data.publishedTargets.length;
    this.data.publishedTargets = this.data.publishedTargets.filter(
      (record) => !(record.targetType === targetType && record.vaultPath === normalized)
    );
    return this.data.publishedTargets.length !== initialLength;
  }
  getStaticSiteHosts() {
    return [...this.data.staticSiteHosts ?? []];
  }
  findStaticSiteHost(hostId) {
    return (this.data.staticSiteHosts ?? []).find((host) => host.id === hostId);
  }
  upsertStaticSiteHost(host) {
    const hosts = this.data.staticSiteHosts ?? [];
    const existingIndex = hosts.findIndex((entry) => entry.id === host.id);
    if (existingIndex >= 0) {
      hosts[existingIndex] = host;
    } else {
      hosts.push(host);
    }
    this.data.staticSiteHosts = hosts;
  }
  removeStaticSiteHost(hostId) {
    const hosts = this.data.staticSiteHosts ?? [];
    const initialLength = hosts.length;
    this.data.staticSiteHosts = hosts.filter((entry) => entry.id !== hostId);
    return (this.data.staticSiteHosts?.length ?? 0) !== initialLength;
  }
  getStaticSitePublishes() {
    return [...this.data.staticSitePublishes ?? []];
  }
  getStaticSitePublishesByHost(hostId) {
    return (this.data.staticSitePublishes ?? []).filter(
      (record) => record.hostId === hostId
    );
  }
  findStaticSitePublish(hostId, vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    return (this.data.staticSitePublishes ?? []).find(
      (record) => record.hostId === hostId && record.vaultPath === normalized
    );
  }
  upsertStaticSitePublish(record) {
    const normalized = {
      ...record,
      vaultPath: normalizeVaultPath(record.vaultPath)
    };
    const publishes = this.data.staticSitePublishes ?? [];
    const existingIndex = publishes.findIndex(
      (entry) => entry.hostId === normalized.hostId && entry.vaultPath === normalized.vaultPath
    );
    if (existingIndex >= 0) {
      publishes[existingIndex] = normalized;
    } else {
      publishes.push(normalized);
    }
    this.data.staticSitePublishes = publishes;
  }
  removeStaticSitePublish(hostId, vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    const publishes = this.data.staticSitePublishes ?? [];
    const initialLength = publishes.length;
    this.data.staticSitePublishes = publishes.filter(
      (entry) => !(entry.hostId === hostId && entry.vaultPath === normalized)
    );
    return (this.data.staticSitePublishes?.length ?? 0) !== initialLength;
  }
  getGoogleDocsSettings() {
    return { ...this.data.googleDocs ?? {} };
  }
  updateGoogleDocsSettings(settings) {
    this.data.googleDocs = normalizeGoogleDocsSettings({
      ...this.data.googleDocs ?? {},
      ...settings
    });
  }
  clearGoogleDocsRefreshToken() {
    this.data.googleDocs = {
      ...this.data.googleDocs ?? {},
      refreshToken: void 0
    };
  }
  getGoogleDocsPublishes() {
    return [...this.data.googleDocsPublishes ?? []];
  }
  findGoogleDocsPublish(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    return (this.data.googleDocsPublishes ?? []).find(
      (record) => record.vaultPath === normalized
    );
  }
  upsertGoogleDocsPublish(record) {
    const normalized = normalizeGoogleDocsPublish(record);
    const publishes = this.data.googleDocsPublishes ?? [];
    const existingIndex = publishes.findIndex(
      (entry) => entry.vaultPath === normalized.vaultPath
    );
    if (existingIndex >= 0) {
      publishes[existingIndex] = normalized;
    } else {
      publishes.push(normalized);
    }
    this.data.googleDocsPublishes = publishes;
  }
  removeGoogleDocsPublish(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    const publishes = this.data.googleDocsPublishes ?? [];
    const initialLength = publishes.length;
    this.data.googleDocsPublishes = publishes.filter(
      (entry) => entry.vaultPath !== normalized
    );
    return (this.data.googleDocsPublishes?.length ?? 0) !== initialLength;
  }
};

// src/services/git-service.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = __toESM(require("node:fs"), 1);
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_process = __toESM(require("node:process"), 1);
var import_node_util = require("node:util");

// src/utils/commit-message.ts
function pad2(value) {
  return String(value).padStart(2, "0");
}
function formatCommitTimestamp(date = /* @__PURE__ */ new Date()) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
function buildCommitMessage(folderName, date = /* @__PURE__ */ new Date()) {
  return `vault-publisher: update ${folderName} - ${formatCommitTimestamp(date)}`;
}

// src/utils/github-url.ts
function parseRepoPathname(pathname) {
  const segments = pathname.replace(/^\/+/, "").split("/").filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    return null;
  }
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!owner || !repo) {
    return null;
  }
  return `${owner}/${repo}`;
}
function parseGitHubRepoSlug(originUrl) {
  const trimmed = originUrl.trim();
  if (!trimmed) {
    return null;
  }
  const scpMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (scpMatch) {
    return `${scpMatch[1]}/${scpMatch[2]}`;
  }
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== "github.com") {
      return null;
    }
    if (protocol !== "http:" && protocol !== "https:" && protocol !== "ssh:") {
      return null;
    }
    return parseRepoPathname(parsed.pathname);
  } catch {
    return null;
  }
}
function isGitHubOrigin(originUrl) {
  return parseGitHubRepoSlug(originUrl) !== null;
}
function originToWebUrl(originUrl) {
  const slug = parseGitHubRepoSlug(originUrl);
  if (slug) {
    return `https://github.com/${slug}`;
  }
  return null;
}

// src/utils/repo-name-utils.ts
function sanitizeRepoName(input) {
  const sanitized = input.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
  return sanitized || "vault-publisher";
}
function repoNameCandidates(baseName, maxAttempts = 50) {
  if (maxAttempts < 1) {
    return [];
  }
  const candidates = [];
  for (let index = 0; index < maxAttempts; index += 1) {
    if (index === 0) {
      candidates.push(baseName);
    } else {
      candidates.push(`${baseName}-${index + 1}`);
    }
  }
  return candidates;
}
function parseRepoNameFromOrigin(originUrl) {
  const slug = parseGitHubRepoSlug(originUrl);
  if (!slug) {
    return null;
  }
  const segments = slug.split("/");
  return segments[1] ?? null;
}

// src/services/git-service.ts
var execFileAsync = (0, import_node_util.promisify)(import_node_child_process.execFile);
var GITIGNORE_DEFAULTS = ".obsidian/\n.trash/\n.DS_Store\nThumbs.db\n";
var COMMAND_TIMEOUT_MS = 12e4;
var GitCommandError = class extends Error {
  constructor(params) {
    super(
      params.message ?? `${params.command} ${params.args.join(" ")} failed`
    );
    this.name = "GitCommandError";
    this.command = params.command;
    this.args = [...params.args];
    this.cwd = params.cwd;
    this.stdout = params.stdout ?? "";
    this.stderr = params.stderr ?? "";
    this.exitCode = params.exitCode ?? null;
    this.systemCode = params.systemCode;
  }
  displayMessage() {
    const preferred = this.stderr.trim() || this.stdout.trim() || this.message;
    return preferred;
  }
};
function normalizeOutput(value) {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return "";
}
function errorFromUnknown(error, command, args, cwd) {
  if (error instanceof GitCommandError) {
    return error;
  }
  const candidate = error;
  const numericCode = typeof candidate.code === "number" ? candidate.code : null;
  const systemCode = typeof candidate.code === "string" ? candidate.code : void 0;
  return new GitCommandError({
    command,
    args,
    cwd,
    stdout: normalizeOutput(candidate.stdout),
    stderr: normalizeOutput(candidate.stderr),
    exitCode: numericCode,
    systemCode,
    message: candidate.message
  });
}
function buildAugmentedPath() {
  const delimiter = import_node_path2.default.delimiter;
  const basePath = import_node_process.default.env.PATH ?? "";
  const candidates = import_node_process.default.platform === "win32" ? [] : [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin"
  ];
  const existingSegments = basePath.split(delimiter).filter((segment) => segment.length > 0);
  const merged = [...existingSegments];
  for (const candidate of candidates) {
    if (!merged.includes(candidate)) {
      merged.push(candidate);
    }
  }
  return merged.join(delimiter);
}
var defaultRunner = async (command, args, options) => {
  const result = await execFileAsync(command, args, {
    cwd: options?.cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    env: {
      ...import_node_process.default.env,
      PATH: buildAugmentedPath()
    }
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
};
function isRepoNameTakenError(error) {
  const output = `${error.stderr}
${error.stdout}`.toLowerCase();
  return output.includes("already exists on this account") || output.includes("name already exists") || output.includes("already exists");
}
function isNoUpstreamPushError(error) {
  const output = `${error.stderr}
${error.stdout}`.toLowerCase();
  return output.includes("no upstream branch") || output.includes("set-upstream");
}
function isNoCommitsError(error) {
  const output = `${error.stderr}
${error.stdout}`.toLowerCase();
  return output.includes("no commits yet") || output.includes("head does not match any") || output.includes("src refspec head does not match any") || output.includes("ambiguous argument 'head'") || output.includes("you need at least one commit");
}
function isRemoteAttachFailure(error) {
  const output = `${error.stderr}
${error.stdout}`.toLowerCase();
  return output.includes('unable to add remote "origin"');
}
function isGitHubRepoNotFoundError(error) {
  const output = `${error.stderr}
${error.stdout}`.toLowerCase();
  return output.includes("could not resolve to a repository") || output.includes("repository not found") || output.includes("was not found") || output.includes("http 404") || output.includes("not found");
}
var GitService = class {
  constructor(runner = defaultRunner) {
    this.runner = runner;
  }
  async run(command, args, cwd) {
    try {
      return await this.runner(command, args, { cwd });
    } catch (error) {
      throw errorFromUnknown(error, command, args, cwd);
    }
  }
  async checkGitPrerequisites() {
    try {
      await this.run("git", ["--version"]);
    } catch (error) {
      const commandError = errorFromUnknown(error, "git", ["--version"]);
      if (commandError.systemCode === "ENOENT") {
        return {
          ok: false,
          message: "Git not found. Please install git."
        };
      }
      return {
        ok: false,
        message: commandError.displayMessage()
      };
    }
    return {
      ok: true
    };
  }
  async checkGitHubPrerequisites() {
    try {
      await this.run("gh", ["--version"]);
      await this.run("gh", ["auth", "status"]);
    } catch (error) {
      const commandError = errorFromUnknown(error, "gh", ["auth", "status"]);
      if (commandError.systemCode === "ENOENT") {
        return {
          ok: false,
          message: "GitHub CLI (gh) not found in Obsidian. Ensure gh is installed and restart Obsidian; if needed run `gh auth login` in terminal."
        };
      }
      return {
        ok: false,
        message: "GitHub CLI (gh) not found or not authenticated. Run `gh auth login` in your terminal."
      };
    }
    return {
      ok: true
    };
  }
  async checkPrerequisites() {
    const gitStatus = await this.checkGitPrerequisites();
    if (!gitStatus.ok) {
      return gitStatus;
    }
    const githubStatus = await this.checkGitHubPrerequisites();
    if (!githubStatus.ok) {
      return githubStatus;
    }
    return {
      ok: true
    };
  }
  async detectRepoState(targetDir) {
    const gitDir = import_node_path2.default.join(targetDir, ".git");
    let hasLocalGit = false;
    try {
      const gitStat = await import_promises.default.stat(gitDir);
      hasLocalGit = gitStat.isDirectory();
    } catch {
      hasLocalGit = false;
    }
    if (!hasLocalGit) {
      return {
        hasLocalGit: false,
        hasOrigin: false,
        isGitHubOrigin: false
      };
    }
    try {
      const result = await this.run(
        "git",
        ["remote", "get-url", "origin"],
        targetDir
      );
      const originUrl = result.stdout.trim();
      if (!originUrl) {
        return {
          hasLocalGit: true,
          hasOrigin: false,
          isGitHubOrigin: false
        };
      }
      return {
        hasLocalGit: true,
        hasOrigin: true,
        originUrl,
        isGitHubOrigin: isGitHubOrigin(originUrl)
      };
    } catch {
      return {
        hasLocalGit: true,
        hasOrigin: false,
        isGitHubOrigin: false
      };
    }
  }
  async ensureGitignore(targetDir) {
    const gitignorePath = import_node_path2.default.join(targetDir, ".gitignore");
    if (import_node_fs.default.existsSync(gitignorePath)) {
      return;
    }
    await import_promises.default.writeFile(gitignorePath, GITIGNORE_DEFAULTS, "utf8");
  }
  async initRepo(targetDir) {
    await this.run("git", ["init"], targetDir);
  }
  async ensureDirectory(targetDir) {
    await import_promises.default.mkdir(targetDir, { recursive: true });
  }
  async syncSingleFileToRepo(sourceFilePath, targetDir, repoFileName) {
    await this.ensureDirectory(targetDir);
    const entries = await import_promises.default.readdir(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === repoFileName) {
        continue;
      }
      await import_promises.default.rm(import_node_path2.default.join(targetDir, entry.name), {
        recursive: true,
        force: true
      });
    }
    const destinationPath = import_node_path2.default.join(targetDir, repoFileName);
    await import_promises.default.copyFile(sourceFilePath, destinationPath);
  }
  async createGitHubRepo(targetDir, repoName, visibility, options) {
    const visibilityFlag = visibility === "public" ? "--public" : "--private";
    const args = ["repo", "create", repoName, visibilityFlag, "--source=."];
    if (options?.remoteName) {
      args.push(`--remote=${options.remoteName}`);
    }
    if (options?.push ?? true) {
      args.push("--push");
    }
    await this.run("gh", args, targetDir);
  }
  async createRepoWithAutoName(targetDir, baseRepoName, visibility, maxAttempts = 50, options) {
    const candidates = repoNameCandidates(baseRepoName, maxAttempts);
    for (const candidate of candidates) {
      try {
        await this.createGitHubRepo(targetDir, candidate, visibility, options);
        return candidate;
      } catch (error) {
        const commandError = errorFromUnknown(
          error,
          "gh",
          ["repo", "create"],
          targetDir
        );
        if (isRepoNameTakenError(commandError)) {
          continue;
        }
        if (isRemoteAttachFailure(commandError)) {
          const recovered = await this.recoverAfterRemoteAttachFailure(
            targetDir,
            candidate
          );
          if (recovered) {
            return candidate;
          }
        }
        throw commandError;
      }
    }
    throw new Error(
      `Could not create a unique repository name after ${maxAttempts} attempts starting from "${baseRepoName}".`
    );
  }
  async stageAll(targetDir) {
    await this.run("git", ["add", "."], targetDir);
  }
  async getStagedFiles(targetDir) {
    const result = await this.run(
      "git",
      ["diff", "--cached", "--name-only"],
      targetDir
    );
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  }
  async commit(targetDir, message) {
    await this.run("git", ["commit", "-m", message], targetDir);
  }
  async hasAnyCommit(targetDir) {
    try {
      await this.run("git", ["rev-parse", "--verify", "HEAD"], targetDir);
      return true;
    } catch {
      return false;
    }
  }
  async getAheadCommitCount(targetDir) {
    try {
      const result = await this.run(
        "git",
        ["rev-list", "--count", "@{u}..HEAD"],
        targetDir
      );
      const count = Number.parseInt(result.stdout.trim(), 10);
      return Number.isNaN(count) ? 0 : count;
    } catch {
      return null;
    }
  }
  async push(targetDir) {
    try {
      await this.run("git", ["push"], targetDir);
      return { usedUpstreamFallback: false };
    } catch (error) {
      const commandError = errorFromUnknown(error, "git", ["push"], targetDir);
      if (isNoUpstreamPushError(commandError)) {
        await this.run("git", ["push", "-u", "origin", "HEAD"], targetDir);
        return { usedUpstreamFallback: true };
      }
      throw commandError;
    }
  }
  async isGitWorktree(targetDir) {
    try {
      const result = await this.run(
        "git",
        ["rev-parse", "--is-inside-work-tree"],
        targetDir
      );
      return result.stdout.trim() === "true";
    } catch {
      return false;
    }
  }
  async getCurrentBranch(targetDir) {
    try {
      const result = await this.run(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD"],
        targetDir
      );
      const branch = result.stdout.trim();
      if (!branch || branch === "HEAD") {
        return null;
      }
      return branch;
    } catch {
      return null;
    }
  }
  async getHeadSha(targetDir) {
    try {
      const result = await this.run("git", ["rev-parse", "HEAD"], targetDir);
      const sha = result.stdout.trim();
      return sha.length > 0 ? sha : null;
    } catch {
      return null;
    }
  }
  async stagePathsInRepo(repoRoot, relativePaths) {
    if (relativePaths.length === 0) {
      return;
    }
    const uniquePaths = Array.from(new Set(relativePaths));
    await this.run("git", ["add", "--all", "--", ...uniquePaths], repoRoot);
  }
  async getStagedFilesFiltered(repoRoot, relativePaths) {
    const uniquePaths = Array.from(new Set(relativePaths));
    if (uniquePaths.length === 0) {
      return [];
    }
    const result = await this.run(
      "git",
      ["diff", "--cached", "--name-only", "--", ...uniquePaths],
      repoRoot
    );
    return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  }
  async commitInRepo(repoRoot, message) {
    await this.run("git", ["commit", "-m", message], repoRoot);
  }
  async pushCurrentBranchInRepo(repoRoot, remote, branch) {
    const effectiveBranch = branch ?? await this.getCurrentBranch(repoRoot);
    if (!effectiveBranch) {
      throw new GitCommandError({
        command: "git",
        args: ["push"],
        cwd: repoRoot,
        message: "Could not resolve current branch for push. Is HEAD detached?"
      });
    }
    try {
      await this.run(
        "git",
        ["push", remote, `HEAD:${effectiveBranch}`],
        repoRoot
      );
      return { usedUpstreamFallback: false };
    } catch (error) {
      const commandError = errorFromUnknown(error, "git", ["push"], repoRoot);
      if (isNoUpstreamPushError(commandError)) {
        await this.run(
          "git",
          ["push", "-u", remote, `HEAD:${effectiveBranch}`],
          repoRoot
        );
        return { usedUpstreamFallback: true };
      }
      throw commandError;
    }
  }
  async getAuthenticatedUserLogin() {
    if (this.ghLogin) {
      return this.ghLogin;
    }
    const result = await this.run("gh", ["api", "user", "--jq", ".login"]);
    const login = result.stdout.trim();
    if (!login) {
      throw new Error("Could not resolve authenticated GitHub username.");
    }
    this.ghLogin = login;
    return login;
  }
  async recoverAfterRemoteAttachFailure(targetDir, repoName) {
    try {
      const owner = await this.getAuthenticatedUserLogin();
      const repoUrl = `https://github.com/${owner}/${repoName}.git`;
      await this.run("gh", ["repo", "view", `${owner}/${repoName}`]);
      const existingOrigin = await this.getOriginUrl(targetDir);
      if (!existingOrigin) {
        await this.run("git", ["remote", "add", "origin", repoUrl], targetDir);
      }
      if (await this.hasAnyCommit(targetDir)) {
        await this.push(targetDir);
      }
      return true;
    } catch {
      return false;
    }
  }
  async getOriginUrl(targetDir) {
    try {
      const result = await this.run(
        "git",
        ["remote", "get-url", "origin"],
        targetDir
      );
      const originUrl = result.stdout.trim();
      return originUrl.length > 0 ? originUrl : null;
    } catch {
      return null;
    }
  }
  async deleteGitHubRepo(repoSlug) {
    try {
      await this.run("gh", ["repo", "delete", repoSlug, "--yes"]);
      return { status: "deleted" };
    } catch (error) {
      const commandError = errorFromUnknown(error, "gh", [
        "repo",
        "delete",
        repoSlug,
        "--yes"
      ]);
      if (isGitHubRepoNotFoundError(commandError)) {
        return { status: "not_found" };
      }
      throw commandError;
    }
  }
  async removeGitDirectory(targetDir) {
    await import_promises.default.rm(import_node_path2.default.join(targetDir, ".git"), {
      recursive: true,
      force: true
    });
  }
  async removeDirectory(targetDir) {
    await import_promises.default.rm(targetDir, { recursive: true, force: true });
  }
  async findStandaloneReposUnderRoot(rootPath, rootRelativePath, options) {
    const repositories = /* @__PURE__ */ new Set();
    const skipDirectoryNames = options?.skipDirectoryNames ?? /* @__PURE__ */ new Set();
    const walk = async (currentPath, relativePath) => {
      let entries;
      try {
        entries = await import_promises.default.readdir(currentPath, { withFileTypes: true });
      } catch {
        return;
      }
      const hasLocalGitDir = entries.some(
        (entry) => entry.isDirectory() && entry.name === ".git"
      );
      if (relativePath && hasLocalGitDir) {
        const vaultRelativePath = rootRelativePath ? `${rootRelativePath}/${relativePath}` : relativePath;
        repositories.add(vaultRelativePath);
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        if (entry.isSymbolicLink()) {
          continue;
        }
        if (entry.name === ".git" || skipDirectoryNames.has(entry.name)) {
          continue;
        }
        const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        const childAbsolutePath = import_node_path2.default.join(currentPath, entry.name);
        await walk(childAbsolutePath, childRelativePath);
      }
    };
    await walk(rootPath, "");
    return [...repositories].sort((left, right) => left.localeCompare(right));
  }
  async linkLocalRepoWithoutOrigin(targetDir, folderName, baseRepoName, visibility) {
    await this.stageAll(targetDir);
    const stagedFiles = await this.getStagedFiles(targetDir);
    if (stagedFiles.length > 0) {
      await this.commit(targetDir, buildCommitMessage(folderName));
    }
    try {
      const repoName2 = await this.createRepoWithAutoName(
        targetDir,
        baseRepoName,
        visibility,
        50,
        {
          push: true
        }
      );
      const originUrl2 = await this.getOriginUrl(targetDir);
      return { repoName: repoName2, originUrl: originUrl2, pushed: true };
    } catch (error) {
      const commandError = errorFromUnknown(
        error,
        "gh",
        ["repo", "create"],
        targetDir
      );
      if (!isNoCommitsError(commandError)) {
        throw commandError;
      }
    }
    const repoName = await this.createRepoWithAutoName(
      targetDir,
      baseRepoName,
      visibility,
      50,
      {
        push: false,
        remoteName: "origin"
      }
    );
    const originUrl = await this.getOriginUrl(targetDir);
    if (await this.hasAnyCommit(targetDir)) {
      await this.push(targetDir);
      return { repoName, originUrl, pushed: true };
    }
    return { repoName, originUrl, pushed: false };
  }
  async pushDirectory(targetDir, folderName) {
    try {
      await this.stageAll(targetDir);
      const stagedFiles = await this.getStagedFiles(targetDir);
      if (stagedFiles.length > 0) {
        await this.commit(targetDir, buildCommitMessage(folderName));
      }
      const aheadCount = await this.getAheadCommitCount(targetDir);
      const { usedUpstreamFallback } = await this.push(targetDir);
      const changedCount = stagedFiles.length;
      const didPushChanges = changedCount > 0 || aheadCount !== null && aheadCount > 0 || usedUpstreamFallback;
      if (!didPushChanges) {
        return {
          status: "up_to_date",
          changedCount: 0
        };
      }
      return {
        status: "pushed",
        changedCount
      };
    } catch (error) {
      const commandError = errorFromUnknown(
        error,
        "git",
        ["commit"],
        targetDir
      );
      const output = commandError.displayMessage().toLowerCase();
      if (output.includes("nothing to commit")) {
        return {
          status: "up_to_date",
          changedCount: 0
        };
      }
      return {
        status: "failed",
        error: commandError.displayMessage()
      };
    }
  }
  async findStandaloneRepos(vaultBasePath) {
    return this.findStandaloneReposUnderRoot(vaultBasePath, "", {
      skipDirectoryNames: /* @__PURE__ */ new Set([".obsidian", "node_modules"])
    });
  }
  async findMirrorRepos(vaultBasePath, mirrorRootRelativePath) {
    const mirrorRootPath = import_node_path2.default.join(vaultBasePath, mirrorRootRelativePath);
    try {
      const mirrorStats = await import_promises.default.stat(mirrorRootPath);
      if (!mirrorStats.isDirectory()) {
        return [];
      }
    } catch {
      return [];
    }
    return this.findStandaloneReposUnderRoot(
      mirrorRootPath,
      mirrorRootRelativePath
    );
  }
  async pushAllRepos(vaultBasePath, options) {
    const repoPaths = await this.findStandaloneRepos(vaultBasePath);
    const results = [];
    for (const vaultPath of repoPaths) {
      const absolutePath = import_node_path2.default.join(vaultBasePath, vaultPath);
      const folderName = import_node_path2.default.posix.basename(vaultPath);
      const repoState = await this.detectRepoState(absolutePath);
      if (!repoState.hasOrigin) {
        try {
          const visibility = options?.resolveVisibility?.(vaultPath) ?? "private";
          const configuredBaseName = options?.resolveBaseRepoName?.(vaultPath);
          const baseRepoName = sanitizeRepoName(
            configuredBaseName ?? folderName
          );
          const linked = await this.linkLocalRepoWithoutOrigin(
            absolutePath,
            folderName,
            baseRepoName,
            visibility
          );
          results.push({
            targetType: "directory",
            vaultPath,
            status: linked.pushed ? "pushed" : "up_to_date",
            originUrl: linked.originUrl ?? void 0
          });
        } catch (error) {
          const commandError = errorFromUnknown(
            error,
            "gh",
            ["repo", "create"],
            absolutePath
          );
          results.push({
            targetType: "directory",
            vaultPath,
            status: "failed",
            error: commandError.displayMessage()
          });
        }
        continue;
      }
      const result = await this.pushDirectory(absolutePath, folderName);
      results.push({
        ...result,
        targetType: "directory",
        vaultPath,
        originUrl: repoState.originUrl
      });
    }
    const summary = {
      total: results.length,
      pushed: results.filter((result) => result.status === "pushed").length,
      upToDate: results.filter((result) => result.status === "up_to_date").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results
    };
    return summary;
  }
};

// src/services/google-docs-publisher.ts
var import_promises2 = __toESM(require("node:fs/promises"), 1);
var import_node_http = __toESM(require("node:http"), 1);
var GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
var GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
var GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";
var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
var DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3";
var DRIVE_UPLOAD_ROOT = "https://www.googleapis.com/upload/drive/v3";
var DOCS_API_ROOT = "https://docs.googleapis.com/v1";
var DEFAULT_MEDIA_FOLDER_NAME = "Vault Publisher Media";
var GOOGLE_DOCS_PARAGRAPH_SPACE_AFTER_PT = 6;
var GOOGLE_DOCS_HEADING_SPACE_ABOVE_PT = 12;
var GOOGLE_DOCS_CODE_BLOCK_BACKGROUND = {
  red: 0.94509804,
  green: 0.9529412,
  blue: 0.95686275
};
var GOOGLE_DOCS_CODE_BLOCK_MARKER = /GVP_CODE_BLOCK_(\d+)_(START|END)/g;
var GoogleDocsPublishError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "GoogleDocsPublishError";
  }
};
function asString(value) {
  return typeof value === "string" ? value : "";
}
function sanitizeDriveName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}
function fallbackDocUrl(docId) {
  return `https://docs.google.com/document/d/${docId}/edit`;
}
function fallbackDriveUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
function normalizeSettings(settings) {
  return {
    credentialsPath: settings.credentialsPath?.trim() || void 0,
    refreshToken: settings.refreshToken?.trim() || void 0,
    docsFolderId: settings.docsFolderId?.trim() || void 0,
    mediaFolderId: settings.mediaFolderId?.trim() || void 0
  };
}
async function loadOAuthConfig(credentialsPath) {
  if (!credentialsPath) {
    throw new GoogleDocsPublishError(
      "Google OAuth credentials path is not configured."
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(await import_promises2.default.readFile(credentialsPath, "utf8"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    throw new GoogleDocsPublishError(
      `Could not read Google OAuth credentials: ${detail}`
    );
  }
  const config = parsed.installed ?? parsed.web;
  if (!config?.client_id || !config.client_secret) {
    throw new GoogleDocsPublishError(
      "Google OAuth credentials must contain an installed or web client with client_id and client_secret."
    );
  }
  return config;
}
function getErrorStatus(error) {
  const candidate = error;
  return candidate.response?.status ?? candidate.code;
}
function isMissingFileError(error) {
  const status = getErrorStatus(error);
  return status === 404 || status === 410;
}
function isGoogleDocsHeadingStyle(value) {
  return typeof value === "string" && /^HEADING_[1-6]$/.test(value);
}
var GoogleDocsApiError = class extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GoogleDocsApiError";
    this.code = code;
  }
};
function makeAuthUrl(config, redirectUri) {
  const params = new URLSearchParams({
    client_id: config.client_id ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent"
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}
async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = data?.error_description ?? data?.error?.message ?? data?.error ?? response.statusText;
    throw new GoogleDocsApiError(String(message), response.status);
  }
  return data;
}
async function exchangeCodeForRefreshToken(config, code, redirectUri) {
  const data = await fetchJson(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.client_id ?? "",
      client_secret: config.client_secret ?? "",
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code"
    })
  });
  if (!data.refresh_token) {
    throw new GoogleDocsPublishError(
      "Google did not return a refresh token. Revoke the app in your Google account and authorize again."
    );
  }
  return data.refresh_token;
}
async function refreshAccessToken(config, refreshToken) {
  const data = await fetchJson(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.client_id ?? "",
      client_secret: config.client_secret ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!data.access_token) {
    throw new GoogleDocsPublishError(
      "Google did not return an access token. Re-authorize Google Docs in settings."
    );
  }
  return data.access_token;
}
function buildQuery(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== void 0) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
function multipartBody(metadata, media) {
  const boundary = `vault-publisher-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const header = Buffer.from(
    [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${media.mimeType}`,
      "",
      ""
    ].join("\r\n"),
    "utf8"
  );
  const footer = Buffer.from(`\r
--${boundary}--\r
`, "utf8");
  return {
    body: Buffer.concat([header, media.body, footer]),
    contentType: `multipart/related; boundary=${boundary}`
  };
}
var GoogleDriveRestClient = class {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.files = {
      create: (input) => this.createFile(input),
      update: (input) => this.updateFile(input),
      get: (input) => this.getFile(input)
    };
    this.permissions = {
      create: (input) => this.createPermission(input)
    };
  }
  authHeaders(extra) {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      ...extra ?? {}
    };
  }
  async createFile(input) {
    if (input.media) {
      const multipart = multipartBody(input.requestBody, input.media);
      const data2 = await fetchJson(
        `${DRIVE_UPLOAD_ROOT}/files${buildQuery({
          uploadType: "multipart",
          fields: input.fields
        })}`,
        {
          method: "POST",
          headers: this.authHeaders({ "Content-Type": multipart.contentType }),
          body: multipart.body
        }
      );
      return { data: data2 };
    }
    const data = await fetchJson(
      `${DRIVE_API_ROOT}/files${buildQuery({ fields: input.fields })}`,
      {
        method: "POST",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input.requestBody)
      }
    );
    return { data };
  }
  async updateFile(input) {
    const encodedFileId = encodeURIComponent(input.fileId);
    if (input.media) {
      const multipart = multipartBody(input.requestBody, input.media);
      const data2 = await fetchJson(
        `${DRIVE_UPLOAD_ROOT}/files/${encodedFileId}${buildQuery({
          uploadType: "multipart",
          fields: input.fields
        })}`,
        {
          method: "PATCH",
          headers: this.authHeaders({ "Content-Type": multipart.contentType }),
          body: multipart.body
        }
      );
      return { data: data2 };
    }
    const data = await fetchJson(
      `${DRIVE_API_ROOT}/files/${encodedFileId}${buildQuery({
        fields: input.fields
      })}`,
      {
        method: "PATCH",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input.requestBody)
      }
    );
    return { data };
  }
  async getFile(input) {
    const encodedFileId = encodeURIComponent(input.fileId);
    const data = await fetchJson(
      `${DRIVE_API_ROOT}/files/${encodedFileId}${buildQuery({
        fields: input.fields
      })}`,
      {
        method: "GET",
        headers: this.authHeaders()
      }
    );
    return { data };
  }
  async createPermission(input) {
    const encodedFileId = encodeURIComponent(input.fileId);
    const data = await fetchJson(
      `${DRIVE_API_ROOT}/files/${encodedFileId}/permissions${buildQuery({
        fields: input.fields
      })}`,
      {
        method: "POST",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input.requestBody)
      }
    );
    return { data };
  }
};
var GoogleDocsRestClient = class {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.documents = {
      get: (input) => this.getDocument(input),
      batchUpdate: (input) => this.batchUpdateDocument(input)
    };
  }
  authHeaders(extra) {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      ...extra ?? {}
    };
  }
  async getDocument(input) {
    const encodedDocumentId = encodeURIComponent(input.documentId);
    const data = await fetchJson(
      `${DOCS_API_ROOT}/documents/${encodedDocumentId}${buildQuery({
        fields: input.fields
      })}`,
      {
        method: "GET",
        headers: this.authHeaders()
      }
    );
    return { data };
  }
  async batchUpdateDocument(input) {
    const encodedDocumentId = encodeURIComponent(input.documentId);
    const data = await fetchJson(
      `${DOCS_API_ROOT}/documents/${encodedDocumentId}:batchUpdate`,
      {
        method: "POST",
        headers: this.authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input.requestBody)
      }
    );
    return { data };
  }
};
var GoogleDocsPublisher = class {
  constructor(clientFactory) {
    this.clientFactory = clientFactory;
  }
  async authorizeWithLocalServer(settings, openExternalUrl) {
    const normalized = normalizeSettings(settings);
    const config = await loadOAuthConfig(normalized.credentialsPath);
    const authResult = await new Promise(
      (resolve, reject) => {
        const server = import_node_http.default.createServer();
        let resolved = false;
        let activeRedirectUri = "";
        const finish = (error, value) => {
          if (resolved) {
            return;
          }
          resolved = true;
          server.close();
          if (error) {
            reject(error);
            return;
          }
          resolve({ code: value ?? "", redirectUri: activeRedirectUri });
        };
        server.on("request", (request, response) => {
          const host = request.headers.host ?? "127.0.0.1";
          const requestUrl = new URL(request.url ?? "/", `http://${host}`);
          const incomingCode = requestUrl.searchParams.get("code");
          const incomingError = requestUrl.searchParams.get("error");
          if (incomingError) {
            response.writeHead(400, { "Content-Type": "text/html" });
            response.end(
              "<p>Google authorization failed. Return to Obsidian.</p>"
            );
            finish(
              new GoogleDocsPublishError(
                `Google authorization failed: ${incomingError}`
              )
            );
            return;
          }
          if (!incomingCode) {
            response.writeHead(404, { "Content-Type": "text/plain" });
            response.end("Not found");
            return;
          }
          response.writeHead(200, { "Content-Type": "text/html" });
          response.end(
            "<p>Google authorization complete. You can close this tab and return to Obsidian.</p>"
          );
          finish(null, incomingCode);
        });
        server.on("error", (error) => {
          finish(error);
        });
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
          activeRedirectUri = redirectUri;
          const authUrl = makeAuthUrl(config, redirectUri);
          void openExternalUrl(authUrl).catch((error) => {
            const detail = error instanceof Error ? error.message : String(error);
            finish(
              new GoogleDocsPublishError(
                `Could not open Google authorization URL: ${detail}`
              )
            );
          });
        });
      }
    );
    const redirectConfig = await loadOAuthConfig(normalized.credentialsPath);
    return exchangeCodeForRefreshToken(
      redirectConfig,
      authResult.code,
      authResult.redirectUri
    );
  }
  async publish(input) {
    const settings = normalizeSettings(input.settings);
    if (!settings.docsFolderId) {
      throw new GoogleDocsPublishError("Google Docs folder ID is not configured.");
    }
    if (!settings.refreshToken) {
      throw new GoogleDocsPublishError(
        "Google Docs is not authorized. Authorize it in Vault Publisher settings."
      );
    }
    const clients = await this.createClients(settings);
    const warnings = [...input.missingMedia.map((media) => media.message)];
    const mediaRootId = settings.mediaFolderId ?? await this.createFolder(
      clients.drive,
      DEFAULT_MEDIA_FOLDER_NAME,
      settings.docsFolderId
    );
    const nextSettings = {
      ...settings,
      mediaFolderId: mediaRootId
    };
    const assetFolderId = input.previousRecord?.assetFolderId ?? await this.createFolder(
      clients.drive,
      `${sanitizeDriveName(input.title)} assets`,
      mediaRootId
    );
    const assetRecords = [];
    const replacements = /* @__PURE__ */ new Map();
    const previousAssets = new Map(
      (input.previousRecord?.assets ?? []).map((asset) => [
        normalizeVaultPath(asset.vaultPath),
        asset
      ])
    );
    for (const upload of input.mediaUploads) {
      const previous = previousAssets.get(normalizeVaultPath(upload.vaultPath));
      try {
        const asset = await this.uploadAsset(
          clients.drive,
          upload,
          assetFolderId,
          previous
        );
        assetRecords.push(asset);
        replacements.set(upload.marker, {
          marker: upload.marker,
          original: upload.original,
          kind: upload.kind,
          inlineSupported: upload.inlineSupported,
          asset
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        warnings.push(`Could not upload ${upload.original}: ${detail}`);
        replacements.set(upload.marker, {
          marker: upload.marker,
          original: upload.original,
          kind: upload.kind,
          inlineSupported: false,
          warning: detail
        });
      }
    }
    for (const missing of input.missingMedia) {
      replacements.set(missing.marker, {
        marker: missing.marker,
        original: missing.original,
        kind: "other",
        inlineSupported: false,
        warning: missing.message
      });
    }
    if (input.previousRecord?.docId) {
      await this.clearDocumentBody(clients.docs, input.previousRecord.docId);
    }
    const doc = await this.createOrUpdateDoc(clients.drive, {
      docId: input.previousRecord?.docId,
      title: input.title,
      html: input.html,
      parentFolderId: settings.docsFolderId
    });
    await this.ensureAnyoneReader(clients.drive, doc.id);
    const spacingWarning = await this.applyDocumentSpacing(
      clients.docs,
      doc.id
    );
    if (spacingWarning) {
      warnings.push(spacingWarning);
    }
    const codeBlockWarnings = await this.patchCodeBlocks(clients.docs, doc.id);
    warnings.push(...codeBlockWarnings);
    const patchWarnings = await this.patchMediaPlaceholders(
      clients.docs,
      doc.id,
      Array.from(replacements.values())
    );
    warnings.push(...patchWarnings);
    await this.trashRemovedAssets(
      clients.drive,
      input.previousRecord?.assets ?? [],
      assetRecords
    );
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    return {
      settings: nextSettings,
      status: input.previousRecord ? "updated" : "created",
      warnings,
      record: {
        vaultPath: normalizeVaultPath(input.vaultPath),
        docId: doc.id,
        docUrl: doc.webViewLink ?? fallbackDocUrl(doc.id),
        assetFolderId,
        lastUploaded: nowIso,
        assets: assetRecords
      }
    };
  }
  async createClients(settings) {
    if (this.clientFactory) {
      return this.clientFactory(settings);
    }
    const config = await loadOAuthConfig(settings.credentialsPath);
    const accessToken = await refreshAccessToken(
      config,
      settings.refreshToken ?? ""
    );
    return {
      drive: new GoogleDriveRestClient(accessToken),
      docs: new GoogleDocsRestClient(accessToken)
    };
  }
  async createFolder(drive, name, parentFolderId) {
    const response = await drive.files.create({
      requestBody: {
        name,
        mimeType: GOOGLE_FOLDER_MIME,
        parents: [parentFolderId]
      },
      fields: "id"
    });
    const id = asString(response.data.id);
    if (!id) {
      throw new GoogleDocsPublishError(`Could not create Drive folder ${name}.`);
    }
    return id;
  }
  async createOrUpdateDoc(drive, input) {
    const media = {
      mimeType: "text/html",
      body: Buffer.from(input.html, "utf8")
    };
    const requestBody = {
      name: sanitizeDriveName(input.title) || "Untitled",
      mimeType: GOOGLE_DOC_MIME,
      parents: input.docId ? void 0 : [input.parentFolderId]
    };
    const response = input.docId ? await drive.files.update({
      fileId: input.docId,
      requestBody,
      media,
      fields: "id,webViewLink"
    }) : await drive.files.create({
      requestBody,
      media,
      fields: "id,webViewLink"
    });
    const id = asString(response.data.id);
    if (!id) {
      throw new GoogleDocsPublishError("Google Drive did not return a doc ID.");
    }
    return {
      id,
      webViewLink: asString(response.data.webViewLink) || void 0
    };
  }
  async uploadAsset(drive, upload, assetFolderId, previous) {
    let fileId = previous?.fileId;
    if (fileId && previous?.checksum === upload.checksum) {
      try {
        const existing = await this.getDriveFile(drive, fileId);
        await this.ensureAnyoneReader(drive, fileId);
        return this.toAssetRecord(upload, existing, fileId);
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
        fileId = void 0;
      }
    }
    const media = {
      mimeType: upload.mimeType,
      body: upload.bytes
    };
    const requestBody = {
      name: sanitizeDriveName(upload.name) || "media",
      mimeType: upload.mimeType,
      parents: fileId ? void 0 : [assetFolderId]
    };
    const response = fileId ? await drive.files.update({
      fileId,
      requestBody,
      media,
      fields: "id,name,mimeType,webViewLink,webContentLink"
    }) : await drive.files.create({
      requestBody,
      media,
      fields: "id,name,mimeType,webViewLink,webContentLink"
    });
    fileId = asString(response.data.id);
    if (!fileId) {
      throw new GoogleDocsPublishError(
        `Google Drive did not return an asset ID for ${upload.name}.`
      );
    }
    await this.ensureAnyoneReader(drive, fileId);
    const file = await this.getDriveFile(drive, fileId);
    return this.toAssetRecord(upload, file, fileId);
  }
  async getDriveFile(drive, fileId) {
    const response = await drive.files.get({
      fileId,
      fields: "id,name,mimeType,webViewLink,webContentLink"
    });
    return response.data;
  }
  toAssetRecord(upload, file, fileId) {
    return {
      vaultPath: normalizeVaultPath(upload.vaultPath),
      fileId,
      name: asString(file.name) || upload.name,
      mimeType: asString(file.mimeType) || upload.mimeType,
      checksum: upload.checksum,
      kind: upload.kind,
      webViewLink: asString(file.webViewLink) || fallbackDriveUrl(fileId),
      webContentLink: asString(file.webContentLink) || void 0,
      lastUploaded: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  async ensureAnyoneReader(drive, fileId) {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          type: "anyone",
          role: "reader"
        },
        fields: "id"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (getErrorStatus(error) !== 409 && !message.includes("already exists") && !message.includes("duplicate")) {
        throw error;
      }
    }
  }
  async patchCodeBlocks(docs, documentId) {
    const warnings = [];
    try {
      const document2 = await docs.documents.get({
        documentId,
        fields: "body(content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content))),table(tableRows(tableCells(content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content)))))))))"
      });
      const paragraphs = this.collectParagraphTexts(document2.data);
      const patches = this.findCodeBlockPatches(paragraphs, warnings);
      if (patches.length === 0) {
        return warnings;
      }
      const requests = [];
      for (const patch of patches) {
        requests.push({
          updateParagraphStyle: {
            range: patch.styleRange,
            paragraphStyle: {
              shading: {
                backgroundColor: {
                  color: {
                    rgbColor: GOOGLE_DOCS_CODE_BLOCK_BACKGROUND
                  }
                }
              }
            },
            fields: "shading"
          }
        });
      }
      const deletionRanges = patches.flatMap((patch) => patch.deletionRanges).filter((range) => range.endIndex > range.startIndex).sort((left, right) => right.startIndex - left.startIndex);
      for (const range of deletionRanges) {
        requests.push({ deleteContentRange: { range } });
      }
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests }
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warnings.push(`Could not apply Google Docs code block styling: ${detail}`);
    }
    return warnings;
  }
  collectParagraphTexts(document2) {
    const paragraphs = [];
    const scanContent = (content) => {
      for (const element of content ?? []) {
        const paragraph = element.paragraph;
        if (paragraph && typeof element.startIndex === "number" && typeof element.endIndex === "number") {
          let text = "";
          const runs = [];
          for (const paragraphElement of paragraph.elements ?? []) {
            const content2 = paragraphElement.textRun?.content;
            const startIndex = paragraphElement.startIndex;
            if (typeof content2 !== "string" || typeof startIndex !== "number") {
              continue;
            }
            const offsetStart = text.length;
            text += content2;
            runs.push({
              offsetStart,
              offsetEnd: text.length,
              startIndex
            });
          }
          paragraphs.push({
            startIndex: element.startIndex,
            endIndex: element.endIndex,
            text,
            runs
          });
        }
        if (Array.isArray(element.table?.tableRows)) {
          for (const row of element.table.tableRows) {
            for (const cell of row.tableCells ?? []) {
              scanContent(cell.content ?? []);
            }
          }
        }
      }
    };
    scanContent(document2.body?.content ?? []);
    return paragraphs.sort((left, right) => left.startIndex - right.startIndex);
  }
  findCodeBlockPatches(paragraphs, warnings) {
    const markers = [];
    for (const paragraph of paragraphs) {
      GOOGLE_DOCS_CODE_BLOCK_MARKER.lastIndex = 0;
      let match = GOOGLE_DOCS_CODE_BLOCK_MARKER.exec(paragraph.text);
      while (match) {
        markers.push({
          blockIndex: Number(match[1]),
          type: match[2],
          marker: match[0],
          offset: match.index,
          paragraph
        });
        match = GOOGLE_DOCS_CODE_BLOCK_MARKER.exec(paragraph.text);
      }
    }
    const starts = /* @__PURE__ */ new Map();
    const patches = [];
    for (const marker of markers) {
      if (marker.type === "START") {
        starts.set(marker.blockIndex, marker);
        continue;
      }
      const start = starts.get(marker.blockIndex);
      if (!start) {
        warnings.push(
          `Could not find start marker for code block ${marker.blockIndex}.`
        );
        continue;
      }
      starts.delete(marker.blockIndex);
      const styleStart = start.paragraph.startIndex;
      const styleEnd = Math.max(styleStart, marker.paragraph.endIndex - 1);
      patches.push({
        styleRange: { startIndex: styleStart, endIndex: styleEnd },
        deletionRanges: [
          this.codeBlockMarkerDeletionRange(start),
          this.codeBlockMarkerDeletionRange(marker)
        ]
      });
    }
    for (const blockIndex of starts.keys()) {
      warnings.push(`Could not find end marker for code block ${blockIndex}.`);
    }
    return patches;
  }
  codeBlockMarkerDeletionRange(marker) {
    const paragraph = marker.paragraph;
    let startOffset = marker.offset;
    let endOffset = marker.offset + marker.marker.length;
    if (marker.type === "START") {
      endOffset = this.includeFollowingLineBreak(paragraph.text, endOffset);
    } else {
      startOffset = this.includePrecedingLineBreak(paragraph.text, startOffset);
    }
    return {
      startIndex: this.paragraphOffsetToDocumentIndex(paragraph, startOffset),
      endIndex: this.paragraphOffsetToDocumentIndex(paragraph, endOffset)
    };
  }
  includeFollowingLineBreak(text, offset) {
    if (text[offset] === "\r" && text[offset + 1] === "\n") {
      return offset + 2;
    }
    if (text[offset] === "\n" || text[offset] === "\r" || text[offset] === "\v") {
      return offset + 1;
    }
    return offset;
  }
  includePrecedingLineBreak(text, offset) {
    if (text[offset - 2] === "\r" && text[offset - 1] === "\n") {
      return offset - 2;
    }
    if (text[offset - 1] === "\n" || text[offset - 1] === "\r" || text[offset - 1] === "\v") {
      return offset - 1;
    }
    return offset;
  }
  paragraphOffsetToDocumentIndex(paragraph, offset) {
    for (const run of paragraph.runs) {
      if (offset >= run.offsetStart && offset <= run.offsetEnd) {
        return run.startIndex + offset - run.offsetStart;
      }
    }
    return Math.max(paragraph.startIndex, paragraph.endIndex - 1);
  }
  async clearDocumentBody(docs, documentId) {
    const document2 = await docs.documents.get({
      documentId,
      fields: "body(content(endIndex))"
    });
    const { bodyEndIndex } = this.collectDocumentParagraphRanges(document2.data);
    if (!bodyEndIndex || bodyEndIndex <= 2) {
      return;
    }
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            deleteContentRange: {
              range: { startIndex: 1, endIndex: bodyEndIndex - 1 }
            }
          }
        ]
      }
    });
  }
  async applyDocumentSpacing(docs, documentId) {
    try {
      const document2 = await docs.documents.get({
        documentId,
        fields: "body(content(startIndex,endIndex,paragraph(paragraphStyle),table(tableRows(tableCells(content(startIndex,endIndex,paragraph(paragraphStyle)))))))"
      });
      const { bodyEndIndex, headingRanges } = this.collectDocumentParagraphRanges(document2.data);
      if (!bodyEndIndex || bodyEndIndex <= 2) {
        return null;
      }
      const requests = [
        {
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: bodyEndIndex - 1 },
            paragraphStyle: {
              spaceBelow: {
                magnitude: GOOGLE_DOCS_PARAGRAPH_SPACE_AFTER_PT,
                unit: "PT"
              }
            },
            fields: "spaceBelow"
          }
        }
      ];
      for (const range of headingRanges) {
        requests.push({
          updateParagraphStyle: {
            range,
            paragraphStyle: {
              spaceAbove: {
                magnitude: GOOGLE_DOCS_HEADING_SPACE_ABOVE_PT,
                unit: "PT"
              }
            },
            fields: "spaceAbove"
          }
        });
      }
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests }
      });
      return null;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return `Could not apply Google Docs document spacing: ${detail}`;
    }
  }
  collectDocumentParagraphRanges(document2) {
    let endIndex = 0;
    const headingRanges = [];
    const scanContent = (content) => {
      for (const element of content ?? []) {
        if (typeof element.endIndex === "number") {
          endIndex = Math.max(endIndex, element.endIndex);
        }
        const namedStyleType = element.paragraph?.paragraphStyle?.namedStyleType;
        if (typeof element.startIndex === "number" && typeof element.endIndex === "number" && element.endIndex > element.startIndex && isGoogleDocsHeadingStyle(namedStyleType)) {
          headingRanges.push({
            startIndex: element.startIndex,
            endIndex: Math.max(element.startIndex, element.endIndex - 1)
          });
        }
        if (Array.isArray(element.table?.tableRows)) {
          for (const row of element.table.tableRows) {
            for (const cell of row.tableCells ?? []) {
              scanContent(cell.content ?? []);
            }
          }
        }
      }
    };
    scanContent(document2.body?.content ?? []);
    return {
      bodyEndIndex: endIndex || void 0,
      headingRanges
    };
  }
  async patchMediaPlaceholders(docs, documentId, replacements) {
    const warnings = [];
    if (replacements.length === 0) {
      return warnings;
    }
    const document2 = await docs.documents.get({ documentId });
    const found = this.findMarkerRanges(document2.data, replacements);
    for (const replacement of found.sort(
      (left, right) => right.range.startIndex - left.range.startIndex
    )) {
      const warning = await this.patchSinglePlaceholder(
        docs,
        documentId,
        replacement.range,
        replacement.replacement
      );
      if (warning) {
        warnings.push(warning);
      }
    }
    const foundMarkers = new Set(found.map((entry) => entry.replacement.marker));
    for (const replacement of replacements) {
      if (!foundMarkers.has(replacement.marker)) {
        warnings.push(`Could not find placeholder for ${replacement.original}.`);
      }
    }
    return warnings;
  }
  findMarkerRanges(document2, replacements) {
    const byMarker = new Map(replacements.map((item) => [item.marker, item]));
    const ranges = [];
    const scanElements = (elements) => {
      for (const element of elements ?? []) {
        const paragraphElements = element.paragraph?.elements;
        if (Array.isArray(paragraphElements)) {
          for (const paragraphElement of paragraphElements) {
            const content = paragraphElement.textRun?.content;
            const startIndex = paragraphElement.startIndex;
            if (typeof content !== "string" || typeof startIndex !== "number") {
              continue;
            }
            for (const [marker, replacement] of byMarker) {
              let index = content.indexOf(marker);
              while (index >= 0) {
                ranges.push({
                  replacement,
                  range: {
                    startIndex: startIndex + index,
                    endIndex: startIndex + index + marker.length
                  }
                });
                index = content.indexOf(marker, index + marker.length);
              }
            }
          }
        }
        if (Array.isArray(element.table?.tableRows)) {
          for (const row of element.table.tableRows) {
            for (const cell of row.tableCells ?? []) {
              scanElements(cell.content ?? []);
            }
          }
        }
      }
    };
    scanElements(document2.body?.content ?? []);
    return ranges;
  }
  async patchSinglePlaceholder(docs, documentId, range, replacement) {
    const imageUri = replacement.asset?.webContentLink;
    const viewLink = replacement.asset?.webViewLink;
    if (replacement.kind === "image" && replacement.inlineSupported && imageUri) {
      try {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [
              { deleteContentRange: { range } },
              {
                insertInlineImage: {
                  uri: imageUri,
                  location: { index: range.startIndex }
                }
              }
            ]
          }
        });
        return null;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.insertFallbackText(docs, documentId, range, replacement);
        return `Could not inline ${replacement.original}: ${detail}`;
      }
    }
    if (replacement.kind === "video" && viewLink) {
      try {
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [
              { deleteContentRange: { range } },
              {
                insertRichLink: {
                  richLinkProperties: {
                    uri: viewLink
                  },
                  location: { index: range.startIndex }
                }
              }
            ]
          }
        });
        return null;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.insertFallbackText(docs, documentId, range, replacement);
        return `Could not insert video link for ${replacement.original}: ${detail}`;
      }
    }
    await this.insertFallbackText(docs, documentId, range, replacement);
    return replacement.warning ?? null;
  }
  async insertFallbackText(docs, documentId, range, replacement) {
    const link = replacement.asset?.webViewLink;
    const text = link ? `${replacement.original} ${link}` : replacement.original;
    const textEnd = range.startIndex + text.length;
    const textStyle = {
      italic: true,
      foregroundColor: {
        color: {
          rgbColor: {
            red: 0.45,
            green: 0.45,
            blue: 0.45
          }
        }
      }
    };
    let fields = "italic,foregroundColor";
    if (link) {
      textStyle.link = { url: link };
      fields += ",link";
    }
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          { deleteContentRange: { range } },
          { insertText: { location: { index: range.startIndex }, text } },
          {
            updateTextStyle: {
              range: { startIndex: range.startIndex, endIndex: textEnd },
              textStyle,
              fields
            }
          }
        ]
      }
    });
  }
  async trashRemovedAssets(drive, previousAssets, nextAssets) {
    const nextIds = new Set(nextAssets.map((asset) => asset.fileId));
    const removed = previousAssets.filter((asset) => !nextIds.has(asset.fileId));
    await Promise.all(
      removed.map(async (asset) => {
        try {
          await drive.files.update({
            fileId: asset.fileId,
            requestBody: { trashed: true },
            fields: "id"
          });
        } catch {
        }
      })
    );
  }
};

// node_modules/marked/lib/marked.esm.js
function z() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var T = z();
function G(l3) {
  T = l3;
}
var _ = { exec: () => null };
function k(l3, e = "") {
  let t = typeof l3 == "string" ? l3 : l3.source, n = { replace: (s, r) => {
    let i = typeof r == "string" ? r : r.source;
    return i = i.replace(m.caret, "$1"), t = t.replace(s, i), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var Re = ((l3 = "") => {
  try {
    return !!new RegExp("(?<=1)(?<!1)" + l3);
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l3) => new RegExp(`^( {0,3}${l3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}#`), htmlBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}<(?:[a-z].*>|!--)`, "i"), blockquoteBeginRegex: (l3) => new RegExp(`^ {0,${Math.min(3, l3 - 1)}}>`) };
var Te = /^(?:[ \t]*(?:\n|$))+/;
var Oe = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var we = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var I = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var ye = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var Q = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
var ie = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var oe = k(ie).replace(/bull/g, Q).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var Pe = k(ie).replace(/bull/g, Q).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var j = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var Se = /^[^\n]+/;
var F = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var $e = k(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", F).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var Le = k(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, Q).getRegex();
var v = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var U = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var _e = k("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", U).replace("tag", v).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var ae = k(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var Me = k(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", ae).getRegex();
var K = { blockquote: Me, code: Oe, def: $e, fences: we, heading: ye, hr: I, html: _e, lheading: oe, list: Le, newline: Te, paragraph: ae, table: _, text: Se };
var re = k("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var ze = { ...K, lheading: Pe, table: re, paragraph: k(j).replace("hr", I).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", re).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex() };
var Ee = { ...K, html: k(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", U).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: k(j).replace("hr", I).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", oe).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ce = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var le = /^( {2,}|\\)\n(?!\s*$)/;
var Ie = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var E = /[\p{P}\p{S}]/u;
var H = /[\s\p{P}\p{S}]/u;
var W = /[^\s\p{P}\p{S}]/u;
var Be = k(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, H).getRegex();
var ue = /(?!~)[\p{P}\p{S}]/u;
var De = /(?!~)[\s\p{P}\p{S}]/u;
var qe = /(?:[^\s\p{P}\p{S}]|~)/u;
var ve = k(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Re ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var pe = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
var He = k(pe, "u").replace(/punct/g, E).getRegex();
var Ze = k(pe, "u").replace(/punct/g, ue).getRegex();
var ce = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ge = k(ce, "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H).replace(/punct/g, E).getRegex();
var Ne = k(ce, "gu").replace(/notPunctSpace/g, qe).replace(/punctSpace/g, De).replace(/punct/g, ue).getRegex();
var Qe = k("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H).replace(/punct/g, E).getRegex();
var je = k(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, E).getRegex();
var Fe = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
var Ue = k(Fe, "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H).replace(/punct/g, E).getRegex();
var Ke = k(/\\(punct)/, "gu").replace(/punct/g, E).getRegex();
var We = k(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var Xe = k(U).replace("(?:-->|$)", "-->").getRegex();
var Je = k("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Xe).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var q = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
var Ve = k(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", q).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var he = k(/^!?\[(label)\]\[(ref)\]/).replace("label", q).replace("ref", F).getRegex();
var ke = k(/^!?\[(ref)\](?:\[\])?/).replace("ref", F).getRegex();
var Ye = k("reflink|nolink(?!\\()", "g").replace("reflink", he).replace("nolink", ke).getRegex();
var se = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var X = { _backpedal: _, anyPunctuation: Ke, autolink: We, blockSkip: ve, br: le, code: Ce, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: He, emStrongRDelimAst: Ge, emStrongRDelimUnd: Qe, escape: Ae, link: Ve, nolink: ke, punctuation: Be, reflink: he, reflinkSearch: Ye, tag: Je, text: Ie, url: _ };
var et = { ...X, link: k(/^!?\[(label)\]\((.*?)\)/).replace("label", q).getRegex(), reflink: k(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", q).getRegex() };
var N = { ...X, emStrongRDelimAst: Ne, emStrongLDelim: Ze, delLDelim: je, delRDelim: Ue, url: k(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", se).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: k(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", se).getRegex() };
var tt = { ...N, br: k(le).replace("{2,}", "*").getRegex(), text: k(N.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var B = { normal: K, gfm: ze, pedantic: Ee };
var A = { normal: X, gfm: N, breaks: tt, pedantic: et };
var nt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var de = (l3) => nt[l3];
function O(l3, e) {
  if (e) {
    if (m.escapeTest.test(l3)) return l3.replace(m.escapeReplace, de);
  } else if (m.escapeTestNoEncode.test(l3)) return l3.replace(m.escapeReplaceNoEncode, de);
  return l3;
}
function J(l3) {
  try {
    l3 = encodeURI(l3).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return l3;
}
function V(l3, e) {
  let t = l3.replace(m.findPipe, (r, i, o) => {
    let u = false, a = i;
    for (; --a >= 0 && o[a] === "\\"; ) u = !u;
    return u ? "|" : " |";
  }), n = t.split(m.splitPipe), s = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
  else for (; n.length < e; ) n.push("");
  for (; s < n.length; s++) n[s] = n[s].trim().replace(m.slashPipe, "|");
  return n;
}
function $(l3, e, t) {
  let n = l3.length;
  if (n === 0) return "";
  let s = 0;
  for (; s < n; ) {
    let r = l3.charAt(n - s - 1);
    if (r === e && !t) s++;
    else if (r !== e && t) s++;
    else break;
  }
  return l3.slice(0, n - s);
}
function Y(l3) {
  let e = l3.split(`
`), t = e.length - 1;
  for (; t >= 0 && m.blankLine.test(e[t]); ) t--;
  return e.length - t <= 2 ? l3 : e.slice(0, t + 1).join(`
`);
}
function ge(l3, e) {
  if (l3.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < l3.length; n++) if (l3[n] === "\\") n++;
  else if (l3[n] === e[0]) t++;
  else if (l3[n] === e[1] && (t--, t < 0)) return n;
  return t > 0 ? -2 : -1;
}
function fe(l3, e = 0) {
  let t = e, n = "";
  for (let s of l3) if (s === "	") {
    let r = 4 - t % 4;
    n += " ".repeat(r), t += r;
  } else n += s, t++;
  return n;
}
function me(l3, e, t, n, s) {
  let r = e.href, i = e.title || null, o = l3[1].replace(s.other.outputLinkReplace, "$1");
  n.state.inLink = true;
  let u = { type: l3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: r, title: i, text: o, tokens: n.inlineTokens(o) };
  return n.state.inLink = false, u;
}
function rt(l3, e, t) {
  let n = l3.match(t.other.indentCodeCompensation);
  if (n === null) return e;
  let s = n[1];
  return e.split(`
`).map((r) => {
    let i = r.match(t.other.beginningSpace);
    if (i === null) return r;
    let [o] = i;
    return o.length >= s.length ? r.slice(s.length) : r;
  }).join(`
`);
}
var w = class {
  constructor(e) {
    __publicField(this, "options");
    __publicField(this, "rules");
    __publicField(this, "lexer");
    this.options = e || T;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0) return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = this.options.pedantic ? t[0] : Y(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], s = rt(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let s = $(n, "#");
        (this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
      }
      return { type: "heading", raw: $(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t) return { type: "hr", raw: $(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = $(t[0], `
`).split(`
`), s = "", r = "", i = [];
      for (; n.length > 0; ) {
        let o = false, u = [], a;
        for (a = 0; a < n.length; a++) if (this.rules.other.blockquoteStart.test(n[a])) u.push(n[a]), o = true;
        else if (!o) u.push(n[a]);
        else break;
        n = n.slice(a);
        let c = u.join(`
`), p = c.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        s = s ? `${s}
${c}` : c, r = r ? `${r}
${p}` : p;
        let d = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(p, i, true), this.lexer.state.top = d, n.length === 0) break;
        let h = i.at(-1);
        if (h?.type === "code") break;
        if (h?.type === "blockquote") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
          i[i.length - 1] = S, s = s.substring(0, s.length - R.raw.length) + S.raw, r = r.substring(0, r.length - R.text.length) + S.text;
          break;
        } else if (h?.type === "list") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
          i[i.length - 1] = S, s = s.substring(0, s.length - h.raw.length) + S.raw, r = r.substring(0, r.length - R.raw.length) + S.raw, n = f.substring(i.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: s, tokens: i, text: r };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
      let i = this.rules.other.listItemRegex(n), o = false;
      for (; e; ) {
        let a = false, c = "", p = "";
        if (!(t = i.exec(e)) || this.rules.block.hr.test(e)) break;
        c = t[0], e = e.substring(c.length);
        let d = fe(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !d.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, p = d.trimStart()) : R ? f = t[1].length + 1 : (f = d.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, p = d.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (c += h + `
`, e = e.substring(h.length + 1), a = true), !a) {
          let S = this.rules.other.nextBulletRegex(f), ee = this.rules.other.hrRegex(f), te = this.rules.other.fencesBeginRegex(f), ne = this.rules.other.headingBeginRegex(f), xe = this.rules.other.htmlBeginRegex(f), be = this.rules.other.blockquoteBeginRegex(f);
          for (; e; ) {
            let Z = e.split(`
`, 1)[0], C;
            if (h = Z, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), C = h) : C = h.replace(this.rules.other.tabCharGlobal, "    "), te.test(h) || ne.test(h) || xe.test(h) || be.test(h) || S.test(h) || ee.test(h)) break;
            if (C.search(this.rules.other.nonSpaceChar) >= f || !h.trim()) p += `
` + C.slice(f);
            else {
              if (R || d.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || te.test(d) || ne.test(d) || ee.test(d)) break;
              p += `
` + h;
            }
            R = !h.trim(), c += Z + `
`, e = e.substring(Z.length + 1), d = C.slice(f);
          }
        }
        r.loose || (o ? r.loose = true : this.rules.other.doubleBlankLine.test(c) && (o = true)), r.items.push({ type: "list_item", raw: c, task: !!this.options.gfm && this.rules.other.listIsTask.test(p), loose: false, text: p, tokens: [] }), r.raw += c;
      }
      let u = r.items.at(-1);
      if (u) u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
      else return;
      r.raw = r.raw.trimEnd();
      for (let a of r.items) {
        if (this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []), a.task) {
          if (a.text = a.text.replace(this.rules.other.listReplaceTask, ""), a.tokens[0]?.type === "text" || a.tokens[0]?.type === "paragraph") {
            a.tokens[0].raw = a.tokens[0].raw.replace(this.rules.other.listReplaceTask, ""), a.tokens[0].text = a.tokens[0].text.replace(this.rules.other.listReplaceTask, "");
            for (let p = this.lexer.inlineQueue.length - 1; p >= 0; p--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[p].src)) {
              this.lexer.inlineQueue[p].src = this.lexer.inlineQueue[p].src.replace(this.rules.other.listReplaceTask, "");
              break;
            }
          }
          let c = this.rules.other.listTaskCheckbox.exec(a.raw);
          if (c) {
            let p = { type: "checkbox", raw: c[0] + " ", checked: c[0] !== "[ ]" };
            a.checked = p.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = p.raw + a.tokens[0].raw, a.tokens[0].text = p.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(p)) : a.tokens.unshift({ type: "paragraph", raw: p.raw, text: p.raw, tokens: [p] }) : a.tokens.unshift(p);
          }
        }
        if (!r.loose) {
          let c = a.tokens.filter((d) => d.type === "space"), p = c.length > 0 && c.some((d) => this.rules.other.anyLine.test(d.raw));
          r.loose = p;
        }
      }
      if (r.loose) for (let a of r.items) {
        a.loose = true;
        for (let c of a.tokens) c.type === "text" && (c.type = "paragraph");
      }
      return r;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) {
      let n = Y(t[0]);
      return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
    }
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: $(t[0], `
`), href: s, title: r };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
    let n = V(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = { type: "table", raw: $(t[0], `
`), header: [], align: [], rows: [] };
    if (n.length === s.length) {
      for (let o of s) this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
      for (let o = 0; o < n.length; o++) i.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: true, align: i.align[o] });
      for (let o of r) i.rows.push(V(o, i.header.length).map((u, a) => ({ text: u, tokens: this.lexer.inline(u), header: false, align: i.align[a] })));
      return i;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) {
      let n = t[1].trim();
      return { type: "heading", raw: $(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
    }
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t) return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n)) return;
        let i = $(n.slice(0, -1), "\\");
        if ((n.length - i.length) % 2 === 0) return;
      } else {
        let i = ge(t[2], "()");
        if (i === -2) return;
        if (i > -1) {
          let u = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
          t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, u).trim(), t[3] = "";
        }
      }
      let s = t[2], r = "";
      if (this.options.pedantic) {
        let i = this.rules.other.pedanticHrefTitle.exec(s);
        i && (s = i[1], r = i[3]);
      } else r = t[3] ? t[3].slice(1, -1) : "";
      return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), me(t, { href: s && s.replace(this.rules.inline.anyPunctuation, "$1"), title: r && r.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
      if (!r) {
        let i = n[0].charAt(0);
        return { type: "text", raw: i, text: i };
      }
      return me(n, r, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let s = this.rules.inline.emStrongLDelim.exec(e);
    if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i = [...s[0]].length - 1, o, u, a = i, c = 0, p = s[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (p.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = p.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o) continue;
        if (u = [...o].length, s[3] || s[4]) {
          a += u;
          continue;
        } else if ((s[5] || s[6]) && i % 3 && !((i + u) % 3)) {
          c += u;
          continue;
        }
        if (a -= u, a > 0) continue;
        u = Math.min(u, u + a + c);
        let d = [...s[0]][0].length, h = e.slice(0, i + s.index + d + u);
        if (Math.min(i, u) % 2) {
          let f = h.slice(1, -1);
          return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
        }
        let R = h.slice(2, -2);
        return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t) return { type: "br", raw: t[0] };
  }
  del(e, t, n = "") {
    let s = this.rules.inline.delLDelim.exec(e);
    if (!s) return;
    if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let i = [...s[0]].length - 1, o, u, a = i, c = this.rules.inline.delRDelim;
      for (c.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = c.exec(t)) !== null; ) {
        if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (u = [...o].length, u !== i)) continue;
        if (s[3] || s[4]) {
          a += u;
          continue;
        }
        if (a -= u, a > 0) continue;
        u = Math.min(u, u + a);
        let p = [...s[0]][0].length, d = e.slice(0, i + s.index + p + u), h = d.slice(i, -i);
        return { type: "del", raw: d, text: h, tokens: this.lexer.inlineTokens(h) };
      }
    }
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, s;
      return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, s;
      if (t[2] === "@") n = t[0], s = "mailto:" + n;
      else {
        let r;
        do
          r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (r !== t[0]);
        n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class l {
  constructor(e) {
    __publicField(this, "tokens");
    __publicField(this, "options");
    __publicField(this, "state");
    __publicField(this, "inlineQueue");
    __publicField(this, "tokenizer");
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t = { other: m, block: B.normal, inline: A.normal };
    this.options.pedantic ? (t.block = B.pedantic, t.inline = A.pedantic) : this.options.gfm && (t.block = B.gfm, this.options.breaks ? t.inline = A.breaks : t.inline = A.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: B, inline: A };
  }
  static lex(e, t) {
    return new l(t).lex(e);
  }
  static lexInline(e, t) {
    return new l(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0; t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
    let s = 1 / 0;
    for (; e; ) {
      if (e.length < s) s = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      let r;
      if (this.options.extensions?.block?.some((o) => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        r.raw.length === 1 && o !== void 0 ? o.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i = e;
      if (this.options.extensions?.startBlock) {
        let o = 1 / 0, u = e.slice(1), a;
        this.options.extensions.startBlock.forEach((c) => {
          a = c.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (o = Math.min(o, a));
        }), o < 1 / 0 && o >= 0 && (i = e.substring(0, o + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i))) {
        let o = t.at(-1);
        n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let o = t.at(-1);
        o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  inlineTokens(e, t = []) {
    this.tokenizer.lexer = this;
    let n = e, s = null;
    if (this.tokens.links) {
      let a = Object.keys(this.tokens.links);
      if (a.length > 0) for (; (s = this.tokenizer.rules.inline.reflinkSearch.exec(n)) !== null; ) a.includes(s[0].slice(s[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, s.index) + "[" + "a".repeat(s[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (; (s = this.tokenizer.rules.inline.anyPunctuation.exec(n)) !== null; ) n = n.slice(0, s.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let r;
    for (; (s = this.tokenizer.rules.inline.blockSkip.exec(n)) !== null; ) r = s[2] ? s[2].length : 0, n = n.slice(0, s.index + r) + "[" + "a".repeat(s[0].length - r - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let i = false, o = "", u = 1 / 0;
    for (; e; ) {
      if (e.length < u) u = e.length;
      else {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
      i || (o = ""), i = false;
      let a;
      if (this.options.extensions?.inline?.some((p) => (a = p.call({ lexer: this }, e, t)) ? (e = e.substring(a.raw.length), t.push(a), true) : false)) continue;
      if (a = this.tokenizer.escape(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.tag(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.link(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(a.raw.length);
        let p = t.at(-1);
        a.type === "text" && p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
        continue;
      }
      if (a = this.tokenizer.emStrong(e, n, o)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.codespan(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.br(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.del(e, n, o)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (a = this.tokenizer.autolink(e)) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      if (!this.state.inLink && (a = this.tokenizer.url(e))) {
        e = e.substring(a.raw.length), t.push(a);
        continue;
      }
      let c = e;
      if (this.options.extensions?.startInline) {
        let p = 1 / 0, d = e.slice(1), h;
        this.options.extensions.startInline.forEach((R) => {
          h = R.call({ lexer: this }, d), typeof h == "number" && h >= 0 && (p = Math.min(p, h));
        }), p < 1 / 0 && p >= 0 && (c = e.substring(0, p + 1));
      }
      if (a = this.tokenizer.inlineText(c)) {
        e = e.substring(a.raw.length), a.raw.slice(-1) !== "_" && (o = a.raw.slice(-1)), i = true;
        let p = t.at(-1);
        p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
        continue;
      }
      if (e) {
        this.infiniteLoopError(e.charCodeAt(0));
        break;
      }
    }
    return t;
  }
  infiniteLoopError(e) {
    let t = "Infinite loop on byte: " + e;
    if (this.options.silent) console.error(t);
    else throw new Error(t);
  }
};
var y = class {
  constructor(e) {
    __publicField(this, "options");
    __publicField(this, "parser");
    this.options = e || T;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
    return s ? '<pre><code class="language-' + O(s) + '">' + (n ? r : O(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let t = e.ordered, n = e.start, s = "";
    for (let o = 0; o < e.items.length; o++) {
      let u = e.items[o];
      s += this.listitem(u);
    }
    let r = t ? "ol" : "ul", i = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + r + i + `>
` + s + "</" + r + `>
`;
  }
  listitem(e) {
    return `<li>${this.parser.parse(e.tokens)}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let r = 0; r < e.header.length; r++) n += this.tablecell(e.header[r]);
    t += this.tablerow({ text: n });
    let s = "";
    for (let r = 0; r < e.rows.length; r++) {
      let i = e.rows[r];
      n = "";
      for (let o = 0; o < i.length; o++) n += this.tablecell(i[o]);
      s += this.tablerow({ text: n });
    }
    return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${O(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let s = this.parser.parseInline(n), r = J(e);
    if (r === null) return s;
    e = r;
    let i = '<a href="' + e + '"';
    return t && (i += ' title="' + O(t) + '"'), i += ">" + s + "</a>", i;
  }
  image({ href: e, title: t, text: n, tokens: s }) {
    s && (n = this.parser.parseInline(s, this.parser.textRenderer));
    let r = J(e);
    if (r === null) return O(n);
    e = r;
    let i = `<img src="${e}" alt="${O(n)}"`;
    return t && (i += ` title="${O(t)}"`), i += ">", i;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text);
  }
};
var L = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
  checkbox({ raw: e }) {
    return e;
  }
};
var b = class l2 {
  constructor(e) {
    __publicField(this, "options");
    __publicField(this, "renderer");
    __publicField(this, "textRenderer");
    this.options = e || T, this.options.renderer = this.options.renderer || new y(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L();
  }
  static parse(e, t) {
    return new l2(t).parse(e);
  }
  static parseInline(e, t) {
    return new l2(t).parseInline(e);
  }
  parse(e) {
    this.renderer.parser = this;
    let t = "";
    for (let n = 0; n < e.length; n++) {
      let s = e[n];
      if (this.options.extensions?.renderers?.[s.type]) {
        let i = s, o = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(i.type)) {
          t += o || "";
          continue;
        }
      }
      let r = s;
      switch (r.type) {
        case "space": {
          t += this.renderer.space(r);
          break;
        }
        case "hr": {
          t += this.renderer.hr(r);
          break;
        }
        case "heading": {
          t += this.renderer.heading(r);
          break;
        }
        case "code": {
          t += this.renderer.code(r);
          break;
        }
        case "table": {
          t += this.renderer.table(r);
          break;
        }
        case "blockquote": {
          t += this.renderer.blockquote(r);
          break;
        }
        case "list": {
          t += this.renderer.list(r);
          break;
        }
        case "checkbox": {
          t += this.renderer.checkbox(r);
          break;
        }
        case "html": {
          t += this.renderer.html(r);
          break;
        }
        case "def": {
          t += this.renderer.def(r);
          break;
        }
        case "paragraph": {
          t += this.renderer.paragraph(r);
          break;
        }
        case "text": {
          t += this.renderer.text(r);
          break;
        }
        default: {
          let i = 'Token with "' + r.type + '" type was not found.';
          if (this.options.silent) return console.error(i), "";
          throw new Error(i);
        }
      }
    }
    return t;
  }
  parseInline(e, t = this.renderer) {
    this.renderer.parser = this;
    let n = "";
    for (let s = 0; s < e.length; s++) {
      let r = e[s];
      if (this.options.extensions?.renderers?.[r.type]) {
        let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
        if (o !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
          n += o || "";
          continue;
        }
      }
      let i = r;
      switch (i.type) {
        case "escape": {
          n += t.text(i);
          break;
        }
        case "html": {
          n += t.html(i);
          break;
        }
        case "link": {
          n += t.link(i);
          break;
        }
        case "image": {
          n += t.image(i);
          break;
        }
        case "checkbox": {
          n += t.checkbox(i);
          break;
        }
        case "strong": {
          n += t.strong(i);
          break;
        }
        case "em": {
          n += t.em(i);
          break;
        }
        case "codespan": {
          n += t.codespan(i);
          break;
        }
        case "br": {
          n += t.br(i);
          break;
        }
        case "del": {
          n += t.del(i);
          break;
        }
        case "text": {
          n += t.text(i);
          break;
        }
        default: {
          let o = 'Token with "' + i.type + '" type was not found.';
          if (this.options.silent) return console.error(o), "";
          throw new Error(o);
        }
      }
    }
    return n;
  }
};
var _a;
var P = (_a = class {
  constructor(e) {
    __publicField(this, "options");
    __publicField(this, "block");
    this.options = e || T;
  }
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer(e = this.block) {
    return e ? x.lex : x.lexInline;
  }
  provideParser(e = this.block) {
    return e ? b.parse : b.parseInline;
  }
}, __publicField(_a, "passThroughHooks", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"])), __publicField(_a, "passThroughHooksRespectAsync", /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"])), _a);
var D = class {
  constructor(...e) {
    __publicField(this, "defaults", z());
    __publicField(this, "options", this.setOptions);
    __publicField(this, "parse", this.parseMarkdown(true));
    __publicField(this, "parseInline", this.parseMarkdown(false));
    __publicField(this, "Parser", b);
    __publicField(this, "Renderer", y);
    __publicField(this, "TextRenderer", L);
    __publicField(this, "Lexer", x);
    __publicField(this, "Tokenizer", w);
    __publicField(this, "Hooks", P);
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let s of e) switch (n = n.concat(t.call(this, s)), s.type) {
      case "table": {
        let r = s;
        for (let i of r.header) n = n.concat(this.walkTokens(i.tokens, t));
        for (let i of r.rows) for (let o of i) n = n.concat(this.walkTokens(o.tokens, t));
        break;
      }
      case "list": {
        let r = s;
        n = n.concat(this.walkTokens(r.items, t));
        break;
      }
      default: {
        let r = s;
        this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((i) => {
          let o = r[i].flat(1 / 0);
          n = n.concat(this.walkTokens(o, t));
        }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
      }
    }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let s = { ...n };
      if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach((r) => {
        if (!r.name) throw new Error("extension name required");
        if ("renderer" in r) {
          let i = t.renderers[r.name];
          i ? t.renderers[r.name] = function(...o) {
            let u = r.renderer.apply(this, o);
            return u === false && (u = i.apply(this, o)), u;
          } : t.renderers[r.name] = r.renderer;
        }
        if ("tokenizer" in r) {
          if (!r.level || r.level !== "block" && r.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let i = t[r.level];
          i ? i.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
        }
        "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
      }), s.extensions = t), n.renderer) {
        let r = this.defaults.renderer || new y(this.defaults);
        for (let i in n.renderer) {
          if (!(i in r)) throw new Error(`renderer '${i}' does not exist`);
          if (["options", "parser"].includes(i)) continue;
          let o = i, u = n.renderer[o], a = r[o];
          r[o] = (...c) => {
            let p = u.apply(r, c);
            return p === false && (p = a.apply(r, c)), p || "";
          };
        }
        s.renderer = r;
      }
      if (n.tokenizer) {
        let r = this.defaults.tokenizer || new w(this.defaults);
        for (let i in n.tokenizer) {
          if (!(i in r)) throw new Error(`tokenizer '${i}' does not exist`);
          if (["options", "rules", "lexer"].includes(i)) continue;
          let o = i, u = n.tokenizer[o], a = r[o];
          r[o] = (...c) => {
            let p = u.apply(r, c);
            return p === false && (p = a.apply(r, c)), p;
          };
        }
        s.tokenizer = r;
      }
      if (n.hooks) {
        let r = this.defaults.hooks || new P();
        for (let i in n.hooks) {
          if (!(i in r)) throw new Error(`hook '${i}' does not exist`);
          if (["options", "block"].includes(i)) continue;
          let o = i, u = n.hooks[o], a = r[o];
          P.passThroughHooks.has(i) ? r[o] = (c) => {
            if (this.defaults.async && P.passThroughHooksRespectAsync.has(i)) return (async () => {
              let d = await u.call(r, c);
              return a.call(r, d);
            })();
            let p = u.call(r, c);
            return a.call(r, p);
          } : r[o] = (...c) => {
            if (this.defaults.async) return (async () => {
              let d = await u.apply(r, c);
              return d === false && (d = await a.apply(r, c)), d;
            })();
            let p = u.apply(r, c);
            return p === false && (p = a.apply(r, c)), p;
          };
        }
        s.hooks = r;
      }
      if (n.walkTokens) {
        let r = this.defaults.walkTokens, i = n.walkTokens;
        s.walkTokens = function(o) {
          let u = [];
          return u.push(i.call(this, o)), r && (u = u.concat(r.call(this, o))), u;
        };
      }
      this.defaults = { ...this.defaults, ...s };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, s) => {
      let r = { ...s }, i = { ...this.defaults, ...r }, o = this.onError(!!i.silent, !!i.async);
      if (this.defaults.async === true && r.async === false) return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null) return o(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string") return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async) return (async () => {
        let u = i.hooks ? await i.hooks.preprocess(n) : n, c = await (i.hooks ? await i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(u, i), p = i.hooks ? await i.hooks.processAllTokens(c) : c;
        i.walkTokens && await Promise.all(this.walkTokens(p, i.walkTokens));
        let h = await (i.hooks ? await i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(p, i);
        return i.hooks ? await i.hooks.postprocess(h) : h;
      })().catch(o);
      try {
        i.hooks && (n = i.hooks.preprocess(n));
        let a = (i.hooks ? i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i);
        i.hooks && (a = i.hooks.processAllTokens(a)), i.walkTokens && this.walkTokens(a, i.walkTokens);
        let p = (i.hooks ? i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i);
        return i.hooks && (p = i.hooks.postprocess(p)), p;
      } catch (u) {
        return o(u);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let s = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(s) : s;
      }
      if (t) return Promise.reject(n);
      throw n;
    };
  }
};
var M = new D();
function g(l3, e) {
  return M.parse(l3, e);
}
g.options = g.setOptions = function(l3) {
  return M.setOptions(l3), g.defaults = M.defaults, G(g.defaults), g;
};
g.getDefaults = z;
g.defaults = T;
g.use = function(...l3) {
  return M.use(...l3), g.defaults = M.defaults, G(g.defaults), g;
};
g.walkTokens = function(l3, e) {
  return M.walkTokens(l3, e);
};
g.parseInline = M.parseInline;
g.Parser = b;
g.parser = b.parse;
g.Renderer = y;
g.TextRenderer = L;
g.Lexer = x;
g.lexer = x.lex;
g.Tokenizer = w;
g.Hooks = P;
g.parse = g;
var jt = g.options;
var Ft = g.setOptions;
var Ut = g.use;
var Kt = g.walkTokens;
var Wt = g.parseInline;
var Jt = b.parse;
var Vt = x.lex;

// src/services/google-docs-renderer.ts
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
function isAbsoluteUrl(href) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}
function mediaMarker(index) {
  return `GVP_MEDIA_${index}_PLACEHOLDER`;
}
function codeBlockStartMarker(index) {
  return `GVP_CODE_BLOCK_${index}_START`;
}
function codeBlockEndMarker(index) {
  return `GVP_CODE_BLOCK_${index}_END`;
}
function unresolvedPlaceholder(label) {
  return `<span style="color:#777;font-style:italic;">${escapeHtml(label)}</span>`;
}
var GOOGLE_DOCS_IMPORT_STYLE = [
  "body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.15;color:#202124;}",
  "p{margin:0 0 6pt 0;}",
  "h1,h2,h3,h4,h5,h6{line-height:1.2;margin:12pt 0 6pt 0;}",
  "h1{font-size:20pt;}",
  "h2{font-size:16pt;}",
  "h3{font-size:14pt;}",
  "ul,ol{margin-top:0;margin-bottom:6pt;}",
  "li{margin:0 0 3pt 0;}",
  "blockquote{color:#5f6368;margin:0 0 6pt 18pt;}",
  "pre{margin:0 0 6pt 0;white-space:pre-wrap;background-color:#f1f3f4;padding:6pt;}",
  'code{font-family:"Courier New",monospace;font-size:10pt;}',
  "table{border-collapse:collapse;margin:0 0 6pt 0;}",
  "th,td{border:1px solid #dadce0;padding:4pt 6pt;}",
  "img{max-width:100%;}"
].join("");
function buildDocumentHtml(title, bodyHtml) {
  return [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${GOOGLE_DOCS_IMPORT_STYLE}</style>`,
    "</head><body>",
    bodyHtml,
    "</body></html>"
  ].join("");
}
function renderGoogleDocsMarkdown(source, options) {
  const mediaRefs = [];
  const warnings = [];
  let codeBlockCount = 0;
  const preprocessed = source.replace(/!\[\[([^\]]+)\]\]/g, (original, rawTarget) => {
    const marker = mediaMarker(mediaRefs.length);
    mediaRefs.push({
      marker,
      target: rawTarget.trim(),
      original,
      altText: rawTarget.trim(),
      source: "obsidian-embed"
    });
    return marker;
  }).replace(/\[\[([^\]]+)\]\]/g, (original) => {
    warnings.push(
      `Obsidian link ${original} was kept as a grey italic placeholder.`
    );
    return unresolvedPlaceholder(original);
  });
  const marked = new D({
    gfm: true,
    breaks: false,
    pedantic: false
  });
  marked.use({
    renderer: {
      image({ href, title, text }) {
        if (!isAbsoluteUrl(href)) {
          const marker = mediaMarker(mediaRefs.length);
          mediaRefs.push({
            marker,
            target: href,
            original: `![${text}](${href})`,
            altText: text || title || href,
            source: "markdown-image"
          });
          return marker;
        }
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${titleAttr}>`;
      },
      codespan({ text }) {
        return `<code>${escapeHtml(text)}</code>`;
      },
      code({ text, lang }) {
        const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
        const codeBlockIndex = codeBlockCount++;
        return `<pre><code${langAttr}>${codeBlockStartMarker(codeBlockIndex)}
${escapeHtml(text)}
${codeBlockEndMarker(codeBlockIndex)}</code></pre>
`;
      }
    }
  });
  const rendered = marked.parse(preprocessed);
  if (typeof rendered !== "string") {
    throw new Error(
      "Google Docs renderer returned a promise. The plugin expects synchronous rendering."
    );
  }
  return {
    html: buildDocumentHtml(options.title, rendered.trim()),
    mediaRefs,
    warnings
  };
}

// src/services/repo-inventory.ts
var SOURCE_KIND_ORDER = {
  "tracked-directory": 0,
  "tracked-file": 1,
  "scanned-directory": 2,
  "orphan-mirror": 3
};
function buildEntryId(sourceKind, vaultPath) {
  return `${sourceKind}:${normalizeVaultPath(vaultPath)}`;
}
function resolveUnpublishState(liveOriginUrl, storedOriginUrl) {
  const githubRepoSlug = (liveOriginUrl ? parseGitHubRepoSlug(liveOriginUrl) : null) ?? (storedOriginUrl ? parseGitHubRepoSlug(storedOriginUrl) : null);
  if (githubRepoSlug) {
    return {
      githubRepoSlug,
      canUnpublish: true
    };
  }
  const knownOrigin = liveOriginUrl ?? storedOriginUrl;
  if (knownOrigin) {
    return {
      githubRepoSlug: null,
      canUnpublish: false,
      disabledReason: "Only GitHub remotes can be unpublished."
    };
  }
  return {
    githubRepoSlug: null,
    canUnpublish: false,
    disabledReason: "No GitHub remote is known for this repo."
  };
}
async function buildEntry(sourceKind, target, vaultBasePath, resolveRepoState) {
  const localRepoVaultPath = normalizeVaultPath(target.mirrorPath ?? target.vaultPath);
  const localRepoPath = absolutePathForVaultPath(vaultBasePath, localRepoVaultPath);
  const repoState = await resolveRepoState(localRepoPath);
  const liveOriginUrl = repoState.originUrl ?? null;
  const storedOriginUrl = target.storedOriginUrl ?? null;
  const unpublishState = resolveUnpublishState(liveOriginUrl, storedOriginUrl);
  return {
    id: buildEntryId(sourceKind, target.vaultPath),
    sourceKind,
    targetType: target.targetType,
    vaultPath: normalizeVaultPath(target.vaultPath),
    mirrorPath: target.mirrorPath ? normalizeVaultPath(target.mirrorPath) : void 0,
    repoName: target.repoName,
    visibility: target.visibility,
    localRepoPath,
    localRepoVaultPath,
    liveOriginUrl,
    storedOriginUrl,
    hasLocalGit: repoState.hasLocalGit,
    hasOrigin: repoState.hasOrigin,
    isGitHubOrigin: repoState.isGitHubOrigin,
    ...unpublishState
  };
}
async function buildRepoInventory(options) {
  const trackedDirectoryPaths = /* @__PURE__ */ new Set();
  const trackedMirrorPaths = /* @__PURE__ */ new Set();
  const work = [];
  for (const record of options.trackedTargets) {
    if (record.targetType === "directory") {
      trackedDirectoryPaths.add(normalizeVaultPath(record.vaultPath));
      work.push(
        buildEntry(
          "tracked-directory",
          {
            targetType: "directory",
            vaultPath: record.vaultPath,
            repoName: record.repoName,
            visibility: record.visibility,
            storedOriginUrl: record.originUrl
          },
          options.vaultBasePath,
          options.resolveRepoState
        )
      );
      continue;
    }
    trackedMirrorPaths.add(normalizeVaultPath(record.mirrorPath ?? ""));
    work.push(
      buildEntry(
        "tracked-file",
        {
          targetType: "file",
          vaultPath: record.vaultPath,
          mirrorPath: record.mirrorPath,
          repoName: record.repoName,
          visibility: record.visibility,
          storedOriginUrl: record.originUrl
        },
        options.vaultBasePath,
        options.resolveRepoState
      )
    );
  }
  for (const repoPath of options.standaloneRepoPaths) {
    const normalizedRepoPath = normalizeVaultPath(repoPath);
    if (trackedDirectoryPaths.has(normalizedRepoPath)) {
      continue;
    }
    work.push(
      buildEntry(
        "scanned-directory",
        {
          targetType: "directory",
          vaultPath: normalizedRepoPath
        },
        options.vaultBasePath,
        options.resolveRepoState
      )
    );
  }
  for (const mirrorPath of options.orphanMirrorPaths) {
    const normalizedMirrorPath = normalizeVaultPath(mirrorPath);
    if (trackedMirrorPaths.has(normalizedMirrorPath)) {
      continue;
    }
    work.push(
      buildEntry(
        "orphan-mirror",
        {
          targetType: "file",
          vaultPath: normalizedMirrorPath,
          mirrorPath: normalizedMirrorPath
        },
        options.vaultBasePath,
        options.resolveRepoState
      )
    );
  }
  const entries = await Promise.all(work);
  return entries.sort((left, right) => {
    const kindOrder = SOURCE_KIND_ORDER[left.sourceKind] - SOURCE_KIND_ORDER[right.sourceKind];
    if (kindOrder !== 0) {
      return kindOrder;
    }
    return left.vaultPath.localeCompare(right.vaultPath);
  });
}

// src/services/static-site-publisher.ts
var import_promises3 = __toESM(require("node:fs/promises"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);

// src/utils/frontmatter.ts
function asString2(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return null;
}
function validatePostFrontmatter(raw) {
  const errors = [];
  const source = (raw && typeof raw === "object" ? raw : {}) ?? {};
  const title = asString2(source.title);
  if (!title) {
    errors.push({ field: "title", message: "title is required" });
  }
  const description = asString2(source.description);
  if (!description) {
    errors.push({ field: "description", message: "description is required" });
  }
  const date = asString2(source.date);
  if (!date) {
    errors.push({
      field: "date",
      message: "date is required (e.g. 2026-03-18T18:25Z)"
    });
  }
  let slugRaw = asString2(source.slug);
  if (!slugRaw && title) {
    slugRaw = sanitizeSlug(title);
  }
  if (!slugRaw) {
    errors.push({ field: "slug", message: "slug is required" });
  }
  const sanitized = slugRaw ? sanitizeSlug(slugRaw) : "";
  if (slugRaw && !isValidSlug(sanitized)) {
    errors.push({
      field: "slug",
      message: `slug '${slugRaw}' is invalid. Use lowercase letters, numbers, and hyphens; avoid reserved names (blog, feed, static, assets, public).`
    });
  }
  const hostCandidate = asString2(source.host) ?? asString2(source.hostId) ?? void 0;
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      title,
      slug: sanitized,
      date,
      description,
      hostId: hostCandidate ?? void 0
    }
  };
}

// src/services/markdown-renderer.ts
function escapeHtml2(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
function isAbsoluteUrl2(href) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
}
function renderMarkdown(source) {
  const warnings = [];
  const wikiLinkPattern = /!?\[\[[^\]]+\]\]/g;
  const preprocessed = source.replace(wikiLinkPattern, (match) => {
    warnings.push(
      `Obsidian wiki-link ${match} is not supported by the static-site publisher and was removed.`
    );
    return "";
  });
  const marked = new D({
    gfm: true,
    breaks: false,
    pedantic: false
  });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth}>${text}</h${depth}>
`;
      },
      paragraph({ tokens }) {
        const text = this.parser.parseInline(tokens);
        return `<p>${text}</p>
`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const safeHref = isAbsoluteUrl2(href) || href.startsWith("/") || href.startsWith("#") || href.startsWith("mailto:") ? href : href;
        const titleAttr = title ? ` title="${escapeHtml2(title)}"` : "";
        return `<a href="${escapeHtml2(safeHref)}"${titleAttr}>${inner}</a>`;
      },
      image({ href, title, text }) {
        const titleAttr = title ? ` title="${escapeHtml2(title)}"` : "";
        return `<img src="${escapeHtml2(href)}" alt="${escapeHtml2(text)}"${titleAttr} />`;
      },
      codespan({ text }) {
        return `<code>${escapeHtml2(text)}</code>`;
      },
      code({ text, lang }) {
        const body = escapeHtml2(text);
        if (lang) {
          return `<pre><code class="language-${escapeHtml2(lang)}">${body}
</code></pre>
`;
        }
        return `<pre><code>${body}
</code></pre>
`;
      },
      blockquote({ tokens }) {
        const body = this.parser.parse(tokens);
        return `<blockquote>
${body}</blockquote>
`;
      },
      hr() {
        return "<hr />\n";
      }
    }
  });
  const rendered = marked.parse(preprocessed);
  if (typeof rendered !== "string") {
    throw new Error(
      "Markdown renderer returned a promise. The plugin expects synchronous rendering."
    );
  }
  return {
    html: rendered.trim(),
    warnings
  };
}

// src/services/static-site-presets.ts
var APM_OVERFLOW_HOST_ID = "apm-overflow";
var APM_OVERFLOW_REPO_ROOT = "/Users/islamtayeb/Documents/GitHub/personal-website";
function createApmOverflowPreset(repoRoot = APM_OVERFLOW_REPO_ROOT) {
  return {
    id: APM_OVERFLOW_HOST_ID,
    name: "APM Overflow",
    repoRoot,
    siteSubdir: "apmoverflow",
    postPathTemplate: "{slug}/index.html",
    templateRelPath: "_template.html",
    contentMarker: "<p>Article content...</p>",
    tokens: {
      title: "POST_TITLE",
      slug: "POST_SLUG",
      description: "POST_DESCRIPTION",
      dateIso: "YYYY-MM-DDTHH:MMZ",
      dateDisplay: "Mon DD, YYYY"
    },
    commitMessagePublish: "apmoverflow: publish {slug}",
    commitMessageUnpublish: "apmoverflow: unpublish {slug}",
    remote: "origin",
    publicBaseUrl: "https://apmoverflow.xyz"
  };
}

// src/utils/date-format.ts
function pad22(value) {
  return String(value).padStart(2, "0");
}
var MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
function parsePostDate(input) {
  if (!input) {
    return null;
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) {
      return null;
    }
    return { date: input, hasTime: true };
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  if (dateOnly) {
    const [year, month, day] = trimmed.split("-").map((segment) => Number.parseInt(segment, 10));
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return { date, hasTime: false };
  }
  const candidate = new Date(trimmed);
  if (Number.isNaN(candidate.getTime())) {
    return null;
  }
  return { date: candidate, hasTime: true };
}
function formatIsoMinutesZ(date) {
  const year = date.getUTCFullYear();
  const month = pad22(date.getUTCMonth() + 1);
  const day = pad22(date.getUTCDate());
  const hours = pad22(date.getUTCHours());
  const minutes = pad22(date.getUTCMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}Z`;
}
function formatDisplayDate(date) {
  const month = MONTH_NAMES[date.getUTCMonth()];
  const day = pad22(date.getUTCDate());
  const year = date.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}

// src/services/static-site-renderer.ts
var TemplateRenderError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "TemplateRenderError";
  }
};
function escapeHtml3(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}
function replaceAll(source, token, replacement) {
  if (!token) {
    return source;
  }
  return source.split(token).join(replacement);
}
function requireToken(tokens, key) {
  const value = tokens[key];
  if (!value) {
    throw new TemplateRenderError(`Host token map is missing '${key}'.`);
  }
  return value;
}
function renderPost(input) {
  const { host, templateText } = input;
  if (!templateText) {
    throw new TemplateRenderError("Template text is empty.");
  }
  const parsedDate = parsePostDate(input.date);
  if (!parsedDate) {
    throw new TemplateRenderError(
      `Could not parse date '${input.date}'. Use YYYY-MM-DD or YYYY-MM-DDTHH:MMZ.`
    );
  }
  const dateIso = formatIsoMinutesZ(parsedDate.date);
  const dateDisplay = formatDisplayDate(parsedDate.date);
  const titleToken = requireToken(host.tokens, "title");
  const slugToken = requireToken(host.tokens, "slug");
  const descriptionToken = requireToken(host.tokens, "description");
  const dateIsoToken = requireToken(host.tokens, "dateIso");
  const dateDisplayToken = requireToken(host.tokens, "dateDisplay");
  if (!host.contentMarker) {
    throw new TemplateRenderError("Host contentMarker is empty.");
  }
  if (!templateText.includes(host.contentMarker)) {
    throw new TemplateRenderError(
      `Template does not contain contentMarker '${host.contentMarker}'. The marker is the placeholder HTML the plugin replaces with your rendered body.`
    );
  }
  let output = templateText;
  output = replaceAll(output, dateIsoToken, dateIso);
  output = replaceAll(output, dateDisplayToken, dateDisplay);
  output = replaceAll(output, titleToken, escapeHtml3(input.title));
  output = replaceAll(output, slugToken, input.slug);
  output = replaceAll(output, descriptionToken, escapeHtml3(input.description));
  output = replaceAll(output, host.contentMarker, input.bodyHtml);
  return {
    html: output,
    dateIso,
    dateDisplay
  };
}
function resolvePostRelativePath(host, slug) {
  const template = host.postPathTemplate || "{slug}/index.html";
  const replaced = template.replace(/\{slug\}/g, slug);
  if (replaced.includes("..")) {
    throw new TemplateRenderError(
      `Resolved post path '${replaced}' contains '..' which is not allowed.`
    );
  }
  return replaced;
}

// src/services/static-site-publisher.ts
var StaticSitePublishError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "StaticSitePublishError";
  }
};
function joinRelativePosix(...segments) {
  return segments.map((segment) => segment.replace(/^\/+|\/+$/g, "")).filter((segment) => segment.length > 0).join("/");
}
function normalizeGitHubRepoSlug(originUrl) {
  const trimmed = originUrl.trim().replace(/\.git$/, "");
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+)$/i);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`.toLowerCase();
  }
  const sshUrlMatch = trimmed.match(
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+)$/i
  );
  if (sshUrlMatch) {
    return `${sshUrlMatch[1]}/${sshUrlMatch[2]}`.toLowerCase();
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() !== "github.com") {
      return null;
    }
    const segments = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (segments.length < 2) {
      return null;
    }
    return `${segments[0]}/${segments[1]}`.toLowerCase();
  } catch {
    return null;
  }
}
async function pathExists(targetPath) {
  try {
    await import_promises3.default.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
async function readFileIfExists(targetPath) {
  try {
    return await import_promises3.default.readFile(targetPath, "utf8");
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
async function writeFileAtomic(targetPath, content) {
  const directory = import_node_path3.default.dirname(targetPath);
  await import_promises3.default.mkdir(directory, { recursive: true });
  const tempPath = `${targetPath}.tmp-${Date.now()}`;
  await import_promises3.default.writeFile(tempPath, content, "utf8");
  await import_promises3.default.rename(tempPath, targetPath);
}
async function removePostAndPruneParent(postAbsolutePath, postParentDir) {
  const existed = await pathExists(postAbsolutePath);
  if (existed) {
    await import_promises3.default.rm(postAbsolutePath, { force: true });
  }
  try {
    const remaining = await import_promises3.default.readdir(postParentDir);
    if (remaining.length === 0) {
      await import_promises3.default.rmdir(postParentDir);
    }
  } catch {
  }
  return existed;
}
var StaticSitePublisher = class {
  constructor(gitService) {
    this.gitService = gitService;
  }
  async ensurePrerequisites(host) {
    if (!host.repoRoot) {
      throw new StaticSitePublishError("Host has no repoRoot configured.");
    }
    if (!await pathExists(host.repoRoot)) {
      throw new StaticSitePublishError(
        `repoRoot does not exist: ${host.repoRoot}`
      );
    }
    if (!await this.gitService.isGitWorktree(host.repoRoot)) {
      throw new StaticSitePublishError(
        `repoRoot is not a git worktree: ${host.repoRoot}`
      );
    }
    const templatePath = import_node_path3.default.join(
      host.repoRoot,
      host.siteSubdir,
      host.templateRelPath
    );
    if (!await pathExists(templatePath)) {
      throw new StaticSitePublishError(
        `Template not found at ${templatePath}. Check the host's site subdirectory and template path.`
      );
    }
    await this.ensureApmOverflowGuard(host);
  }
  async ensureApmOverflowGuard(host) {
    if (host.id !== APM_OVERFLOW_HOST_ID) {
      return;
    }
    if (host.remote !== "origin") {
      throw new StaticSitePublishError(
        "APM Overflow can only publish through the origin remote."
      );
    }
    if (host.siteSubdir !== "apmoverflow") {
      throw new StaticSitePublishError(
        "APM Overflow can only publish inside the apmoverflow site directory."
      );
    }
    if (host.postPathTemplate !== "{slug}/index.html") {
      throw new StaticSitePublishError(
        "APM Overflow can only write post files at apmoverflow/{slug}/index.html."
      );
    }
    if (host.branch && host.branch !== "main") {
      throw new StaticSitePublishError(
        "APM Overflow can only publish to the main branch."
      );
    }
    const currentBranch = await this.gitService.getCurrentBranch(host.repoRoot);
    if (currentBranch !== "main") {
      throw new StaticSitePublishError(
        "APM Overflow can only publish when the local repo is on main."
      );
    }
    const originUrl = await this.gitService.getOriginUrl(host.repoRoot);
    const repoSlug = originUrl ? normalizeGitHubRepoSlug(originUrl) : null;
    if (repoSlug !== "islamtayeb/personal-website") {
      throw new StaticSitePublishError(
        "APM Overflow can only publish to GitHub repo IslamTayeb/personal-website."
      );
    }
  }
  async publish(input) {
    const { host, frontmatter, markdownBody, vaultPath, previousRecord } = input;
    await this.ensurePrerequisites(host);
    const validation = validatePostFrontmatter(frontmatter);
    if (!validation.ok) {
      const details = validation.errors.map((error) => `${error.field}: ${error.message}`).join("; ");
      throw new StaticSitePublishError(`Frontmatter invalid \u2014 ${details}`);
    }
    const post = validation.value;
    const templatePath = import_node_path3.default.join(
      host.repoRoot,
      host.siteSubdir,
      host.templateRelPath
    );
    const templateText = await import_promises3.default.readFile(templatePath, "utf8");
    const { html: bodyHtml, warnings } = renderMarkdown(markdownBody);
    let rendered;
    try {
      const result = renderPost({
        host,
        templateText,
        title: post.title,
        slug: post.slug,
        description: post.description,
        date: post.date,
        bodyHtml
      });
      rendered = result.html;
    } catch (error) {
      if (error instanceof TemplateRenderError) {
        throw new StaticSitePublishError(error.message);
      }
      throw error;
    }
    const postRelativePath = resolvePostRelativePath(host, post.slug);
    const postRelativePathFromRepo = joinRelativePosix(
      host.siteSubdir,
      postRelativePath
    );
    const postAbsolutePath = import_node_path3.default.join(host.repoRoot, postRelativePathFromRepo);
    const postParentDir = import_node_path3.default.dirname(postAbsolutePath);
    const repoRelativeBefore = postRelativePathFromRepo;
    const pathsToStage = [repoRelativeBefore];
    let removedPreviousSlug = null;
    if (previousRecord && previousRecord.slug && previousRecord.slug !== post.slug) {
      const oldPostRelativePath = resolvePostRelativePath(
        host,
        previousRecord.slug
      );
      const oldRepoRelative = joinRelativePosix(
        host.siteSubdir,
        oldPostRelativePath
      );
      const oldAbsolute = import_node_path3.default.join(host.repoRoot, oldRepoRelative);
      const oldParentDir = import_node_path3.default.dirname(oldAbsolute);
      const deleted = await removePostAndPruneParent(oldAbsolute, oldParentDir);
      if (deleted) {
        removedPreviousSlug = previousRecord.slug;
        pathsToStage.push(oldRepoRelative);
      }
    }
    const existingContent = await readFileIfExists(postAbsolutePath);
    const unchanged = existingContent === rendered && removedPreviousSlug === null;
    if (!unchanged) {
      await writeFileAtomic(postAbsolutePath, rendered);
    }
    await this.gitService.stagePathsInRepo(host.repoRoot, pathsToStage);
    const stagedFiles = await this.gitService.getStagedFilesFiltered(
      host.repoRoot,
      pathsToStage
    );
    const branch = host.branch ?? await this.gitService.getCurrentBranch(host.repoRoot) ?? "";
    if (!branch) {
      throw new StaticSitePublishError(
        "Could not resolve current branch for push. Is HEAD detached?"
      );
    }
    const publicUrl = host.publicBaseUrl ? `${host.publicBaseUrl.replace(/\/+$/, "")}/${post.slug}/` : null;
    if (stagedFiles.length === 0) {
      return {
        status: "unchanged",
        slug: post.slug,
        postAbsolutePath,
        postRelativePath,
        postRelativePathFromRepo,
        removedPreviousSlug,
        commitSha: await this.gitService.getHeadSha(host.repoRoot),
        warnings,
        publicUrl,
        branch
      };
    }
    const message = this.renderCommitMessage(host.commitMessagePublish, {
      slug: post.slug,
      title: post.title,
      vaultPath
    });
    try {
      await this.gitService.commitInRepo(host.repoRoot, message);
    } catch (error) {
      const commandError = error instanceof GitCommandError ? error : new GitCommandError({
        command: "git",
        args: ["commit"],
        cwd: host.repoRoot,
        message: error.message
      });
      const output = `${commandError.stderr}
${commandError.stdout}`.toLowerCase();
      if (!output.includes("nothing to commit")) {
        throw new StaticSitePublishError(
          `git commit failed: ${commandError.displayMessage()}`
        );
      }
    }
    try {
      await this.gitService.pushCurrentBranchInRepo(
        host.repoRoot,
        host.remote,
        host.branch
      );
    } catch (error) {
      const commandError = error instanceof GitCommandError ? error : new GitCommandError({
        command: "git",
        args: ["push"],
        cwd: host.repoRoot,
        message: error.message
      });
      throw new StaticSitePublishError(
        `git push failed: ${commandError.displayMessage()}. If this is a non-fast-forward error, run 'git pull --rebase' in ${host.repoRoot} and retry.`
      );
    }
    return {
      status: "published",
      slug: post.slug,
      postAbsolutePath,
      postRelativePath,
      postRelativePathFromRepo,
      removedPreviousSlug,
      commitSha: await this.gitService.getHeadSha(host.repoRoot),
      warnings,
      publicUrl,
      branch
    };
  }
  async unpublish(input) {
    const { host, record } = input;
    await this.ensurePrerequisites(host);
    const postRelativePath = resolvePostRelativePath(host, record.slug);
    const postRelativePathFromRepo = joinRelativePosix(
      host.siteSubdir,
      postRelativePath
    );
    const postAbsolutePath = import_node_path3.default.join(host.repoRoot, postRelativePathFromRepo);
    const postParentDir = import_node_path3.default.dirname(postAbsolutePath);
    const existed = await removePostAndPruneParent(
      postAbsolutePath,
      postParentDir
    );
    const branch = host.branch ?? await this.gitService.getCurrentBranch(host.repoRoot) ?? "";
    if (!branch) {
      throw new StaticSitePublishError(
        "Could not resolve current branch for push. Is HEAD detached?"
      );
    }
    if (!existed) {
      return {
        status: "not_found",
        removedPath: postRelativePathFromRepo,
        commitSha: await this.gitService.getHeadSha(host.repoRoot),
        branch
      };
    }
    await this.gitService.stagePathsInRepo(host.repoRoot, [
      postRelativePathFromRepo
    ]);
    const stagedFiles = await this.gitService.getStagedFilesFiltered(
      host.repoRoot,
      [postRelativePathFromRepo]
    );
    if (stagedFiles.length > 0) {
      const message = this.renderCommitMessage(host.commitMessageUnpublish, {
        slug: record.slug,
        title: record.slug,
        vaultPath: record.vaultPath
      });
      try {
        await this.gitService.commitInRepo(host.repoRoot, message);
      } catch (error) {
        const commandError = error instanceof GitCommandError ? error : new GitCommandError({
          command: "git",
          args: ["commit"],
          cwd: host.repoRoot,
          message: error.message
        });
        const output = `${commandError.stderr}
${commandError.stdout}`.toLowerCase();
        if (!output.includes("nothing to commit")) {
          throw new StaticSitePublishError(
            `git commit failed: ${commandError.displayMessage()}`
          );
        }
      }
      try {
        await this.gitService.pushCurrentBranchInRepo(
          host.repoRoot,
          host.remote,
          host.branch
        );
      } catch (error) {
        const commandError = error instanceof GitCommandError ? error : new GitCommandError({
          command: "git",
          args: ["push"],
          cwd: host.repoRoot,
          message: error.message
        });
        throw new StaticSitePublishError(
          `git push failed: ${commandError.displayMessage()}`
        );
      }
    }
    return {
      status: "unpublished",
      removedPath: postRelativePathFromRepo,
      commitSha: await this.gitService.getHeadSha(host.repoRoot),
      branch
    };
  }
  renderCommitMessage(template, values) {
    const base = template && template.length > 0 ? template : "static-site: update {slug}";
    return base.replace(/\{slug\}/g, values.slug).replace(/\{title\}/g, values.title).replace(/\{vaultPath\}/g, values.vaultPath);
  }
};

// src/settings/vault-publisher-setting-tab.ts
var import_obsidian8 = require("obsidian");

// src/modals/static-site-host-modal.ts
var import_obsidian6 = require("obsidian");
function generateHostId(name) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const random = Math.random().toString(36).slice(2, 8);
  return slug ? `${slug}-${random}` : `host-${random}`;
}
function cloneHost(host) {
  return {
    ...host,
    tokens: { ...host.tokens }
  };
}
var StaticSiteHostModal = class extends import_obsidian6.Modal {
  constructor(app, initial) {
    super(app);
    this.didResolve = false;
    this.isNew = initial === null;
    this.working = initial ? cloneHost(initial) : {
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
        dateDisplay: "Mon DD, YYYY"
      },
      commitMessagePublish: "static-site: publish {slug}",
      commitMessageUnpublish: "static-site: unpublish {slug}",
      remote: "origin",
      branch: void 0,
      publicBaseUrl: void 0
    };
  }
  onOpen() {
    this.titleEl.setText(
      this.isNew ? "Add Static Site Host" : "Edit Static Site Host"
    );
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("vault-publisher-settings");
    contentEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Configure a static site host. The plugin writes rendered HTML into <repo root>/<site subdirectory>/<post path>, then commits and pushes only the files it wrote."
    });
    this.addTextSetting(contentEl, {
      name: "Display name",
      desc: "Shown in pickers and settings.",
      placeholder: "APM Overflow",
      value: this.working.name,
      onChange: (value) => {
        this.working.name = value;
      }
    });
    this.addTextSetting(contentEl, {
      name: "Repo root (absolute path)",
      desc: "Path to the git worktree root on disk.",
      placeholder: "/Users/you/Documents/GitHub/your-site",
      value: this.working.repoRoot,
      onChange: (value) => {
        this.working.repoRoot = value.trim();
      }
    });
    this.addTextSetting(contentEl, {
      name: "Site subdirectory",
      desc: "Relative path from repo root where posts live. Leave empty if posts live at the root.",
      placeholder: "apmoverflow",
      value: this.working.siteSubdir,
      onChange: (value) => {
        this.working.siteSubdir = value.trim();
      }
    });
    this.addTextSetting(contentEl, {
      name: "Post path template",
      desc: "Relative path inside the site subdirectory. Use {slug} for the post slug.",
      placeholder: "{slug}/index.html",
      value: this.working.postPathTemplate,
      onChange: (value) => {
        this.working.postPathTemplate = value.trim();
      }
    });
    this.addTextSetting(contentEl, {
      name: "Template file",
      desc: "Relative path inside the site subdirectory to the HTML template.",
      placeholder: "_template.html",
      value: this.working.templateRelPath,
      onChange: (value) => {
        this.working.templateRelPath = value.trim();
      }
    });
    this.addTextSetting(contentEl, {
      name: "Content marker",
      desc: "String in the template that will be replaced with the rendered Markdown body.",
      placeholder: "<p>Article content...</p>",
      value: this.working.contentMarker,
      onChange: (value) => {
        this.working.contentMarker = value;
      }
    });
    contentEl.createEl("h4", { text: "Template tokens" });
    contentEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Strings in your template that will be replaced on publish. Every occurrence of each token is substituted, so pick values that will not collide with real text."
    });
    this.addTextSetting(contentEl, {
      name: "Title token",
      desc: "Replaced with the post's frontmatter `title` (HTML-escaped).",
      placeholder: "POST_TITLE",
      value: this.working.tokens.title,
      onChange: (value) => {
        this.working.tokens.title = value;
      }
    });
    this.addTextSetting(contentEl, {
      name: "Slug token",
      desc: "Replaced with the post slug (used inside URLs).",
      placeholder: "POST_SLUG",
      value: this.working.tokens.slug,
      onChange: (value) => {
        this.working.tokens.slug = value;
      }
    });
    this.addTextSetting(contentEl, {
      name: "Description token",
      desc: "Replaced with the post description (HTML-escaped).",
      placeholder: "POST_DESCRIPTION",
      value: this.working.tokens.description,
      onChange: (value) => {
        this.working.tokens.description = value;
      }
    });
    this.addTextSetting(contentEl, {
      name: "Date token (ISO)",
      desc: "Replaced with ISO datetime like 2026-03-18T18:25Z.",
      placeholder: "YYYY-MM-DDTHH:MMZ",
      value: this.working.tokens.dateIso,
      onChange: (value) => {
        this.working.tokens.dateIso = value;
      }
    });
    this.addTextSetting(contentEl, {
      name: "Date token (display)",
      desc: "Replaced with human-readable date like Mar 18, 2026.",
      placeholder: "Mon DD, YYYY",
      value: this.working.tokens.dateDisplay,
      onChange: (value) => {
        this.working.tokens.dateDisplay = value;
      }
    });
    contentEl.createEl("h4", { text: "Git" });
    this.addTextSetting(contentEl, {
      name: "Remote",
      desc: "Git remote to push to.",
      placeholder: "origin",
      value: this.working.remote,
      onChange: (value) => {
        this.working.remote = value.trim() || "origin";
      }
    });
    this.addTextSetting(contentEl, {
      name: "Branch (optional)",
      desc: "Leave empty to use the currently checked-out branch at publish time.",
      placeholder: "main",
      value: this.working.branch ?? "",
      onChange: (value) => {
        this.working.branch = value.trim() || void 0;
      }
    });
    this.addTextSetting(contentEl, {
      name: "Publish commit message template",
      desc: "Use {slug}, {title}, or {vaultPath} as placeholders.",
      placeholder: "apmoverflow: publish {slug}",
      value: this.working.commitMessagePublish,
      onChange: (value) => {
        this.working.commitMessagePublish = value;
      }
    });
    this.addTextSetting(contentEl, {
      name: "Unpublish commit message template",
      desc: "Same placeholders as publish.",
      placeholder: "apmoverflow: unpublish {slug}",
      value: this.working.commitMessageUnpublish,
      onChange: (value) => {
        this.working.commitMessageUnpublish = value;
      }
    });
    this.addTextSetting(contentEl, {
      name: "Public base URL (optional)",
      desc: "If set, the plugin will show a clickable URL after publish. e.g. https://apmoverflow.xyz",
      placeholder: "https://yoursite.example",
      value: this.working.publicBaseUrl ?? "",
      onChange: (value) => {
        this.working.publicBaseUrl = value.trim() || void 0;
      }
    });
    new import_obsidian6.Setting(contentEl).addButton((button) => {
      button.setButtonText("Cancel").onClick(() => {
        this.finish(null);
      });
    }).addButton((button) => {
      button.setCta().setButtonText(this.isNew ? "Add host" : "Save").onClick(() => {
        const validationError = this.validate();
        if (validationError) {
          new import_obsidian6.Notice(validationError, 8e3);
          return;
        }
        if (!this.working.id) {
          this.working.id = generateHostId(this.working.name);
        }
        this.finish({ host: cloneHost(this.working) });
      });
    });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.didResolve) {
      this.resolveResult?.(null);
    }
  }
  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolveResult = resolve;
      this.open();
    });
  }
  finish(value) {
    this.didResolve = true;
    this.resolveResult?.(value);
    this.close();
  }
  addTextSetting(containerEl, options) {
    new import_obsidian6.Setting(containerEl).setName(options.name).setDesc(options.desc).addText((text) => {
      text.setPlaceholder(options.placeholder);
      text.setValue(options.value);
      text.onChange((value) => {
        options.onChange(value);
      });
      text.inputEl.style.width = "100%";
    });
  }
  validate() {
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
};

// src/modals/unpublish-confirm-modal.ts
var import_obsidian7 = require("obsidian");
var UnpublishConfirmModal = class extends import_obsidian7.Modal {
  constructor(app, entry) {
    super(app);
    this.didResolve = false;
    this.entry = entry;
  }
  onOpen() {
    this.titleEl.setText("Unpublish Repository");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", {
      text: "This removes the GitHub repository and local Git repo state, but keeps your vault content."
    });
    const details = contentEl.createEl("ul", { cls: "vault-publisher-confirm-list" });
    details.createEl("li", {
      text: `Target: ${this.getTargetLabel()}`
    });
    details.createEl("li", {
      text: `GitHub repo: ${this.entry.githubRepoSlug ?? "Unknown"}`
    });
    details.createEl("li", {
      text: this.getLocalCleanupLabel()
    });
    details.createEl("li", {
      text: this.getKeptContentLabel()
    });
    new import_obsidian7.Setting(contentEl).addButton((button) => {
      button.setButtonText("Cancel").onClick(() => {
        this.finish(false);
      });
    }).addButton((button) => {
      button.setButtonText("Unpublish").onClick(() => {
        this.finish(true);
      });
      button.buttonEl.addClass("mod-warning");
    });
  }
  onClose() {
    this.contentEl.empty();
    if (!this.didResolve) {
      this.resolveSelection?.(false);
    }
  }
  openAndConfirm() {
    return new Promise((resolve) => {
      this.resolveSelection = resolve;
      this.open();
    });
  }
  finish(value) {
    this.didResolve = true;
    this.resolveSelection?.(value);
    this.close();
  }
  getTargetLabel() {
    if (this.entry.sourceKind === "tracked-file") {
      return `File ${this.entry.vaultPath}`;
    }
    if (this.entry.sourceKind === "orphan-mirror") {
      return `Mirror ${this.entry.localRepoVaultPath}`;
    }
    return `Directory ${this.entry.vaultPath}`;
  }
  getLocalCleanupLabel() {
    if (this.entry.sourceKind === "tracked-directory" || this.entry.sourceKind === "scanned-directory") {
      return `Local cleanup: remove only ${this.entry.localRepoVaultPath}/.git`;
    }
    return `Local cleanup: delete mirror directory ${this.entry.localRepoVaultPath}`;
  }
  getKeptContentLabel() {
    if (this.entry.sourceKind === "tracked-file") {
      return `Keeps source file ${this.entry.vaultPath}`;
    }
    if (this.entry.sourceKind === "orphan-mirror") {
      return "Keeps the rest of the vault unchanged";
    }
    return `Keeps directory contents in ${this.entry.vaultPath}`;
  }
};

// src/settings/vault-publisher-setting-tab.ts
var VaultPublisherSettingTab = class extends import_obsidian8.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.renderNonce = 0;
    this.vaultPublisher = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("vault-publisher-settings");
    this.renderHeader(containerEl);
    containerEl.createDiv({
      cls: "vault-publisher-empty",
      text: "Loading repositories..."
    });
    const currentRender = ++this.renderNonce;
    void this.renderInventory(currentRender);
  }
  async renderInventory(renderNonce) {
    const { containerEl } = this;
    try {
      const entries = await this.vaultPublisher.getRepoInventory();
      if (renderNonce !== this.renderNonce) {
        return;
      }
      containerEl.empty();
      containerEl.addClass("vault-publisher-settings");
      this.renderHeader(containerEl, entries.length);
      if (entries.length === 0) {
        containerEl.createDiv({
          cls: "vault-publisher-empty",
          text: "No tracked or discovered repositories were found."
        });
      } else {
        const groups = [
          {
            title: "Tracked Targets",
            description: "Repositories the plugin explicitly tracks for directories and file mirrors.",
            emptyText: "No tracked directory or file targets.",
            entries: entries.filter(
              (entry) => entry.sourceKind === "tracked-directory" || entry.sourceKind === "tracked-file"
            )
          },
          {
            title: "Scanned Repositories",
            description: "Standalone Git repositories found by the existing vault scan.",
            emptyText: "No standalone scanned repositories.",
            entries: entries.filter(
              (entry) => entry.sourceKind === "scanned-directory"
            )
          },
          {
            title: "Orphan Mirrors",
            description: "Mirror repositories under the plugin mirror root that are no longer tied to a tracked file target.",
            emptyText: "No orphan mirror repositories.",
            entries: entries.filter(
              (entry) => entry.sourceKind === "orphan-mirror"
            )
          }
        ];
        for (const group of groups) {
          this.renderGroup(containerEl, group);
        }
      }
      this.renderGoogleDocsSection(containerEl);
      this.renderStaticSiteHostsSection(containerEl);
    } catch (error) {
      if (renderNonce !== this.renderNonce) {
        return;
      }
      containerEl.empty();
      containerEl.addClass("vault-publisher-settings");
      this.renderHeader(containerEl);
      containerEl.createDiv({
        cls: "vault-publisher-empty",
        text: this.formatError(error)
      });
      this.renderGoogleDocsSection(containerEl);
      this.renderStaticSiteHostsSection(containerEl);
    }
  }
  renderHeader(containerEl, totalCount) {
    const heading = totalCount === void 0 ? "Repository Management" : `Repository Management (${totalCount})`;
    new import_obsidian8.Setting(containerEl).setName(heading).setDesc(
      "View tracked targets, scanned repos, and orphan mirrors. Unpublish deletes the GitHub repo and removes local Git state while keeping vault content."
    ).addButton((button) => {
      button.setButtonText("Refresh").onClick(() => {
        this.display();
      });
    });
  }
  renderGroup(containerEl, group) {
    const groupEl = containerEl.createDiv({ cls: "vault-publisher-section" });
    groupEl.createEl("h3", {
      text: `${group.title} (${group.entries.length})`
    });
    groupEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: group.description
    });
    if (group.entries.length === 0) {
      groupEl.createDiv({
        cls: "vault-publisher-empty",
        text: group.emptyText
      });
      return;
    }
    for (const entry of group.entries) {
      this.renderEntry(groupEl, entry);
    }
  }
  renderEntry(containerEl, entry) {
    const setting = new import_obsidian8.Setting(containerEl);
    setting.settingEl.addClass("vault-publisher-entry");
    setting.nameEl.empty();
    const titleEl = setting.nameEl.createDiv({
      cls: "vault-publisher-entry-title"
    });
    titleEl.createSpan({
      cls: "vault-publisher-entry-path",
      text: this.getEntryTitle(entry)
    });
    for (const badge of this.getEntryBadges(entry)) {
      titleEl.createSpan({
        cls: "vault-publisher-entry-badge",
        text: badge
      });
    }
    setting.descEl.empty();
    for (const line of this.getEntryLines(entry)) {
      const lineEl = setting.descEl.createDiv({
        cls: "vault-publisher-entry-line"
      });
      lineEl.createSpan({
        cls: "vault-publisher-entry-label",
        text: `${line.label}: `
      });
      lineEl.createSpan({ text: line.value });
    }
    if (!entry.canUnpublish && entry.disabledReason) {
      setting.descEl.createDiv({
        cls: "vault-publisher-entry-warning",
        text: entry.disabledReason
      });
    }
    setting.addButton((button) => {
      button.setButtonText("Unpublish");
      button.buttonEl.addClass("mod-warning");
      button.setDisabled(!entry.canUnpublish);
      button.onClick(() => {
        void this.handleUnpublish(entry, button);
      });
    });
  }
  async handleUnpublish(entry, button) {
    const confirmed = await new UnpublishConfirmModal(
      this.app,
      entry
    ).openAndConfirm();
    if (!confirmed) {
      return;
    }
    button.setButtonText("Working...");
    button.setDisabled(true);
    await this.vaultPublisher.unpublishRepo(entry);
    this.display();
  }
  renderGoogleDocsSection(containerEl) {
    const sectionEl = containerEl.createDiv({ cls: "vault-publisher-section" });
    sectionEl.createEl("h3", { text: "Google Docs" });
    sectionEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Upload the active Markdown note to one Google Doc per note. Local image and video embeds are uploaded to Drive; supported images are inserted inline and videos are linked."
    });
    const settings = this.vaultPublisher.getGoogleDocsSettings();
    const publishCount = this.vaultPublisher.getConfigStore().getGoogleDocsPublishes().length;
    new import_obsidian8.Setting(sectionEl).setName("Status").setDesc(
      settings.refreshToken ? `Authorized. Tracked Google Docs: ${publishCount}.` : `Not authorized. Tracked Google Docs: ${publishCount}.`
    ).addButton((button) => {
      button.setButtonText(settings.refreshToken ? "Re-authorize" : "Authorize").onClick(async () => {
        button.setDisabled(true);
        button.setButtonText("Opening...");
        await this.vaultPublisher.authorizeGoogleDocs();
        this.display();
      });
    }).addButton((button) => {
      button.setButtonText("Forget token");
      button.setDisabled(!settings.refreshToken);
      button.onClick(async () => {
        button.setDisabled(true);
        await this.vaultPublisher.forgetGoogleDocsAuth();
        this.display();
      });
    });
    new import_obsidian8.Setting(sectionEl).setName("OAuth credentials JSON path").setDesc(
      "Absolute path to a Google OAuth desktop-client credentials JSON file."
    ).addText((text) => {
      text.setPlaceholder("/Users/you/Downloads/client_secret.json");
      text.setValue(settings.credentialsPath ?? "");
      text.inputEl.style.width = "100%";
      text.onChange((value) => {
        void this.vaultPublisher.updateGoogleDocsSettings({
          credentialsPath: value.trim() || void 0
        });
      });
    });
    new import_obsidian8.Setting(sectionEl).setName("Google Drive folder ID").setDesc("New Google Docs are created in this Drive folder.").addText((text) => {
      text.setPlaceholder("Drive folder ID");
      text.setValue(settings.docsFolderId ?? "");
      text.inputEl.style.width = "100%";
      text.onChange((value) => {
        void this.vaultPublisher.updateGoogleDocsSettings({
          docsFolderId: value.trim() || void 0
        });
      });
    });
    new import_obsidian8.Setting(sectionEl).setName("Generated media folder ID").setDesc(
      "Optional. Leave blank and the plugin will create 'Vault Publisher Media' under the Drive folder."
    ).addText((text) => {
      text.setPlaceholder("Created automatically");
      text.setValue(settings.mediaFolderId ?? "");
      text.inputEl.style.width = "100%";
      text.onChange((value) => {
        void this.vaultPublisher.updateGoogleDocsSettings({
          mediaFolderId: value.trim() || void 0
        });
      });
    });
  }
  renderStaticSiteHostsSection(containerEl) {
    const sectionEl = containerEl.createDiv({ cls: "vault-publisher-section" });
    const headerRow = sectionEl.createDiv({
      cls: "vault-publisher-static-header"
    });
    headerRow.createEl("h3", {
      text: "Static Site Hosts \u2014 Bring Your Own Host"
    });
    headerRow.createSpan({
      cls: "vault-publisher-experimental-badge",
      text: "EXPERIMENTAL"
    });
    const warning = sectionEl.createDiv({
      cls: "vault-publisher-experimental-warning"
    });
    warning.createSpan({
      text: "This feature is experimental. It writes into your local static-site repo and force-pushes a commit on the current branch \u2014 double-check your host config before publishing, and expect rough edges."
    });
    sectionEl.createEl("p", {
      cls: "vault-publisher-section-description",
      text: "Publish Markdown notes as HTML pages in any git-backed static site. The plugin renders Markdown through a host-provided HTML template, writes the file into your repo, and commits + pushes only that file. It does not touch blog indexes or feeds, so posts are unlisted and reachable only by direct URL."
    });
    const requirements = sectionEl.createEl("ul", {
      cls: "vault-publisher-confirm-list"
    });
    requirements.createEl("li", {
      text: "Your note needs YAML frontmatter with `title`, `slug`, `date`, `description`, and optionally `host: <host-id>`."
    });
    requirements.createEl("li", {
      text: "Your template must contain the token strings (POST_TITLE, POST_SLUG, POST_DESCRIPTION, YYYY-MM-DDTHH:MMZ, Mon DD, YYYY) and a content marker (e.g. <p>Article content...</p>) that the plugin will replace."
    });
    requirements.createEl("li", {
      text: "The repo root must be a git worktree; the plugin uses `git` on PATH to stage, commit, and push."
    });
    const hosts = this.vaultPublisher.getStaticSiteHosts();
    this.renderPresetsRow(sectionEl, hosts);
    if (hosts.length === 0) {
      sectionEl.createDiv({
        cls: "vault-publisher-empty",
        text: "No static site hosts configured yet."
      });
    } else {
      for (const host of hosts) {
        this.renderHostEntry(sectionEl, host);
      }
    }
    new import_obsidian8.Setting(sectionEl).setName("Add custom host").setDesc("Configure a new static site target from scratch.").addButton((button) => {
      button.setButtonText("Add host").onClick(() => {
        void this.handleAddHost();
      });
    });
  }
  renderPresetsRow(sectionEl, hosts) {
    const hasApmOverflow = hosts.some(
      (host) => host.id === APM_OVERFLOW_HOST_ID
    );
    if (hasApmOverflow) {
      return;
    }
    const setting = new import_obsidian8.Setting(sectionEl).setName("APM Overflow preset").setDesc(
      `Seed a host pointing at ${APM_OVERFLOW_REPO_ROOT}/apmoverflow using the existing _template.html. You can edit it afterwards.`
    ).addButton((button) => {
      button.setButtonText("Add APM Overflow preset").onClick(() => {
        void this.handleAddPreset();
      });
    });
    setting.settingEl.addClass("vault-publisher-entry");
  }
  async handleAddPreset() {
    const preset = createApmOverflowPreset();
    await this.vaultPublisher.upsertStaticSiteHost(preset);
    new import_obsidian8.Notice(`Added preset: ${preset.name}.`);
    this.display();
  }
  async handleAddHost() {
    const modal = new StaticSiteHostModal(this.app, null);
    const result = await modal.openAndGetValue();
    if (!result) {
      return;
    }
    await this.vaultPublisher.upsertStaticSiteHost(result.host);
    new import_obsidian8.Notice(`Added host: ${result.host.name}.`);
    this.display();
  }
  renderHostEntry(sectionEl, host) {
    const setting = new import_obsidian8.Setting(sectionEl);
    setting.settingEl.addClass("vault-publisher-entry");
    setting.nameEl.empty();
    const titleEl = setting.nameEl.createDiv({
      cls: "vault-publisher-entry-title"
    });
    titleEl.createSpan({ cls: "vault-publisher-entry-path", text: host.name });
    titleEl.createSpan({ cls: "vault-publisher-entry-badge", text: host.id });
    setting.descEl.empty();
    const lines = [
      { label: "Repo root", value: host.repoRoot },
      { label: "Site dir", value: host.siteSubdir || "(repo root)" },
      { label: "Template", value: host.templateRelPath },
      { label: "Post path", value: host.postPathTemplate },
      { label: "Remote", value: host.remote }
    ];
    if (host.branch) {
      lines.push({ label: "Branch", value: host.branch });
    }
    if (host.publicBaseUrl) {
      lines.push({ label: "Public URL", value: host.publicBaseUrl });
    }
    const publishes = this.vaultPublisher.getConfigStore().getStaticSitePublishesByHost(host.id);
    lines.push({ label: "Published notes", value: String(publishes.length) });
    for (const line of lines) {
      const lineEl = setting.descEl.createDiv({
        cls: "vault-publisher-entry-line"
      });
      lineEl.createSpan({
        cls: "vault-publisher-entry-label",
        text: `${line.label}: `
      });
      lineEl.createSpan({ text: line.value });
    }
    setting.addButton((button) => {
      button.setButtonText("Edit").onClick(() => {
        void this.handleEditHost(host);
      });
    });
    setting.addButton((button) => {
      button.setButtonText("Delete");
      button.buttonEl.addClass("mod-warning");
      button.onClick(() => {
        void this.handleDeleteHost(host);
      });
    });
  }
  async handleEditHost(host) {
    const modal = new StaticSiteHostModal(this.app, host);
    const result = await modal.openAndGetValue();
    if (!result) {
      return;
    }
    await this.vaultPublisher.upsertStaticSiteHost({
      ...result.host,
      id: host.id
    });
    new import_obsidian8.Notice(`Updated host: ${host.name}.`);
    this.display();
  }
  async handleDeleteHost(host) {
    const publishes = this.vaultPublisher.getConfigStore().getStaticSitePublishesByHost(host.id);
    const suffix = publishes.length > 0 ? ` This will also forget ${publishes.length} published-note record(s), but will not delete files from the static site.` : "";
    const confirmed = window.confirm(`Delete host '${host.name}'?${suffix}`);
    if (!confirmed) {
      return;
    }
    await this.vaultPublisher.removeStaticSiteHost(host.id);
    const configStore = this.vaultPublisher.getConfigStore();
    for (const publish of publishes) {
      configStore.removeStaticSitePublish(host.id, publish.vaultPath);
    }
    await this.vaultPublisher.saveConfig();
    new import_obsidian8.Notice(`Removed host: ${host.name}.`);
    this.display();
  }
  getEntryTitle(entry) {
    if (entry.sourceKind === "tracked-file") {
      return entry.vaultPath;
    }
    if (entry.sourceKind === "orphan-mirror") {
      return entry.localRepoVaultPath;
    }
    return entry.vaultPath;
  }
  getEntryBadges(entry) {
    const badges = [];
    if (entry.sourceKind === "tracked-directory" || entry.sourceKind === "tracked-file") {
      badges.push("Tracked");
    } else if (entry.sourceKind === "scanned-directory") {
      badges.push("Scanned");
    } else {
      badges.push("Orphan");
    }
    if (entry.sourceKind === "tracked-file" || entry.sourceKind === "orphan-mirror") {
      badges.push("File");
    } else {
      badges.push("Directory");
    }
    if (entry.githubRepoSlug) {
      badges.push("GitHub");
    } else if (entry.hasOrigin) {
      badges.push("Non-GitHub");
    } else {
      badges.push("No Remote");
    }
    return badges;
  }
  getEntryLines(entry) {
    const lines = [];
    if (entry.sourceKind === "tracked-file") {
      lines.push({ label: "Source", value: entry.vaultPath });
      if (entry.mirrorPath) {
        lines.push({ label: "Mirror", value: entry.mirrorPath });
      }
    } else if (entry.sourceKind === "orphan-mirror") {
      lines.push({ label: "Mirror", value: entry.localRepoVaultPath });
    } else {
      lines.push({ label: "Path", value: entry.vaultPath });
    }
    lines.push({
      label: "Local Repo",
      value: entry.hasLocalGit ? entry.localRepoVaultPath : `${entry.localRepoVaultPath} (missing .git)`
    });
    if (entry.githubRepoSlug) {
      lines.push({
        label: "GitHub",
        value: `https://github.com/${entry.githubRepoSlug}`
      });
    }
    if (entry.liveOriginUrl) {
      lines.push({ label: "Origin", value: entry.liveOriginUrl });
    } else {
      lines.push({ label: "Origin", value: "Not configured" });
    }
    if (entry.storedOriginUrl && entry.storedOriginUrl !== entry.liveOriginUrl) {
      lines.push({ label: "Stored Origin", value: entry.storedOriginUrl });
    }
    if (entry.visibility) {
      lines.push({ label: "Visibility", value: entry.visibility });
    }
    return lines;
  }
  formatError(error) {
    if (error instanceof Error) {
      return `Could not load repositories: ${error.message}`;
    }
    return "Could not load repositories.";
  }
};

// src/utils/frontmatter-io.ts
var FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function splitFrontmatter(fileContent) {
  if (!fileContent.startsWith("---")) {
    return { frontmatterRaw: null, body: fileContent };
  }
  const match = fileContent.match(FRONTMATTER_REGEX);
  if (!match) {
    return { frontmatterRaw: null, body: fileContent };
  }
  return {
    frontmatterRaw: match[1],
    body: fileContent.slice(match[0].length)
  };
}
function needsQuoting(value) {
  if (value.length === 0) {
    return true;
  }
  if (/["']/.test(value)) {
    return true;
  }
  if (/[:#&*!|<>?%@`]/.test(value)) {
    return true;
  }
  if (/^[\s'"]/.test(value) || /[\s]$/.test(value)) {
    return true;
  }
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(value)) {
    return true;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return true;
  }
  return false;
}
function quoteYamlString(value) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
  return `"${escaped}"`;
}
function formatYamlValue(value) {
  return needsQuoting(value) ? quoteYamlString(value) : value;
}
function renderFrontmatterBlock(fields) {
  const lines = [
    `title: ${formatYamlValue(fields.title)}`,
    `slug: ${formatYamlValue(fields.slug)}`,
    `date: ${formatYamlValue(fields.date)}`,
    `description: ${formatYamlValue(fields.description)}`
  ];
  if (fields.host && fields.host.trim().length > 0) {
    lines.push(`host: ${formatYamlValue(fields.host)}`);
  }
  return lines.join("\n");
}
function upsertFrontmatterFields(fileContent, fields) {
  const managedKeys = /* @__PURE__ */ new Set(["title", "slug", "date", "description", "host"]);
  const { frontmatterRaw, body } = splitFrontmatter(fileContent);
  const managedLines = renderFrontmatterBlock(fields).split("\n");
  if (frontmatterRaw === null) {
    const normalizedBody2 = body.startsWith("\n") ? body : `
${body}`;
    return `---
${managedLines.join("\n")}
---${normalizedBody2}`;
  }
  const preservedLines = [];
  const originalLines = frontmatterRaw.split(/\r?\n/);
  let skipContinuation = false;
  for (const line of originalLines) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:/);
    if (keyMatch) {
      const key = keyMatch[1];
      if (managedKeys.has(key)) {
        skipContinuation = true;
        continue;
      }
      skipContinuation = false;
      preservedLines.push(line);
      continue;
    }
    if (skipContinuation) {
      if (/^\s+\S/.test(line)) {
        continue;
      }
      skipContinuation = false;
    }
    preservedLines.push(line);
  }
  while (preservedLines.length > 0 && preservedLines[preservedLines.length - 1].trim() === "") {
    preservedLines.pop();
  }
  const combined = [...managedLines, ...preservedLines].join("\n");
  const trailingNewline = body.length > 0 ? "" : "";
  const normalizedBody = body.startsWith("\n") || body.length === 0 ? body : `
${body}`;
  return `---
${combined}
---${normalizedBody || "\n"}${trailingNewline}`;
}

// src/utils/post-defaults.ts
var MAX_DESCRIPTION_LENGTH = 180;
function titleCaseFromBasename(basename) {
  const spaced = basename.replace(/[-_]+/g, " ").trim();
  if (!spaced) {
    return "Untitled";
  }
  return spaced.split(/\s+/).map(
    (word) => word.length === 0 ? word : word[0].toUpperCase() + word.slice(1)
  ).join(" ");
}
function firstHeadingText(body) {
  const match = body.match(/^#{1,6}\s+(.+?)\s*$/m);
  if (!match) {
    return null;
  }
  return match[1].trim();
}
function firstParagraphText(body) {
  const lines = body.split(/\r?\n/);
  const paragraphLines = [];
  let started = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (started) {
        break;
      }
      continue;
    }
    if (trimmed.startsWith("#") || trimmed.startsWith("---") || trimmed.startsWith("```")) {
      if (started) {
        break;
      }
      continue;
    }
    paragraphLines.push(trimmed);
    started = true;
  }
  return paragraphLines.join(" ");
}
function stripInlineMarkdown(text) {
  return text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1").replace(/~~([^~]+)~~/g, "$1").replace(/\s+/g, " ").trim();
}
function truncateDescription(text, maxLength) {
  if (text.length <= maxLength) {
    return text;
  }
  const ellipsis = "...";
  const budget = Math.max(1, maxLength - ellipsis.length);
  const cut = text.slice(0, budget);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > 40 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[.,;:!?]+$/, "")}${ellipsis}`;
}
function computePostDefaults(input) {
  const heading = firstHeadingText(input.body);
  const title = heading && heading.length > 0 ? heading : titleCaseFromBasename(input.fileBasename);
  const slug = sanitizeSlug(title) || sanitizeSlug(input.fileBasename) || "untitled";
  const now = input.now ?? /* @__PURE__ */ new Date();
  const date = formatIsoMinutesZ(now);
  const paragraph = firstParagraphText(input.body);
  const descriptionRaw = stripInlineMarkdown(paragraph);
  const description = descriptionRaw.length > 0 ? truncateDescription(descriptionRaw, MAX_DESCRIPTION_LENGTH) : "";
  return { title, slug, date, description };
}
function mergeDefaults(existing, defaults) {
  const source = existing ?? {};
  const pick = (key, fallback) => {
    const raw = source[key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      return raw;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      return String(raw);
    }
    return fallback;
  };
  const hostCandidate = source.host ?? source.hostId;
  const hostId = typeof hostCandidate === "string" && hostCandidate.trim().length > 0 ? hostCandidate : void 0;
  return {
    title: pick("title", defaults.title),
    slug: pick("slug", defaults.slug),
    date: pick("date", defaults.date),
    description: pick("description", defaults.description),
    hostId
  };
}

// src/plugin.ts
var VaultPublisherPlugin = class extends import_obsidian9.Plugin {
  constructor() {
    super(...arguments);
    this.isRunning = false;
  }
  async onload() {
    this.configStore = new ConfigStore(this);
    await this.configStore.load();
    this.gitService = new GitService();
    this.staticSitePublisher = new StaticSitePublisher(this.gitService);
    this.googleDocsPublisher = new GoogleDocsPublisher();
    this.addSettingTab(new VaultPublisherSettingTab(this.app, this));
    this.addCommand({
      id: "publish-directory",
      name: "Publish Directory to GitHub",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePublishCommand();
        });
      }
    });
    this.addCommand({
      id: "publish-directory-select-target",
      name: "Publish Directory to GitHub (Choose Target)",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePublishCommand({ forcePicker: true });
        });
      }
    });
    this.addCommand({
      id: "push-all-repos",
      name: "Push All Repositories",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePushAllRepositories();
        });
      }
    });
    this.addCommand({
      id: "publish-to-static-site",
      name: "Publish Note to Static Site Host (Experimental)",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handlePublishToStaticSite();
        });
      }
    });
    this.addCommand({
      id: "unpublish-from-static-site",
      name: "Unpublish Note from Static Site Host (Experimental)",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handleUnpublishFromStaticSite();
        });
      }
    });
    this.addCommand({
      id: "upload-note-to-google-docs",
      name: "Upload Note to Google Docs",
      callback: () => {
        void this.executeExclusive(async () => {
          await this.handleUploadToGoogleDocs();
        });
      }
    });
  }
  async ensurePrerequisites() {
    const status = await this.gitService.checkPrerequisites();
    if (!status.ok) {
      new import_obsidian9.Notice(status.message ?? "Missing required tools.", 12e3);
      return false;
    }
    return true;
  }
  async executeExclusive(action) {
    if (this.isRunning) {
      new import_obsidian9.Notice("Vault Publisher is already running.");
      return;
    }
    this.isRunning = true;
    try {
      await action();
    } catch (error) {
      this.showCommandError(error);
    } finally {
      this.isRunning = false;
    }
  }
  getVaultBasePath() {
    const adapter = this.app.vault.adapter;
    if (typeof adapter.basePath === "string" && adapter.basePath.length > 0) {
      return adapter.basePath;
    }
    return null;
  }
  async getRepoInventory() {
    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      return [];
    }
    const [standaloneRepoPaths, orphanMirrorPaths] = await Promise.all([
      this.gitService.findStandaloneRepos(vaultBasePath),
      this.gitService.findMirrorRepos(vaultBasePath, MIRROR_ROOT)
    ]);
    return buildRepoInventory({
      vaultBasePath,
      trackedTargets: this.configStore.getAllTargets(),
      standaloneRepoPaths,
      orphanMirrorPaths,
      resolveRepoState: async (absolutePath) => this.gitService.detectRepoState(absolutePath)
    });
  }
  async unpublishRepo(entry) {
    let didSucceed = false;
    await this.executeExclusive(async () => {
      didSucceed = await this.performUnpublishRepo(entry);
    });
    return didSucceed;
  }
  async performUnpublishRepo(entry) {
    if (!entry.canUnpublish || !entry.githubRepoSlug) {
      new import_obsidian9.Notice(
        entry.disabledReason ?? "This repository cannot be unpublished.",
        1e4
      );
      return false;
    }
    const githubStatus = await this.gitService.checkGitHubPrerequisites();
    if (!githubStatus.ok) {
      new import_obsidian9.Notice(
        githubStatus.message ?? "Missing required GitHub tools.",
        12e3
      );
      return false;
    }
    let remoteResult;
    try {
      remoteResult = await this.gitService.deleteGitHubRepo(
        entry.githubRepoSlug
      );
    } catch (error) {
      this.showCommandError(error);
      return false;
    }
    try {
      if (entry.sourceKind === "tracked-directory" || entry.sourceKind === "scanned-directory") {
        await this.gitService.removeGitDirectory(entry.localRepoPath);
      } else {
        await this.gitService.removeDirectory(entry.localRepoPath);
      }
      if (entry.sourceKind === "tracked-directory" || entry.sourceKind === "tracked-file") {
        this.configStore.removeTarget(entry.targetType, entry.vaultPath);
        await this.configStore.save();
      }
    } catch (error) {
      const detail = error instanceof GitCommandError ? error.displayMessage() : error instanceof Error ? error.message : "Unknown local cleanup failure.";
      const remoteMessage2 = remoteResult.status === "deleted" ? `Deleted GitHub repo ${entry.githubRepoSlug}` : `GitHub repo ${entry.githubRepoSlug} was already absent`;
      new import_obsidian9.Notice(
        `${remoteMessage2}, but local cleanup failed: ${detail}`,
        15e3
      );
      return false;
    }
    const targetLabel = entry.sourceKind === "tracked-file" ? `file ${entry.vaultPath}` : entry.sourceKind === "orphan-mirror" ? `mirror ${entry.localRepoVaultPath}` : `directory ${entry.vaultPath}`;
    const remoteMessage = remoteResult.status === "deleted" ? `Deleted GitHub repo ${entry.githubRepoSlug}` : `GitHub repo ${entry.githubRepoSlug} was already absent`;
    new import_obsidian9.Notice(`Unpublished ${targetLabel}. ${remoteMessage}.`, 1e4);
    return true;
  }
  isSelectableDirectory(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    if (!normalized) {
      return false;
    }
    const segments = normalized.split("/");
    if (segments.some((segment) => segment.startsWith("."))) {
      return false;
    }
    if (segments.includes("node_modules")) {
      return false;
    }
    return true;
  }
  isSelectableFile(vaultPath) {
    const normalized = normalizeVaultPath(vaultPath);
    if (!normalized) {
      return false;
    }
    const segments = normalized.split("/");
    if (segments.some((segment) => segment.startsWith("."))) {
      return false;
    }
    if (segments.includes("node_modules")) {
      return false;
    }
    return true;
  }
  getActiveDefaultTarget() {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      const activeFilePath = normalizeVaultPath(activeFile.path);
      if (this.isSelectableFile(activeFilePath)) {
        return {
          targetType: "file",
          vaultPath: activeFilePath
        };
      }
    }
    const activeParent = normalizeVaultPath(activeFile?.parent?.path ?? "");
    if (activeParent && this.isSelectableDirectory(activeParent)) {
      return {
        targetType: "directory",
        vaultPath: activeParent
      };
    }
    return void 0;
  }
  listSelectableTargets() {
    const allItems = this.app.vault.getAllLoadedFiles();
    const targets = [];
    for (const item of allItems) {
      const normalizedPath = normalizeVaultPath(item.path);
      if (!normalizedPath) {
        continue;
      }
      if (item instanceof import_obsidian9.TFolder) {
        if (!this.isSelectableDirectory(normalizedPath)) {
          continue;
        }
        targets.push({ path: normalizedPath, kind: "directory" });
        continue;
      }
      if (item instanceof import_obsidian9.TFile) {
        if (!this.isSelectableFile(normalizedPath)) {
          continue;
        }
        targets.push({ path: normalizedPath, kind: "file" });
      }
    }
    const defaultTarget = this.getActiveDefaultTarget();
    targets.sort((left, right) => {
      if (defaultTarget && left.path === defaultTarget.vaultPath) {
        return -1;
      }
      if (defaultTarget && right.path === defaultTarget.vaultPath) {
        return 1;
      }
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }
      return left.path.localeCompare(right.path);
    });
    return targets;
  }
  resolveTargetSelection(item) {
    const normalizedPath = normalizeVaultPath(item.path);
    const abstractItem = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (item.kind === "file" || abstractItem instanceof import_obsidian9.TFile) {
      return {
        targetType: "file",
        vaultPath: normalizedPath
      };
    }
    return {
      targetType: "directory",
      vaultPath: normalizedPath
    };
  }
  getDefaultDirectoryPath(target) {
    if (!target) {
      return null;
    }
    if (target.targetType === "directory") {
      return normalizeVaultPath(target.vaultPath) || null;
    }
    const normalizedFilePath = normalizeVaultPath(target.vaultPath);
    const segments = normalizedFilePath.split("/");
    const parentDirectory = segments.slice(0, -1).join("/");
    return parentDirectory || null;
  }
  async resolveExactTargetByVaultPath(vaultPath) {
    const normalizedPath = normalizeVaultPath(vaultPath);
    if (!normalizedPath) {
      return null;
    }
    const abstractItem = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (abstractItem instanceof import_obsidian9.TFolder && this.isSelectableDirectory(normalizedPath)) {
      return {
        targetType: "directory",
        vaultPath: normalizedPath
      };
    }
    if (abstractItem instanceof import_obsidian9.TFile && this.isSelectableFile(normalizedPath)) {
      return {
        targetType: "file",
        vaultPath: normalizedPath
      };
    }
    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      return null;
    }
    const absolutePath = absolutePathForVaultPath(
      vaultBasePath,
      normalizedPath
    );
    if (!ensureInsideVault(vaultBasePath, absolutePath)) {
      return null;
    }
    try {
      const stats = await import_promises4.default.stat(absolutePath);
      if (stats.isDirectory() && this.isSelectableDirectory(normalizedPath)) {
        return {
          targetType: "directory",
          vaultPath: normalizedPath
        };
      }
      if (stats.isFile() && this.isSelectableFile(normalizedPath)) {
        return {
          targetType: "file",
          vaultPath: normalizedPath
        };
      }
    } catch {
      return null;
    }
    return null;
  }
  async findUniqueTargetByBasename(query) {
    const normalizedQuery = normalizeVaultPath(query);
    if (!normalizedQuery || normalizedQuery.includes("/")) {
      return null;
    }
    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      return null;
    }
    let foundMatch = null;
    let hasMultipleMatches = false;
    const walk = async (absoluteDirectory, relativeDirectory) => {
      if (hasMultipleMatches) {
        return;
      }
      let entries;
      try {
        entries = await import_promises4.default.readdir(absoluteDirectory, {
          withFileTypes: true,
          encoding: "utf8"
        });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (hasMultipleMatches) {
          return;
        }
        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }
        const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
        const normalizedPath = normalizeVaultPath(relativePath);
        if (entry.isDirectory()) {
          if (entry.name === normalizedQuery && this.isSelectableDirectory(normalizedPath)) {
            const candidate = {
              targetType: "directory",
              vaultPath: normalizedPath
            };
            if (foundMatch) {
              hasMultipleMatches = true;
              return;
            }
            foundMatch = candidate;
          }
          await walk(import_node_path4.default.join(absoluteDirectory, entry.name), relativePath);
          continue;
        }
        if (entry.isFile() && entry.name === normalizedQuery && this.isSelectableFile(normalizedPath)) {
          const candidate = {
            targetType: "file",
            vaultPath: normalizedPath
          };
          if (foundMatch) {
            hasMultipleMatches = true;
            return;
          }
          foundMatch = candidate;
        }
      }
    };
    await walk(vaultBasePath, "");
    if (hasMultipleMatches) {
      return null;
    }
    return foundMatch;
  }
  async resolveTypedTargetFromQuery(unmatchedQuery, defaultTarget, selectableTargets) {
    const normalizedQuery = normalizeVaultPath(unmatchedQuery);
    if (!normalizedQuery) {
      return null;
    }
    const exactMatch = await this.resolveExactTargetByVaultPath(normalizedQuery);
    if (exactMatch) {
      return exactMatch;
    }
    const defaultDirectory = this.getDefaultDirectoryPath(defaultTarget);
    if (defaultDirectory) {
      const relativeCandidate = normalizeVaultPath(
        `${defaultDirectory}/${normalizedQuery}`
      );
      const relativeMatch = await this.resolveExactTargetByVaultPath(relativeCandidate);
      if (relativeMatch) {
        return relativeMatch;
      }
    }
    if (normalizedQuery.includes("/")) {
      return null;
    }
    const normalizedQueryLower = normalizedQuery.toLowerCase();
    const basenameMatches = selectableTargets.filter((target) => {
      const normalizedTargetPath = normalizeVaultPath(
        target.path
      ).toLowerCase();
      const segments = normalizedTargetPath.split("/");
      return segments[segments.length - 1] === normalizedQueryLower;
    });
    if (basenameMatches.length === 1) {
      return this.resolveTargetSelection(basenameMatches[0]);
    }
    if (basenameMatches.length > 1 && defaultDirectory) {
      const normalizedDefaultDirectory = normalizeVaultPath(defaultDirectory).toLowerCase();
      const scopedMatches = basenameMatches.filter(
        (target) => normalizeVaultPath(target.path).toLowerCase().startsWith(`${normalizedDefaultDirectory}/`)
      );
      if (scopedMatches.length === 1) {
        return this.resolveTargetSelection(scopedMatches[0]);
      }
    }
    return this.findUniqueTargetByBasename(normalizedQuery);
  }
  async chooseTarget() {
    const selectableTargets = this.listSelectableTargets();
    if (selectableTargets.length === 0) {
      new import_obsidian9.Notice(
        "No publishable files or subdirectories were found in this vault."
      );
      return null;
    }
    const defaultTarget = this.getActiveDefaultTarget();
    const modal = new DirectoryPickerModal(
      this.app,
      selectableTargets,
      defaultTarget?.vaultPath
    );
    const selected = await modal.openAndGetValue();
    if (!selected) {
      const unmatchedQuery = modal.getUnmatchedQuery();
      if (unmatchedQuery) {
        const resolvedFromQuery = await this.resolveTypedTargetFromQuery(
          unmatchedQuery,
          defaultTarget,
          selectableTargets
        );
        if (resolvedFromQuery) {
          return resolvedFromQuery;
        }
        new import_obsidian9.Notice(`No matching target found for: ${unmatchedQuery}`, 6e3);
      }
      return null;
    }
    return this.resolveTargetSelection(selected);
  }
  formatTargetLabel(target) {
    const prefix = target.targetType === "file" ? "file" : "directory";
    return `${prefix}: ${target.vaultPath}`;
  }
  buildMirrorRelativePath(fileVaultPath) {
    const stemSlug = sanitizeRepoName(fileStemFromVaultPath(fileVaultPath));
    const hash = import_node_crypto.default.createHash("sha1").update(fileVaultPath).digest("hex").slice(0, 8);
    return `${MIRROR_ROOT}/${stemSlug}-${hash}`;
  }
  async resolveVisibility(existing) {
    if (existing) {
      return existing.visibility;
    }
    return new VisibilityModal(this.app).openAndGetValue();
  }
  getRepoWebUrl(repoName, originUrl) {
    if (originUrl) {
      return originToWebUrl(originUrl) ?? originUrl;
    }
    return `https://github.com/${repoName}`;
  }
  async openExternalUrl(url) {
    if (typeof require === "function") {
      try {
        const electron = require("electron");
        if (electron.shell?.openExternal) {
          await electron.shell.openExternal(url);
          return;
        }
      } catch {
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }
  async writeClipboardText(text) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
      }
    }
    if (typeof require === "function") {
      try {
        const electron = require("electron");
        if (electron.clipboard?.writeText) {
          electron.clipboard.writeText(text);
          return;
        }
      } catch {
      }
    }
    new import_obsidian9.Notice("Could not copy Google Doc link to clipboard.", 8e3);
  }
  showGoogleDocsPublishedNotice(messagePrefix, url) {
    const fragment = document.createDocumentFragment();
    fragment.append(`${messagePrefix}: `);
    const linkEl = document.createElement("a");
    linkEl.href = url;
    linkEl.textContent = url;
    linkEl.target = "_blank";
    linkEl.rel = "noopener noreferrer";
    linkEl.className = "vault-publisher-notice-link";
    fragment.append(linkEl);
    fragment.append(" (copied)");
    const notice = new import_obsidian9.Notice(fragment, 1e4);
    notice.noticeEl.addClass("vault-publisher-clickable-notice");
    notice.noticeEl.setAttribute("aria-label", `Open ${url}`);
    notice.noticeEl.title = "Open Google Doc";
    const openDoc = (event) => {
      event?.preventDefault();
      event?.stopPropagation();
      void this.openExternalUrl(url);
      notice.hide();
    };
    linkEl.addEventListener("click", (event) => {
      openDoc(event);
    });
    notice.noticeEl.addEventListener("click", (event) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest("a")) {
        return;
      }
      openDoc(event);
    });
    void this.openExternalUrl(url);
  }
  showPublishedRepoNotice(messagePrefix, repoUrl, suffix = "", autoOpen = false) {
    let notice = null;
    const fragment = document.createDocumentFragment();
    fragment.append(`${messagePrefix} `);
    const linkEl = document.createElement("a");
    linkEl.href = repoUrl;
    linkEl.textContent = repoUrl;
    linkEl.target = "_blank";
    linkEl.rel = "noopener noreferrer";
    linkEl.className = "vault-publisher-notice-link";
    fragment.append(linkEl);
    if (suffix) {
      fragment.append(suffix.startsWith(" ") ? suffix : ` ${suffix}`);
    }
    notice = new import_obsidian9.Notice(fragment, 1e4);
    notice.noticeEl.addClass("vault-publisher-clickable-notice");
    notice.noticeEl.setAttribute("aria-label", `Open ${repoUrl}`);
    notice.noticeEl.title = "Open repository in browser";
    const openRepo = (event) => {
      event?.preventDefault();
      event?.stopPropagation();
      void this.openExternalUrl(repoUrl);
      notice?.hide();
    };
    linkEl.addEventListener("click", (event) => {
      openRepo(event);
    });
    notice.noticeEl.addEventListener("click", (event) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest("a")) {
        return;
      }
      openRepo(event);
    });
    if (autoOpen) {
      void this.openExternalUrl(repoUrl);
    }
  }
  async handlePublishCommand(options) {
    if (!await this.ensurePrerequisites()) {
      return;
    }
    let target = null;
    const defaultTarget = this.getActiveDefaultTarget();
    if (options?.forcePicker || !defaultTarget) {
      target = await this.chooseTarget();
    } else {
      target = defaultTarget;
    }
    if (!target) {
      return;
    }
    if (target.targetType === "directory" && isVaultRoot(target.vaultPath)) {
      new import_obsidian9.Notice("Vault root cannot be published. Select a subdirectory.");
      return;
    }
    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new import_obsidian9.Notice("Could not resolve the vault base path.");
      return;
    }
    if (target.targetType === "directory") {
      await this.publishDirectoryTarget(target.vaultPath, vaultBasePath);
      return;
    }
    await this.publishFileTarget(target.vaultPath, vaultBasePath);
  }
  async publishDirectoryTarget(vaultPath, vaultBasePath) {
    const targetPath = absolutePathForVaultPath(vaultBasePath, vaultPath);
    if (!ensureInsideVault(vaultBasePath, targetPath)) {
      new import_obsidian9.Notice("Selected path is outside the vault. Aborting.");
      return;
    }
    const existingRecord = this.configStore.findTarget("directory", vaultPath);
    const visibility = await this.resolveVisibility(existingRecord);
    if (!visibility) {
      return;
    }
    const folderName = folderNameFromVaultPath(vaultPath);
    const baseRepoName = sanitizeRepoName(
      existingRecord?.repoName ?? folderName
    );
    const repoState = await this.gitService.detectRepoState(targetPath);
    if (repoState.hasOrigin && repoState.originUrl && !repoState.isGitHubOrigin) {
      new import_obsidian9.Notice(
        "This directory uses a non-GitHub origin. v1 supports GitHub remotes only.",
        1e4
      );
      return;
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (!repoState.hasLocalGit || !repoState.hasOrigin) {
      new import_obsidian9.Notice(`Connecting directory ${vaultPath} to GitHub...`, 5e3);
      await this.gitService.ensureGitignore(targetPath);
      if (!repoState.hasLocalGit) {
        await this.gitService.initRepo(targetPath);
      }
      const linked = await this.gitService.linkLocalRepoWithoutOrigin(
        targetPath,
        folderName,
        baseRepoName,
        visibility
      );
      this.configStore.upsertTarget({
        targetType: "directory",
        vaultPath,
        repoName: linked.repoName,
        remote: "origin",
        visibility,
        lastPushed: nowIso,
        originUrl: linked.originUrl ?? existingRecord?.originUrl
      });
      await this.configStore.save();
      const repoUrl2 = this.getRepoWebUrl(linked.repoName, linked.originUrl);
      const suffix = linked.pushed ? "" : " (linked remote, no commits yet)";
      this.showPublishedRepoNotice(
        `Published ${vaultPath} ->`,
        repoUrl2,
        suffix,
        true
      );
      return;
    }
    new import_obsidian9.Notice(`Pushing directory repo ${vaultPath}...`, 5e3);
    const pushResult = await this.gitService.pushDirectory(
      targetPath,
      folderName
    );
    if (pushResult.status === "failed") {
      new import_obsidian9.Notice(pushResult.error ?? "Push failed.", 12e3);
      return;
    }
    const repoName = existingRecord?.repoName || (repoState.originUrl ? parseRepoNameFromOrigin(repoState.originUrl) : null) || baseRepoName;
    const nextLastPushed = pushResult.status === "pushed" ? nowIso : existingRecord?.lastPushed ?? nowIso;
    this.configStore.upsertTarget({
      targetType: "directory",
      vaultPath,
      repoName,
      remote: "origin",
      visibility,
      lastPushed: nextLastPushed,
      originUrl: repoState.originUrl ?? existingRecord?.originUrl
    });
    await this.configStore.save();
    if (pushResult.status === "up_to_date") {
      new import_obsidian9.Notice("Already up to date.");
      return;
    }
    const repoUrl = this.getRepoWebUrl(repoName, repoState.originUrl ?? null);
    new import_obsidian9.Notice(
      `Pushed ${pushResult.changedCount ?? 0} changes to ${repoUrl}`,
      8e3
    );
  }
  async publishFileTarget(vaultPath, vaultBasePath) {
    const sourceFile = this.app.vault.getAbstractFileByPath(vaultPath);
    if (!(sourceFile instanceof import_obsidian9.TFile)) {
      new import_obsidian9.Notice(`File not found: ${vaultPath}`);
      return;
    }
    const existingRecord = this.configStore.findTarget("file", vaultPath);
    const visibility = await this.resolveVisibility(existingRecord);
    if (!visibility) {
      return;
    }
    const sourceAbsolutePath = absolutePathForVaultPath(
      vaultBasePath,
      vaultPath
    );
    const mirrorPath = existingRecord?.mirrorPath ?? this.buildMirrorRelativePath(vaultPath);
    const mirrorFileName = existingRecord?.mirrorFileName ?? import_node_path4.default.posix.basename(vaultPath);
    const mirrorAbsolutePath = absolutePathForVaultPath(
      vaultBasePath,
      mirrorPath
    );
    if (!ensureInsideVault(vaultBasePath, sourceAbsolutePath) || !ensureInsideVault(vaultBasePath, mirrorAbsolutePath)) {
      new import_obsidian9.Notice("File publish path resolved outside vault. Aborting.");
      return;
    }
    const fileStem = fileStemFromVaultPath(vaultPath);
    const baseRepoName = sanitizeRepoName(existingRecord?.repoName ?? fileStem);
    await this.gitService.syncSingleFileToRepo(
      sourceAbsolutePath,
      mirrorAbsolutePath,
      mirrorFileName
    );
    let repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
    if (repoState.hasOrigin && repoState.originUrl && !repoState.isGitHubOrigin) {
      new import_obsidian9.Notice(
        "This file target uses a non-GitHub origin. v1 supports GitHub remotes only.",
        12e3
      );
      return;
    }
    if (!repoState.hasLocalGit) {
      await this.gitService.initRepo(mirrorAbsolutePath);
      repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (!repoState.hasOrigin) {
      new import_obsidian9.Notice(`Connecting file ${vaultPath} to GitHub...`, 5e3);
      const linked = await this.gitService.linkLocalRepoWithoutOrigin(
        mirrorAbsolutePath,
        fileStem,
        baseRepoName,
        visibility
      );
      this.configStore.upsertTarget({
        targetType: "file",
        vaultPath,
        repoName: linked.repoName,
        remote: "origin",
        visibility,
        lastPushed: nowIso,
        originUrl: linked.originUrl ?? existingRecord?.originUrl,
        mirrorPath,
        mirrorFileName
      });
      await this.configStore.save();
      const repoUrl2 = this.getRepoWebUrl(linked.repoName, linked.originUrl);
      const suffix = linked.pushed ? "" : " (linked remote, no commits yet)";
      this.showPublishedRepoNotice(
        `Published file ${vaultPath} ->`,
        repoUrl2,
        suffix,
        true
      );
      return;
    }
    new import_obsidian9.Notice(`Pushing file repo ${vaultPath}...`, 5e3);
    const pushResult = await this.gitService.pushDirectory(
      mirrorAbsolutePath,
      fileStem
    );
    if (pushResult.status === "failed") {
      new import_obsidian9.Notice(pushResult.error ?? "File push failed.", 12e3);
      return;
    }
    const repoName = existingRecord?.repoName || (repoState.originUrl ? parseRepoNameFromOrigin(repoState.originUrl) : null) || baseRepoName;
    const nextLastPushed = pushResult.status === "pushed" ? nowIso : existingRecord?.lastPushed ?? nowIso;
    this.configStore.upsertTarget({
      targetType: "file",
      vaultPath,
      repoName,
      remote: "origin",
      visibility,
      lastPushed: nextLastPushed,
      originUrl: repoState.originUrl ?? existingRecord?.originUrl,
      mirrorPath,
      mirrorFileName
    });
    await this.configStore.save();
    if (pushResult.status === "up_to_date") {
      new import_obsidian9.Notice(`File repo already up to date: ${vaultPath}`, 6e3);
      return;
    }
    const repoUrl = this.getRepoWebUrl(repoName, repoState.originUrl ?? null);
    new import_obsidian9.Notice(
      `Pushed ${pushResult.changedCount ?? 0} file changes to ${repoUrl}`,
      9e3
    );
  }
  summarizeResults(results) {
    return {
      total: results.length,
      pushed: results.filter((result) => result.status === "pushed").length,
      upToDate: results.filter((result) => result.status === "up_to_date").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results
    };
  }
  async pushManagedFileTargets(vaultBasePath) {
    const records = this.configStore.getTargetsByType("file");
    const results = [];
    let changed = false;
    for (const record of records) {
      const sourceItem = this.app.vault.getAbstractFileByPath(record.vaultPath);
      if (!(sourceItem instanceof import_obsidian9.TFile)) {
        results.push({
          targetType: "file",
          vaultPath: record.vaultPath,
          status: "failed",
          error: "Source file no longer exists."
        });
        continue;
      }
      if (!record.mirrorPath || !record.mirrorFileName) {
        results.push({
          targetType: "file",
          vaultPath: record.vaultPath,
          status: "failed",
          error: "Missing mirror metadata for file target."
        });
        continue;
      }
      const sourceAbsolutePath = absolutePathForVaultPath(
        vaultBasePath,
        record.vaultPath
      );
      const mirrorAbsolutePath = absolutePathForVaultPath(
        vaultBasePath,
        record.mirrorPath
      );
      if (!ensureInsideVault(vaultBasePath, sourceAbsolutePath) || !ensureInsideVault(vaultBasePath, mirrorAbsolutePath)) {
        results.push({
          targetType: "file",
          vaultPath: record.vaultPath,
          status: "failed",
          error: "Resolved file or mirror path outside vault."
        });
        continue;
      }
      try {
        await this.gitService.syncSingleFileToRepo(
          sourceAbsolutePath,
          mirrorAbsolutePath,
          record.mirrorFileName
        );
        let repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
        if (repoState.hasOrigin && repoState.originUrl && !repoState.isGitHubOrigin) {
          results.push({
            targetType: "file",
            vaultPath: record.vaultPath,
            status: "failed",
            error: "Non-GitHub origin is configured for this file mirror."
          });
          continue;
        }
        if (!repoState.hasLocalGit) {
          await this.gitService.initRepo(mirrorAbsolutePath);
          repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
        }
        const nowIso = (/* @__PURE__ */ new Date()).toISOString();
        const fileStem = fileStemFromVaultPath(record.vaultPath);
        const baseRepoName = sanitizeRepoName(record.repoName || fileStem);
        if (!repoState.hasOrigin) {
          const linked = await this.gitService.linkLocalRepoWithoutOrigin(
            mirrorAbsolutePath,
            fileStem,
            baseRepoName,
            record.visibility
          );
          const status = linked.pushed ? "pushed" : "up_to_date";
          results.push({
            targetType: "file",
            vaultPath: record.vaultPath,
            status,
            originUrl: linked.originUrl ?? void 0
          });
          this.configStore.upsertTarget({
            ...record,
            repoName: linked.repoName,
            originUrl: linked.originUrl ?? record.originUrl,
            lastPushed: status === "pushed" ? nowIso : record.lastPushed
          });
          changed = true;
          continue;
        }
        const pushResult = await this.gitService.pushDirectory(
          mirrorAbsolutePath,
          fileStem
        );
        results.push({
          ...pushResult,
          targetType: "file",
          vaultPath: record.vaultPath,
          originUrl: repoState.originUrl
        });
        const repoName = record.repoName || (repoState.originUrl ? parseRepoNameFromOrigin(repoState.originUrl) : null) || baseRepoName;
        this.configStore.upsertTarget({
          ...record,
          repoName,
          originUrl: repoState.originUrl ?? record.originUrl,
          lastPushed: pushResult.status === "pushed" ? nowIso : record.lastPushed
        });
        changed = true;
      } catch (error) {
        const message = error instanceof GitCommandError ? error.displayMessage() : error instanceof Error ? error.message : "Unknown file push failure.";
        results.push({
          targetType: "file",
          vaultPath: record.vaultPath,
          status: "failed",
          error: message
        });
      }
    }
    return { results, changed };
  }
  async handlePushAllRepositories() {
    if (!await this.ensurePrerequisites()) {
      return;
    }
    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new import_obsidian9.Notice("Could not resolve the vault base path.");
      return;
    }
    new import_obsidian9.Notice("Pushing all repositories...", 5e3);
    const directorySummary = await this.gitService.pushAllRepos(vaultBasePath, {
      resolveVisibility: (vaultPath) => this.configStore.findTarget("directory", vaultPath)?.visibility ?? "private",
      resolveBaseRepoName: (vaultPath) => this.configStore.findTarget("directory", vaultPath)?.repoName ?? folderNameFromVaultPath(vaultPath)
    });
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    let shouldSave = false;
    for (const result of directorySummary.results) {
      if (!result.originUrl || !isGitHubOrigin(result.originUrl)) {
        continue;
      }
      const repoName = parseRepoNameFromOrigin(result.originUrl);
      if (!repoName) {
        continue;
      }
      const existing = this.configStore.findTarget(
        "directory",
        result.vaultPath
      );
      const visibility = existing?.visibility ?? "private";
      const lastPushed = result.status === "pushed" ? nowIso : existing?.lastPushed ?? nowIso;
      this.configStore.upsertTarget({
        targetType: "directory",
        vaultPath: result.vaultPath,
        repoName,
        remote: "origin",
        visibility,
        lastPushed,
        originUrl: result.originUrl ?? existing?.originUrl
      });
      shouldSave = true;
    }
    const filePush = await this.pushManagedFileTargets(vaultBasePath);
    if (filePush.changed) {
      shouldSave = true;
    }
    if (shouldSave) {
      await this.configStore.save();
    }
    const summary = this.summarizeResults([
      ...directorySummary.results,
      ...filePush.results
    ]);
    if (summary.total === 0) {
      new import_obsidian9.Notice("No standalone or managed file repositories found to push.");
      return;
    }
    new import_obsidian9.Notice(
      `Push All complete: ${summary.pushed} pushed, ${summary.upToDate} up to date, ${summary.failed} failed, ${summary.skipped} skipped.`,
      1e4
    );
    const failures = summary.results.filter(
      (result) => result.status === "failed"
    );
    if (failures.length > 0) {
      const details = failures.slice(0, 3).map(
        (failure) => `${failure.targetType}:${failure.vaultPath}: ${failure.error ?? "Unknown error"}`
      ).join(" | ");
      new import_obsidian9.Notice(`Push failures: ${details}`, 12e3);
    }
  }
  showCommandError(error) {
    if (error instanceof GitCommandError) {
      new import_obsidian9.Notice(`${error.command} failed: ${error.displayMessage()}`, 15e3);
      return;
    }
    if (error instanceof StaticSitePublishError) {
      new import_obsidian9.Notice(error.message, 15e3);
      return;
    }
    if (error instanceof GoogleDocsPublishError) {
      new import_obsidian9.Notice(error.message, 15e3);
      return;
    }
    if (error instanceof Error) {
      new import_obsidian9.Notice(error.message, 12e3);
      return;
    }
    new import_obsidian9.Notice("An unknown error occurred.", 12e3);
  }
  // --- Static Site Hosts (experimental) ---
  getConfigStore() {
    return this.configStore;
  }
  async saveConfig() {
    await this.configStore.save();
  }
  getGoogleDocsSettings() {
    return this.configStore.getGoogleDocsSettings();
  }
  async updateGoogleDocsSettings(settings) {
    this.configStore.updateGoogleDocsSettings(settings);
    await this.configStore.save();
  }
  async authorizeGoogleDocs() {
    const settings = this.configStore.getGoogleDocsSettings();
    try {
      const refreshToken = await this.googleDocsPublisher.authorizeWithLocalServer(
        settings,
        (url) => this.openExternalUrl(url)
      );
      this.configStore.updateGoogleDocsSettings({ refreshToken });
      await this.configStore.save();
      new import_obsidian9.Notice("Google Docs authorization saved.", 8e3);
    } catch (error) {
      this.showCommandError(error);
    }
  }
  async forgetGoogleDocsAuth() {
    this.configStore.clearGoogleDocsRefreshToken();
    await this.configStore.save();
    new import_obsidian9.Notice("Forgot Google Docs authorization token.", 6e3);
  }
  async handleUploadToGoogleDocs() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      new import_obsidian9.Notice(
        "Open the Markdown note you want to upload, then run this command.",
        8e3
      );
      return;
    }
    const settings = this.configStore.getGoogleDocsSettings();
    if (!settings.credentialsPath || !settings.docsFolderId) {
      new import_obsidian9.Notice(
        "Configure Google OAuth credentials and a Drive folder ID in Vault Publisher settings first.",
        1e4
      );
      return;
    }
    if (!settings.refreshToken) {
      new import_obsidian9.Notice(
        "Authorize Google Docs in Vault Publisher settings before uploading.",
        1e4
      );
      return;
    }
    const cache = this.app.metadataCache.getFileCache(activeFile);
    const rawFrontmatter = cache?.frontmatter ?? {};
    const title = typeof rawFrontmatter.title === "string" && rawFrontmatter.title.trim().length > 0 ? rawFrontmatter.title.trim() : activeFile.basename;
    const fileContent = await this.app.vault.read(activeFile);
    const markdownBody = this.stripFrontmatter(fileContent);
    const rendered = renderGoogleDocsMarkdown(markdownBody, { title });
    const preparedMedia = await this.prepareGoogleDocsMedia(
      activeFile,
      rendered.mediaRefs
    );
    const previousRecord = this.configStore.findGoogleDocsPublish(
      activeFile.path
    );
    new import_obsidian9.Notice(`Uploading ${activeFile.path} to Google Docs...`, 5e3);
    try {
      const result = await this.googleDocsPublisher.publish({
        settings,
        title,
        html: rendered.html,
        vaultPath: activeFile.path,
        previousRecord,
        mediaUploads: preparedMedia.uploads,
        missingMedia: preparedMedia.missing
      });
      this.configStore.updateGoogleDocsSettings(result.settings);
      this.configStore.upsertGoogleDocsPublish(result.record);
      await this.configStore.save();
      const warnings = [
        ...rendered.warnings,
        ...preparedMedia.warnings,
        ...result.warnings
      ];
      for (const warning of warnings) {
        new import_obsidian9.Notice(`Warning: ${warning}`, 9e3);
      }
      await this.writeClipboardText(result.record.docUrl);
      this.showGoogleDocsPublishedNotice(
        result.status === "created" ? "Created Google Doc" : "Updated Google Doc",
        result.record.docUrl
      );
    } catch (error) {
      this.showCommandError(error);
    }
  }
  async prepareGoogleDocsMedia(sourceFile, refs) {
    const uploads = [];
    const missing = [];
    const warnings = [];
    for (const ref of refs) {
      const resolved = this.resolveMediaFile(sourceFile, ref);
      if (!resolved) {
        const message = `Could not resolve media ${ref.original}.`;
        missing.push({ marker: ref.marker, original: ref.original, message });
        continue;
      }
      const mimeType = this.getMimeType(resolved.path);
      const kind = this.getAssetKind(mimeType);
      const bytes = Buffer.from(await this.app.vault.readBinary(resolved));
      const checksum = import_node_crypto.default.createHash("sha256").update(bytes).digest("hex");
      const inlineSupported = mimeType === "image/png" || mimeType === "image/jpeg" || mimeType === "image/gif";
      if (kind === "image" && !inlineSupported) {
        warnings.push(
          `${ref.original} will be uploaded to Drive and linked because Google Docs API only supports PNG, JPEG, and GIF inline images.`
        );
      }
      uploads.push({
        marker: ref.marker,
        original: ref.original,
        vaultPath: resolved.path,
        name: import_node_path4.default.posix.basename(resolved.path),
        mimeType,
        checksum,
        kind,
        bytes,
        inlineSupported
      });
    }
    return { uploads, missing, warnings };
  }
  resolveMediaFile(sourceFile, ref) {
    const target = this.cleanMediaTarget(ref.target);
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) {
      return null;
    }
    if (ref.source === "obsidian-embed") {
      const linked = this.app.metadataCache.getFirstLinkpathDest(
        target,
        sourceFile.path
      );
      if (linked instanceof import_obsidian9.TFile) {
        return linked;
      }
    }
    const sourceParent = normalizeVaultPath(sourceFile.parent?.path ?? "");
    const candidates = /* @__PURE__ */ new Set();
    candidates.add(normalizeVaultPath(target));
    if (target.startsWith("/")) {
      candidates.add(normalizeVaultPath(target.slice(1)));
    } else if (sourceParent) {
      candidates.add(normalizeVaultPath(`${sourceParent}/${target}`));
    }
    for (const candidate of candidates) {
      const abstractFile = this.app.vault.getAbstractFileByPath(candidate);
      if (abstractFile instanceof import_obsidian9.TFile) {
        return abstractFile;
      }
    }
    return null;
  }
  cleanMediaTarget(target) {
    const withoutAlias = target.split("|")[0] ?? target;
    const withoutHeading = withoutAlias.split("#")[0] ?? withoutAlias;
    const withoutQuery = withoutHeading.split("?")[0] ?? withoutHeading;
    try {
      return decodeURIComponent(withoutQuery.trim());
    } catch {
      return withoutQuery.trim();
    }
  }
  getMimeType(vaultPath) {
    const extension = import_node_path4.default.posix.extname(vaultPath).toLowerCase();
    const byExtension = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".mp4": "video/mp4",
      ".m4v": "video/x-m4v",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".avi": "video/x-msvideo",
      ".mkv": "video/x-matroska"
    };
    return byExtension[extension] ?? "application/octet-stream";
  }
  getAssetKind(mimeType) {
    if (mimeType.startsWith("image/")) {
      return "image";
    }
    if (mimeType.startsWith("video/")) {
      return "video";
    }
    return "other";
  }
  getStaticSiteHosts() {
    return this.configStore.getStaticSiteHosts();
  }
  async upsertStaticSiteHost(host) {
    this.configStore.upsertStaticSiteHost(host);
    await this.configStore.save();
  }
  async removeStaticSiteHost(hostId) {
    const removed = this.configStore.removeStaticSiteHost(hostId);
    if (removed) {
      await this.configStore.save();
    }
    return removed;
  }
  async resolveStaticSiteHost(frontmatterHostId) {
    const hosts = this.configStore.getStaticSiteHosts();
    if (hosts.length === 0) {
      new import_obsidian9.Notice(
        "No static site hosts configured. Open Vault Publisher settings and add a host under 'Static Site Hosts'.",
        1e4
      );
      return null;
    }
    if (frontmatterHostId) {
      const byId = hosts.find((host) => host.id === frontmatterHostId);
      if (byId) {
        return byId;
      }
      new import_obsidian9.Notice(
        `Frontmatter 'host' is '${frontmatterHostId}' but no host with that id is configured. Pick one manually.`,
        1e4
      );
    }
    if (hosts.length === 1) {
      return hosts[0];
    }
    return new StaticSiteHostPickerModal(this.app, hosts).openAndGetValue();
  }
  async handlePublishToStaticSite() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      new import_obsidian9.Notice(
        "Open the Markdown note you want to publish, then run this command.",
        8e3
      );
      return;
    }
    const cache = this.app.metadataCache.getFileCache(activeFile);
    const rawFrontmatter = cache?.frontmatter ?? {};
    const rawHostId = typeof rawFrontmatter.host === "string" ? rawFrontmatter.host : void 0;
    const host = await this.resolveStaticSiteHost(rawHostId);
    if (!host) {
      return;
    }
    let fileContent = await this.app.vault.read(activeFile);
    let markdownBody = this.stripFrontmatter(fileContent);
    let frontmatter = rawFrontmatter;
    const preflight = validatePostFrontmatter(frontmatter);
    if (!preflight.ok) {
      const hosts = this.configStore.getStaticSiteHosts();
      const fileBasename = activeFile.basename;
      const defaults = computePostDefaults({
        fileBasename,
        body: markdownBody
      });
      const merged = mergeDefaults(frontmatter, defaults);
      const modal = new PostFrontmatterModal(this.app, {
        hosts,
        defaults: {
          title: merged.title,
          slug: merged.slug,
          date: merged.date,
          description: merged.description,
          hostId: merged.hostId ?? host.id
        },
        noteBasename: activeFile.basename
      });
      const outcome = await modal.openAndGetValue();
      if (!outcome) {
        return;
      }
      if (outcome.values.hostId && outcome.values.hostId !== host.id) {
        const alternate = this.configStore.findStaticSiteHost(
          outcome.values.hostId
        );
        if (alternate) {
          Object.assign(host, alternate);
        }
      }
      const nextFrontmatter = {
        ...frontmatter,
        title: outcome.values.title,
        slug: outcome.values.slug,
        date: outcome.values.date,
        description: outcome.values.description
      };
      if (outcome.values.hostId) {
        nextFrontmatter.host = outcome.values.hostId;
      }
      if (outcome.persistToNote) {
        const updatedContent = upsertFrontmatterFields(fileContent, {
          title: outcome.values.title,
          slug: outcome.values.slug,
          date: outcome.values.date,
          description: outcome.values.description,
          host: outcome.values.hostId
        });
        await this.app.vault.modify(activeFile, updatedContent);
        fileContent = updatedContent;
        markdownBody = this.stripFrontmatter(updatedContent);
      }
      frontmatter = nextFrontmatter;
    }
    const previousRecord = this.configStore.findStaticSitePublish(
      host.id,
      activeFile.path
    );
    new import_obsidian9.Notice(`Publishing ${activeFile.path} to ${host.name}...`, 4e3);
    try {
      const result = await this.staticSitePublisher.publish({
        host,
        frontmatter,
        markdownBody,
        vaultPath: activeFile.path,
        previousRecord
      });
      const record = {
        hostId: host.id,
        vaultPath: activeFile.path,
        slug: result.slug,
        lastPublished: (/* @__PURE__ */ new Date()).toISOString(),
        lastCommitSha: result.commitSha ?? void 0
      };
      this.configStore.upsertStaticSitePublish(record);
      await this.configStore.save();
      for (const warning of result.warnings) {
        new import_obsidian9.Notice(`Warning: ${warning}`, 8e3);
      }
      if (result.status === "unchanged") {
        new import_obsidian9.Notice(`Already up to date on ${host.name}.`, 6e3);
        return;
      }
      if (result.publicUrl) {
        this.showStaticSitePublishedNotice(
          host.name,
          result.publicUrl,
          result.removedPreviousSlug
        );
      } else {
        const suffix = result.removedPreviousSlug ? ` (old slug '${result.removedPreviousSlug}' removed)` : "";
        new import_obsidian9.Notice(
          `Published to ${host.name}: ${result.postRelativePathFromRepo}${suffix}`,
          1e4
        );
      }
    } catch (error) {
      this.showCommandError(error);
    }
  }
  async handleUnpublishFromStaticSite() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      new import_obsidian9.Notice(
        "Open the Markdown note you want to unpublish, then run this command.",
        8e3
      );
      return;
    }
    const publishes = this.configStore.getStaticSitePublishes().filter(
      (record2) => record2.vaultPath === normalizeVaultPath(activeFile.path)
    );
    if (publishes.length === 0) {
      new import_obsidian9.Notice(
        "This note has not been published to any static site host.",
        8e3
      );
      return;
    }
    let record = publishes[0];
    if (publishes.length > 1) {
      const hosts = this.configStore.getStaticSiteHosts();
      const candidateHosts = publishes.map((publish) => hosts.find((host2) => host2.id === publish.hostId)).filter((host2) => host2 !== void 0);
      const chosenHost = await new StaticSiteHostPickerModal(
        this.app,
        candidateHosts
      ).openAndGetValue();
      if (!chosenHost) {
        return;
      }
      const matching = publishes.find(
        (publish) => publish.hostId === chosenHost.id
      );
      if (!matching) {
        return;
      }
      record = matching;
    }
    const host = this.configStore.findStaticSiteHost(record.hostId);
    if (!host) {
      new import_obsidian9.Notice(
        `Host '${record.hostId}' is no longer configured. Remove the publish record manually in settings.`,
        1e4
      );
      return;
    }
    const confirmed = await new StaticSiteUnpublishConfirmModal(
      this.app,
      host,
      record
    ).openAndConfirm();
    if (!confirmed) {
      return;
    }
    try {
      const result = await this.staticSitePublisher.unpublish({ host, record });
      this.configStore.removeStaticSitePublish(host.id, record.vaultPath);
      await this.configStore.save();
      if (result.status === "not_found") {
        new import_obsidian9.Notice(
          `Post file not found on disk; publish record removed.`,
          8e3
        );
        return;
      }
      new import_obsidian9.Notice(`Unpublished from ${host.name}.`, 8e3);
    } catch (error) {
      this.showCommandError(error);
    }
  }
  stripFrontmatter(fileContent) {
    if (!fileContent.startsWith("---")) {
      return fileContent;
    }
    const match = fileContent.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (!match) {
      return fileContent;
    }
    return fileContent.slice(match[0].length);
  }
  showStaticSitePublishedNotice(hostName, url, removedPreviousSlug) {
    const fragment = document.createDocumentFragment();
    fragment.append(`Published to ${hostName}: `);
    const linkEl = document.createElement("a");
    linkEl.href = url;
    linkEl.textContent = url;
    linkEl.target = "_blank";
    linkEl.rel = "noopener noreferrer";
    linkEl.className = "vault-publisher-notice-link";
    fragment.append(linkEl);
    if (removedPreviousSlug) {
      fragment.append(` (old slug '${removedPreviousSlug}' removed)`);
    }
    const notice = new import_obsidian9.Notice(fragment, 1e4);
    notice.noticeEl.addClass("vault-publisher-clickable-notice");
    notice.noticeEl.setAttribute("aria-label", `Open ${url}`);
    notice.noticeEl.title = "Open post in browser";
    const openLink = (event) => {
      event?.preventDefault();
      event?.stopPropagation();
      void this.openExternalUrl(url);
      notice.hide();
    };
    linkEl.addEventListener("click", (event) => {
      openLink(event);
    });
    notice.noticeEl.addEventListener("click", (event) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest("a")) {
        return;
      }
      openLink(event);
    });
    void this.openExternalUrl(url);
  }
};

// main.ts
var main_default = VaultPublisherPlugin;
