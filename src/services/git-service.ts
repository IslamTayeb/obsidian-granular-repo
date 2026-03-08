import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { PrerequisiteStatus, PushAllSummary, PushRepoResult, RepoState, RepoVisibility } from "../types";
import { buildCommitMessage } from "../utils/commit-message";
import { isGitHubOrigin } from "../utils/github-url";
import { repoNameCandidates } from "../utils/repo-name-utils";

const execFileAsync = promisify(execFile);

const GITIGNORE_DEFAULTS = ".obsidian/\n.trash/\n.DS_Store\nThumbs.db\n";

type RunnerOptions = {
  cwd?: string;
};

type RunnerResult = {
  stdout: string;
  stderr: string;
};

export type ExecRunner = (
  command: string,
  args: string[],
  options?: RunnerOptions,
) => Promise<RunnerResult>;

export class GitCommandError extends Error {
  readonly command: string;
  readonly args: string[];
  readonly cwd?: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
  readonly systemCode?: string;

  constructor(params: {
    command: string;
    args: string[];
    cwd?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    systemCode?: string;
    message?: string;
  }) {
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

  displayMessage(): string {
    const preferred = this.stderr.trim() || this.stdout.trim() || this.message;
    return preferred;
  }
}

function normalizeOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }

  return "";
}

function errorFromUnknown(
  error: unknown,
  command: string,
  args: string[],
  cwd?: string,
): GitCommandError {
  if (error instanceof GitCommandError) {
    return error;
  }

  const candidate = error as {
    message?: string;
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    code?: number | string;
  };

  const numericCode = typeof candidate.code === "number" ? candidate.code : null;
  const systemCode = typeof candidate.code === "string" ? candidate.code : undefined;

  return new GitCommandError({
    command,
    args,
    cwd,
    stdout: normalizeOutput(candidate.stdout),
    stderr: normalizeOutput(candidate.stderr),
    exitCode: numericCode,
    systemCode,
    message: candidate.message,
  });
}

