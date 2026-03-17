"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);

// src/plugin.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_promises2 = __toESM(require("node:fs/promises"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var import_obsidian5 = require("obsidian");

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

// src/modals/visibility-modal.ts
var import_obsidian2 = require("obsidian");
var VisibilityModal = class extends import_obsidian2.Modal {
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
    const visibilitySetting = new import_obsidian2.Setting(contentEl).setName("Visibility").setDesc("Required: pick one option");
    const buttonContainer = visibilitySetting.controlEl.createDiv({
      cls: "vault-publisher-visibility-buttons"
    });
    this.publicButton = new import_obsidian2.ButtonComponent(buttonContainer).setButtonText("Public").onClick(() => {
      this.selected = "public";
      this.refreshSelectionState();
    });
    this.privateButton = new import_obsidian2.ButtonComponent(buttonContainer).setButtonText("Private").onClick(() => {
      this.selected = "private";
      this.refreshSelectionState();
    });
    new import_obsidian2.Setting(contentEl).addButton((button) => {
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
var DEFAULT_DATA = {
  publishedTargets: []
};
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
var ConfigStore = class {
  constructor(plugin) {
    this.data = { ...DEFAULT_DATA };
    this.plugin = plugin;
  }
  async load() {
    const loaded = await this.plugin.loadData();
    if (!loaded || typeof loaded !== "object") {
      this.data = { ...DEFAULT_DATA };
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
    this.data = {
      publishedTargets: records
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
    return this.data.publishedTargets.filter((record) => record.targetType === targetType);
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
    super(params.message ?? `${params.command} ${params.args.join(" ")} failed`);
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
  const candidates = import_node_process.default.platform === "win32" ? [] : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
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
      const result = await this.run("git", ["remote", "get-url", "origin"], targetDir);
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
      await import_promises.default.rm(import_node_path2.default.join(targetDir, entry.name), { recursive: true, force: true });
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
        const commandError = errorFromUnknown(error, "gh", ["repo", "create"], targetDir);
        if (isRepoNameTakenError(commandError)) {
          continue;
        }
        if (isRemoteAttachFailure(commandError)) {
          const recovered = await this.recoverAfterRemoteAttachFailure(targetDir, candidate);
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
    const result = await this.run("git", ["diff", "--cached", "--name-only"], targetDir);
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
      const result = await this.run("git", ["rev-list", "--count", "@{u}..HEAD"], targetDir);
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
      const result = await this.run("git", ["remote", "get-url", "origin"], targetDir);
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
      const commandError = errorFromUnknown(error, "gh", ["repo", "delete", repoSlug, "--yes"]);
      if (isGitHubRepoNotFoundError(commandError)) {
        return { status: "not_found" };
      }
      throw commandError;
    }
  }
  async removeGitDirectory(targetDir) {
    await import_promises.default.rm(import_node_path2.default.join(targetDir, ".git"), { recursive: true, force: true });
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
      const hasLocalGitDir = entries.some((entry) => entry.isDirectory() && entry.name === ".git");
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
      const repoName2 = await this.createRepoWithAutoName(targetDir, baseRepoName, visibility, 50, {
        push: true
      });
      const originUrl2 = await this.getOriginUrl(targetDir);
      return { repoName: repoName2, originUrl: originUrl2, pushed: true };
    } catch (error) {
      const commandError = errorFromUnknown(error, "gh", ["repo", "create"], targetDir);
      if (!isNoCommitsError(commandError)) {
        throw commandError;
      }
    }
    const repoName = await this.createRepoWithAutoName(targetDir, baseRepoName, visibility, 50, {
      push: false,
      remoteName: "origin"
    });
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
      const commandError = errorFromUnknown(error, "git", ["commit"], targetDir);
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
    return this.findStandaloneReposUnderRoot(mirrorRootPath, mirrorRootRelativePath);
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
          const baseRepoName = sanitizeRepoName(configuredBaseName ?? folderName);
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
          const commandError = errorFromUnknown(error, "gh", ["repo", "create"], absolutePath);
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
      results.push({ ...result, targetType: "directory", vaultPath, originUrl: repoState.originUrl });
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

// src/settings/vault-publisher-setting-tab.ts
var import_obsidian4 = require("obsidian");

// src/modals/unpublish-confirm-modal.ts
var import_obsidian3 = require("obsidian");
var UnpublishConfirmModal = class extends import_obsidian3.Modal {
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
    new import_obsidian3.Setting(contentEl).addButton((button) => {
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
var VaultPublisherSettingTab = class extends import_obsidian4.PluginSettingTab {
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
        return;
      }
      const groups = [
        {
          title: "Tracked Targets",
          description: "Repositories the plugin explicitly tracks for directories and file mirrors.",
          emptyText: "No tracked directory or file targets.",
          entries: entries.filter((entry) => entry.sourceKind === "tracked-directory" || entry.sourceKind === "tracked-file")
        },
        {
          title: "Scanned Repositories",
          description: "Standalone Git repositories found by the existing vault scan.",
          emptyText: "No standalone scanned repositories.",
          entries: entries.filter((entry) => entry.sourceKind === "scanned-directory")
        },
        {
          title: "Orphan Mirrors",
          description: "Mirror repositories under the plugin mirror root that are no longer tied to a tracked file target.",
          emptyText: "No orphan mirror repositories.",
          entries: entries.filter((entry) => entry.sourceKind === "orphan-mirror")
        }
      ];
      for (const group of groups) {
        this.renderGroup(containerEl, group);
      }
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
    }
  }
  renderHeader(containerEl, totalCount) {
    const heading = totalCount === void 0 ? "Repository Management" : `Repository Management (${totalCount})`;
    new import_obsidian4.Setting(containerEl).setName(heading).setDesc(
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
    const setting = new import_obsidian4.Setting(containerEl);
    setting.settingEl.addClass("vault-publisher-entry");
    setting.nameEl.empty();
    const titleEl = setting.nameEl.createDiv({ cls: "vault-publisher-entry-title" });
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
      const lineEl = setting.descEl.createDiv({ cls: "vault-publisher-entry-line" });
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
    const confirmed = await new UnpublishConfirmModal(this.app, entry).openAndConfirm();
    if (!confirmed) {
      return;
    }
    button.setButtonText("Working...");
    button.setDisabled(true);
    await this.vaultPublisher.unpublishRepo(entry);
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

// src/plugin.ts
var VaultPublisherPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.isRunning = false;
  }
  async onload() {
    this.configStore = new ConfigStore(this);
    await this.configStore.load();
    this.gitService = new GitService();
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
  }
  async ensurePrerequisites() {
    const status = await this.gitService.checkPrerequisites();
    if (!status.ok) {
      new import_obsidian5.Notice(status.message ?? "Missing required tools.", 12e3);
      return false;
    }
    return true;
  }
  async executeExclusive(action) {
    if (this.isRunning) {
      new import_obsidian5.Notice("Vault Publisher is already running.");
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
      new import_obsidian5.Notice(entry.disabledReason ?? "This repository cannot be unpublished.", 1e4);
      return false;
    }
    const githubStatus = await this.gitService.checkGitHubPrerequisites();
    if (!githubStatus.ok) {
      new import_obsidian5.Notice(githubStatus.message ?? "Missing required GitHub tools.", 12e3);
      return false;
    }
    let remoteResult;
    try {
      remoteResult = await this.gitService.deleteGitHubRepo(entry.githubRepoSlug);
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
      new import_obsidian5.Notice(`${remoteMessage2}, but local cleanup failed: ${detail}`, 15e3);
      return false;
    }
    const targetLabel = entry.sourceKind === "tracked-file" ? `file ${entry.vaultPath}` : entry.sourceKind === "orphan-mirror" ? `mirror ${entry.localRepoVaultPath}` : `directory ${entry.vaultPath}`;
    const remoteMessage = remoteResult.status === "deleted" ? `Deleted GitHub repo ${entry.githubRepoSlug}` : `GitHub repo ${entry.githubRepoSlug} was already absent`;
    new import_obsidian5.Notice(`Unpublished ${targetLabel}. ${remoteMessage}.`, 1e4);
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
      if (item instanceof import_obsidian5.TFolder) {
        if (!this.isSelectableDirectory(normalizedPath)) {
          continue;
        }
        targets.push({ path: normalizedPath, kind: "directory" });
        continue;
      }
      if (item instanceof import_obsidian5.TFile) {
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
    if (item.kind === "file" || abstractItem instanceof import_obsidian5.TFile) {
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
    if (abstractItem instanceof import_obsidian5.TFolder && this.isSelectableDirectory(normalizedPath)) {
      return {
        targetType: "directory",
        vaultPath: normalizedPath
      };
    }
    if (abstractItem instanceof import_obsidian5.TFile && this.isSelectableFile(normalizedPath)) {
      return {
        targetType: "file",
        vaultPath: normalizedPath
      };
    }
    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      return null;
    }
    const absolutePath = absolutePathForVaultPath(vaultBasePath, normalizedPath);
    if (!ensureInsideVault(vaultBasePath, absolutePath)) {
      return null;
    }
    try {
      const stats = await import_promises2.default.stat(absolutePath);
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
        entries = await import_promises2.default.readdir(absoluteDirectory, { withFileTypes: true, encoding: "utf8" });
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
          await walk(import_node_path3.default.join(absoluteDirectory, entry.name), relativePath);
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
      const relativeCandidate = normalizeVaultPath(`${defaultDirectory}/${normalizedQuery}`);
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
      const normalizedTargetPath = normalizeVaultPath(target.path).toLowerCase();
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
      new import_obsidian5.Notice("No publishable files or subdirectories were found in this vault.");
      return null;
    }
    const defaultTarget = this.getActiveDefaultTarget();
    const modal = new DirectoryPickerModal(this.app, selectableTargets, defaultTarget?.vaultPath);
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
        new import_obsidian5.Notice(`No matching target found for: ${unmatchedQuery}`, 6e3);
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
    notice = new import_obsidian5.Notice(fragment, 1e4);
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
      new import_obsidian5.Notice("Vault root cannot be published. Select a subdirectory.");
      return;
    }
    const vaultBasePath = this.getVaultBasePath();
    if (!vaultBasePath) {
      new import_obsidian5.Notice("Could not resolve the vault base path.");
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
      new import_obsidian5.Notice("Selected path is outside the vault. Aborting.");
      return;
    }
    const existingRecord = this.configStore.findTarget("directory", vaultPath);
    const visibility = await this.resolveVisibility(existingRecord);
    if (!visibility) {
      return;
    }
    const folderName = folderNameFromVaultPath(vaultPath);
    const baseRepoName = sanitizeRepoName(existingRecord?.repoName ?? folderName);
    const repoState = await this.gitService.detectRepoState(targetPath);
    if (repoState.hasOrigin && repoState.originUrl && !repoState.isGitHubOrigin) {
      new import_obsidian5.Notice("This directory uses a non-GitHub origin. v1 supports GitHub remotes only.", 1e4);
      return;
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (!repoState.hasLocalGit || !repoState.hasOrigin) {
      new import_obsidian5.Notice(`Connecting directory ${vaultPath} to GitHub...`, 5e3);
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
      this.showPublishedRepoNotice(`Published ${vaultPath} ->`, repoUrl2, suffix, true);
      return;
    }
    new import_obsidian5.Notice(`Pushing directory repo ${vaultPath}...`, 5e3);
    const pushResult = await this.gitService.pushDirectory(targetPath, folderName);
    if (pushResult.status === "failed") {
      new import_obsidian5.Notice(pushResult.error ?? "Push failed.", 12e3);
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
      new import_obsidian5.Notice("Already up to date.");
      return;
    }
    const repoUrl = this.getRepoWebUrl(repoName, repoState.originUrl ?? null);
    new import_obsidian5.Notice(`Pushed ${pushResult.changedCount ?? 0} changes to ${repoUrl}`, 8e3);
  }
  async publishFileTarget(vaultPath, vaultBasePath) {
    const sourceFile = this.app.vault.getAbstractFileByPath(vaultPath);
    if (!(sourceFile instanceof import_obsidian5.TFile)) {
      new import_obsidian5.Notice(`File not found: ${vaultPath}`);
      return;
    }
    const existingRecord = this.configStore.findTarget("file", vaultPath);
    const visibility = await this.resolveVisibility(existingRecord);
    if (!visibility) {
      return;
    }
    const sourceAbsolutePath = absolutePathForVaultPath(vaultBasePath, vaultPath);
    const mirrorPath = existingRecord?.mirrorPath ?? this.buildMirrorRelativePath(vaultPath);
    const mirrorFileName = existingRecord?.mirrorFileName ?? import_node_path3.default.posix.basename(vaultPath);
    const mirrorAbsolutePath = absolutePathForVaultPath(vaultBasePath, mirrorPath);
    if (!ensureInsideVault(vaultBasePath, sourceAbsolutePath) || !ensureInsideVault(vaultBasePath, mirrorAbsolutePath)) {
      new import_obsidian5.Notice("File publish path resolved outside vault. Aborting.");
      return;
    }
    const fileStem = fileStemFromVaultPath(vaultPath);
    const baseRepoName = sanitizeRepoName(existingRecord?.repoName ?? fileStem);
    await this.gitService.syncSingleFileToRepo(sourceAbsolutePath, mirrorAbsolutePath, mirrorFileName);
    let repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
    if (repoState.hasOrigin && repoState.originUrl && !repoState.isGitHubOrigin) {
      new import_obsidian5.Notice("This file target uses a non-GitHub origin. v1 supports GitHub remotes only.", 12e3);
      return;
    }
    if (!repoState.hasLocalGit) {
      await this.gitService.initRepo(mirrorAbsolutePath);
      repoState = await this.gitService.detectRepoState(mirrorAbsolutePath);
    }
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (!repoState.hasOrigin) {
      new import_obsidian5.Notice(`Connecting file ${vaultPath} to GitHub...`, 5e3);
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
      this.showPublishedRepoNotice(`Published file ${vaultPath} ->`, repoUrl2, suffix, true);
      return;
    }
    new import_obsidian5.Notice(`Pushing file repo ${vaultPath}...`, 5e3);
    const pushResult = await this.gitService.pushDirectory(mirrorAbsolutePath, fileStem);
    if (pushResult.status === "failed") {
      new import_obsidian5.Notice(pushResult.error ?? "File push failed.", 12e3);
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
      new import_obsidian5.Notice(`File repo already up to date: ${vaultPath}`, 6e3);
      return;
    }
    const repoUrl = this.getRepoWebUrl(repoName, repoState.originUrl ?? null);
    new import_obsidian5.Notice(`Pushed ${pushResult.changedCount ?? 0} file changes to ${repoUrl}`, 9e3);
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
      if (!(sourceItem instanceof import_obsidian5.TFile)) {
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
      const sourceAbsolutePath = absolutePathForVaultPath(vaultBasePath, record.vaultPath);
      const mirrorAbsolutePath = absolutePathForVaultPath(vaultBasePath, record.mirrorPath);
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
        await this.gitService.syncSingleFileToRepo(sourceAbsolutePath, mirrorAbsolutePath, record.mirrorFileName);
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
        const pushResult = await this.gitService.pushDirectory(mirrorAbsolutePath, fileStem);
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
      new import_obsidian5.Notice("Could not resolve the vault base path.");
      return;
    }
    new import_obsidian5.Notice("Pushing all repositories...", 5e3);
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
      const existing = this.configStore.findTarget("directory", result.vaultPath);
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
    const summary = this.summarizeResults([...directorySummary.results, ...filePush.results]);
    if (summary.total === 0) {
      new import_obsidian5.Notice("No standalone or managed file repositories found to push.");
      return;
    }
    new import_obsidian5.Notice(
      `Push All complete: ${summary.pushed} pushed, ${summary.upToDate} up to date, ${summary.failed} failed, ${summary.skipped} skipped.`,
      1e4
    );
    const failures = summary.results.filter((result) => result.status === "failed");
    if (failures.length > 0) {
      const details = failures.slice(0, 3).map((failure) => `${failure.targetType}:${failure.vaultPath}: ${failure.error ?? "Unknown error"}`).join(" | ");
      new import_obsidian5.Notice(`Push failures: ${details}`, 12e3);
    }
  }
  showCommandError(error) {
    if (error instanceof GitCommandError) {
      new import_obsidian5.Notice(`${error.command} failed: ${error.displayMessage()}`, 15e3);
      return;
    }
    if (error instanceof Error) {
      new import_obsidian5.Notice(error.message, 12e3);
      return;
    }
    new import_obsidian5.Notice("An unknown error occurred.", 12e3);
  }
};

// main.ts
var main_default = VaultPublisherPlugin;