const defaultRunner: ExecRunner = async (command, args, options) => {
  const result = await execFileAsync(command, args, {
    cwd: options?.cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf8",
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

function isRepoNameTakenError(error: GitCommandError): boolean {
  const output = `${error.stderr}\n${error.stdout}`.toLowerCase();
  return (
    output.includes("already exists on this account") ||
    output.includes("name already exists") ||
    output.includes("already exists")
  );
}

function isNoUpstreamPushError(error: GitCommandError): boolean {
  const output = `${error.stderr}\n${error.stdout}`.toLowerCase();
  return output.includes("no upstream branch") || output.includes("set-upstream");
}

export class GitService {
  private readonly runner: ExecRunner;

  constructor(runner: ExecRunner = defaultRunner) {
    this.runner = runner;
  }

  private async run(command: string, args: string[], cwd?: string): Promise<RunnerResult> {
    try {
      return await this.runner(command, args, { cwd });
    } catch (error: unknown) {
      throw errorFromUnknown(error, command, args, cwd);
    }
  }

  async checkPrerequisites(): Promise<PrerequisiteStatus> {
    try {
      await this.run("git", ["--version"]);
    } catch (error: unknown) {
      const commandError = errorFromUnknown(error, "git", ["--version"]);
      if (commandError.systemCode === "ENOENT") {
        return {
          ok: false,
          message: "Git not found. Please install git.",
        };
      }

      return {
        ok: false,
        message: commandError.displayMessage(),
      };
    }

    try {
      await this.run("gh", ["--version"]);
      await this.run("gh", ["auth", "status"]);
    } catch (error: unknown) {
      const commandError = errorFromUnknown(error, "gh", ["auth", "status"]);
      if (commandError.systemCode === "ENOENT") {
        return {
          ok: false,
          message:
            "GitHub CLI (gh) not found or not authenticated. Run `gh auth login` in your terminal.",
        };
      }

      return {
        ok: false,
        message:
          "GitHub CLI (gh) not found or not authenticated. Run `gh auth login` in your terminal.",
      };
    }

    return {
      ok: true,
    };
  }

  async detectRepoState(targetDir: string): Promise<RepoState> {
    const gitDir = path.join(targetDir, ".git");
    let hasLocalGit = false;

    try {
      const gitStat = await fsp.stat(gitDir);
      hasLocalGit = gitStat.isDirectory();
    } catch {
      hasLocalGit = false;
    }

    if (!hasLocalGit) {
      return {
        hasLocalGit: false,
        hasOrigin: false,
        isGitHubOrigin: false,
      };
    }

    try {
      const result = await this.run("git", ["remote", "get-url", "origin"], targetDir);
      const originUrl = result.stdout.trim();

      if (!originUrl) {
        return {
          hasLocalGit: true,
          hasOrigin: false,
          isGitHubOrigin: false,
        };
      }

      return {
        hasLocalGit: true,
        hasOrigin: true,
        originUrl,
        isGitHubOrigin: isGitHubOrigin(originUrl),
      };
    } catch {
      return {
        hasLocalGit: true,
        hasOrigin: false,
        isGitHubOrigin: false,
      };
    }
  }

  async ensureGitignore(targetDir: string): Promise<void> {
    const gitignorePath = path.join(targetDir, ".gitignore");

    if (fs.existsSync(gitignorePath)) {
      return;
    }

    await fsp.writeFile(gitignorePath, GITIGNORE_DEFAULTS, "utf8");
  }

  async initRepo(targetDir: string): Promise<void> {
    await this.run("git", ["init"], targetDir);
  }

  async createGitHubRepo(targetDir: string, repoName: string, visibility: RepoVisibility): Promise<void> {
    const visibilityFlag = visibility === "public" ? "--public" : "--private";
    await this.run(
      "gh",
      ["repo", "create", repoName, visibilityFlag, "--source=.", "--push"],
      targetDir,
    );
  }

  async createRepoWithAutoName(
    targetDir: string,
    baseRepoName: string,
    visibility: RepoVisibility,
    maxAttempts = 50,
  ): Promise<string> {
    const candidates = repoNameCandidates(baseRepoName, maxAttempts);

    for (const candidate of candidates) {
      try {
        await this.createGitHubRepo(targetDir, candidate, visibility);
        return candidate;
      } catch (error: unknown) {
        const commandError = errorFromUnknown(error, "gh", ["repo", "create"], targetDir);
        if (isRepoNameTakenError(commandError)) {
          continue;
        }

        throw commandError;
      }
    }

    throw new Error(
      `Could not create a unique repository name after ${maxAttempts} attempts starting from "${baseRepoName}".`,
    );
  }

  async stageAll(targetDir: string): Promise<void> {
    await this.run("git", ["add", "."], targetDir);
  }

  async getStagedFiles(targetDir: string): Promise<string[]> {
    const result = await this.run("git", ["diff", "--cached", "--name-only"], targetDir);
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  async commit(targetDir: string, message: string): Promise<void> {
    await this.run("git", ["commit", "-m", message], targetDir);
  }

  async push(targetDir: string): Promise<void> {
    try {
      await this.run("git", ["push"], targetDir);
    } catch (error: unknown) {
      const commandError = errorFromUnknown(error, "git", ["push"], targetDir);
      if (isNoUpstreamPushError(commandError)) {
        await this.run("git", ["push", "-u", "origin", "HEAD"], targetDir);
        return;
      }

      throw commandError;
    }
  }

  async getOriginUrl(targetDir: string): Promise<string | null> {
    try {
      const result = await this.run("git", ["remote", "get-url", "origin"], targetDir);
      const originUrl = result.stdout.trim();
      return originUrl.length > 0 ? originUrl : null;
    } catch {
      return null;
    }
  }

  async pushDirectory(targetDir: string, folderName: string): Promise<Omit<PushRepoResult, "vaultPath">> {
    try {
      await this.stageAll(targetDir);
      const stagedFiles = await this.getStagedFiles(targetDir);

      if (stagedFiles.length === 0) {
        return {
          status: "up_to_date",
          changedCount: 0,
        };
      }

      await this.commit(targetDir, buildCommitMessage(folderName));
      await this.push(targetDir);

      return {
        status: "pushed",
        changedCount: stagedFiles.length,
      };
    } catch (error: unknown) {
      const commandError = errorFromUnknown(error, "git", ["commit"], targetDir);
      const output = commandError.displayMessage().toLowerCase();
      if (output.includes("nothing to commit")) {
        return {
          status: "up_to_date",
          changedCount: 0,
        };
      }

      return {
        status: "failed",
        error: commandError.displayMessage(),
      };
    }
  }

  async findStandaloneRepos(vaultBasePath: string): Promise<string[]> {
    const repositories = new Set<string>();

    const walk = async (currentPath: string, relativePath: string): Promise<void> => {
      let entries: fs.Dirent[];

      try {
        entries = await fsp.readdir(currentPath, { withFileTypes: true });
      } catch {
        return;
      }

      const hasLocalGitDir = entries.some((entry) => entry.isDirectory() && entry.name === ".git");
      if (relativePath && hasLocalGitDir) {
        repositories.add(relativePath);
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        if (entry.isSymbolicLink()) {
          continue;
        }

        if (entry.name === ".git" || entry.name === ".obsidian" || entry.name === "node_modules") {
          continue;
        }

        const childRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        const childAbsolutePath = path.join(currentPath, entry.name);
        await walk(childAbsolutePath, childRelativePath);
      }
    };

    await walk(vaultBasePath, "");
    return [...repositories].sort((left, right) => left.localeCompare(right));
  }

  async pushAllRepos(vaultBasePath: string): Promise<PushAllSummary> {
    const repoPaths = await this.findStandaloneRepos(vaultBasePath);
    const results: PushRepoResult[] = [];

    for (const vaultPath of repoPaths) {
      const absolutePath = path.join(vaultBasePath, vaultPath);
      const repoState = await this.detectRepoState(absolutePath);

      if (!repoState.hasOrigin) {
        results.push({
          vaultPath,
          status: "skipped",
          error: "No origin remote configured.",
        });
        continue;
      }

      const folderName = path.posix.basename(vaultPath);
      const result = await this.pushDirectory(absolutePath, folderName);

      results.push({
        ...result,
        vaultPath,
        originUrl: repoState.originUrl,
      });
    }

    const summary: PushAllSummary = {
      total: results.length,
      pushed: results.filter((result) => result.status === "pushed").length,
      upToDate: results.filter((result) => result.status === "up_to_date").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    };

    return summary;
  }
}
