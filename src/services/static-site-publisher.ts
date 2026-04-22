import fsp from "node:fs/promises";
import path from "node:path";

import { StaticSiteHostConfig, StaticSitePublishRecord } from "../types";
import { validatePostFrontmatter } from "../utils/frontmatter";
import { GitCommandError, GitService } from "./git-service";
import { renderMarkdown } from "./markdown-renderer";
import {
  renderPost,
  resolvePostRelativePath,
  TemplateRenderError,
} from "./static-site-renderer";

export interface StaticSitePublishInput {
  host: StaticSiteHostConfig;
  frontmatter: unknown; // raw record from Obsidian metadataCache
  markdownBody: string;
  vaultPath: string;
  previousRecord?: StaticSitePublishRecord;
}

export interface StaticSitePublishResult {
  status: "published" | "unchanged";
  slug: string;
  postAbsolutePath: string;
  postRelativePath: string;
  postRelativePathFromRepo: string;
  removedPreviousSlug: string | null;
  commitSha: string | null;
  warnings: string[];
  publicUrl: string | null;
  branch: string;
}

export interface StaticSiteUnpublishInput {
  host: StaticSiteHostConfig;
  record: StaticSitePublishRecord;
}

export interface StaticSiteUnpublishResult {
  status: "unpublished" | "not_found";
  removedPath: string;
  commitSha: string | null;
  branch: string;
}

export class StaticSitePublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaticSitePublishError";
  }
}

function joinRelativePosix(...segments: string[]): string {
  return segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter((segment) => segment.length > 0)
    .join("/");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fsp.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(targetPath: string): Promise<string | null> {
  try {
    return await fsp.readFile(targetPath, "utf8");
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeFileAtomic(
  targetPath: string,
  content: string,
): Promise<void> {
  const directory = path.dirname(targetPath);
  await fsp.mkdir(directory, { recursive: true });
  const tempPath = `${targetPath}.tmp-${Date.now()}`;
  await fsp.writeFile(tempPath, content, "utf8");
  await fsp.rename(tempPath, targetPath);
}

async function removePostAndPruneParent(
  postAbsolutePath: string,
  postParentDir: string,
): Promise<boolean> {
  const existed = await pathExists(postAbsolutePath);
  if (existed) {
    await fsp.rm(postAbsolutePath, { force: true });
  }

  try {
    const remaining = await fsp.readdir(postParentDir);
    if (remaining.length === 0) {
      await fsp.rmdir(postParentDir);
    }
  } catch {
    // ignore; directory cleanup is best-effort
  }

  return existed;
}

export class StaticSitePublisher {
  private readonly gitService: GitService;

  constructor(gitService: GitService) {
    this.gitService = gitService;
  }

  async ensurePrerequisites(host: StaticSiteHostConfig): Promise<void> {
    if (!host.repoRoot) {
      throw new StaticSitePublishError("Host has no repoRoot configured.");
    }

    if (!(await pathExists(host.repoRoot))) {
      throw new StaticSitePublishError(
        `repoRoot does not exist: ${host.repoRoot}`,
      );
    }

    if (!(await this.gitService.isGitWorktree(host.repoRoot))) {
      throw new StaticSitePublishError(
        `repoRoot is not a git worktree: ${host.repoRoot}`,
      );
    }

    const templatePath = path.join(
      host.repoRoot,
      host.siteSubdir,
      host.templateRelPath,
    );
    if (!(await pathExists(templatePath))) {
      throw new StaticSitePublishError(
        `Template not found at ${templatePath}. Check the host's site subdirectory and template path.`,
      );
    }
  }

  async publish(
    input: StaticSitePublishInput,
  ): Promise<StaticSitePublishResult> {
    const { host, frontmatter, markdownBody, vaultPath, previousRecord } =
      input;

    await this.ensurePrerequisites(host);

    const validation = validatePostFrontmatter(frontmatter);
    if (!validation.ok) {
      const details = validation.errors
        .map((error) => `${error.field}: ${error.message}`)
        .join("; ");
      throw new StaticSitePublishError(`Frontmatter invalid — ${details}`);
    }

    const post = validation.value;
    const templatePath = path.join(
      host.repoRoot,
      host.siteSubdir,
      host.templateRelPath,
    );
    const templateText = await fsp.readFile(templatePath, "utf8");

    const { html: bodyHtml, warnings } = renderMarkdown(markdownBody);

    let rendered: string;
    try {
      const result = renderPost({
        host,
        templateText,
        title: post.title,
        slug: post.slug,
        description: post.description,
        date: post.date,
        bodyHtml,
      });
      rendered = result.html;
    } catch (error: unknown) {
      if (error instanceof TemplateRenderError) {
        throw new StaticSitePublishError(error.message);
      }
      throw error;
    }

    const postRelativePath = resolvePostRelativePath(host, post.slug);
    const postRelativePathFromRepo = joinRelativePosix(
      host.siteSubdir,
      postRelativePath,
    );
    const postAbsolutePath = path.join(host.repoRoot, postRelativePathFromRepo);
    const postParentDir = path.dirname(postAbsolutePath);

    const repoRelativeBefore = postRelativePathFromRepo;
    const pathsToStage: string[] = [repoRelativeBefore];
    let removedPreviousSlug: string | null = null;

    // Rename support: if slug changed, delete the old post.
    if (
      previousRecord &&
      previousRecord.slug &&
      previousRecord.slug !== post.slug
    ) {
      const oldPostRelativePath = resolvePostRelativePath(
        host,
        previousRecord.slug,
      );
      const oldRepoRelative = joinRelativePosix(
        host.siteSubdir,
        oldPostRelativePath,
      );
      const oldAbsolute = path.join(host.repoRoot, oldRepoRelative);
      const oldParentDir = path.dirname(oldAbsolute);
      const deleted = await removePostAndPruneParent(oldAbsolute, oldParentDir);
      if (deleted) {
        removedPreviousSlug = previousRecord.slug;
        pathsToStage.push(oldRepoRelative);
      }
    }

    const existingContent = await readFileIfExists(postAbsolutePath);
    const unchanged =
      existingContent === rendered && removedPreviousSlug === null;

    if (!unchanged) {
      await writeFileAtomic(postAbsolutePath, rendered);
    }

    await this.gitService.stagePathsInRepo(host.repoRoot, pathsToStage);
    const stagedFiles = await this.gitService.getStagedFilesFiltered(
      host.repoRoot,
      pathsToStage,
    );

    const branch =
      host.branch ??
      (await this.gitService.getCurrentBranch(host.repoRoot)) ??
      "";
    if (!branch) {
      throw new StaticSitePublishError(
        "Could not resolve current branch for push. Is HEAD detached?",
      );
    }

    const publicUrl = host.publicBaseUrl
      ? `${host.publicBaseUrl.replace(/\/+$/, "")}/${post.slug}/`
      : null;

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
        branch,
      };
    }

    const message = this.renderCommitMessage(host.commitMessagePublish, {
      slug: post.slug,
      title: post.title,
      vaultPath,
    });

    try {
      await this.gitService.commitInRepo(host.repoRoot, message);
    } catch (error: unknown) {
      const commandError =
        error instanceof GitCommandError
          ? error
          : new GitCommandError({
              command: "git",
              args: ["commit"],
              cwd: host.repoRoot,
              message: (error as Error).message,
            });

      const output =
        `${commandError.stderr}\n${commandError.stdout}`.toLowerCase();
      if (!output.includes("nothing to commit")) {
        throw new StaticSitePublishError(
          `git commit failed: ${commandError.displayMessage()}`,
        );
      }
    }

    try {
      await this.gitService.pushCurrentBranchInRepo(
        host.repoRoot,
        host.remote,
        host.branch,
      );
    } catch (error: unknown) {
      const commandError =
        error instanceof GitCommandError
          ? error
          : new GitCommandError({
              command: "git",
              args: ["push"],
              cwd: host.repoRoot,
              message: (error as Error).message,
            });
      throw new StaticSitePublishError(
        `git push failed: ${commandError.displayMessage()}. If this is a non-fast-forward error, run 'git pull --rebase' in ${host.repoRoot} and retry.`,
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
      branch,
    };
  }

  async unpublish(
    input: StaticSiteUnpublishInput,
  ): Promise<StaticSiteUnpublishResult> {
    const { host, record } = input;

    await this.ensurePrerequisites(host);

    const postRelativePath = resolvePostRelativePath(host, record.slug);
    const postRelativePathFromRepo = joinRelativePosix(
      host.siteSubdir,
      postRelativePath,
    );
    const postAbsolutePath = path.join(host.repoRoot, postRelativePathFromRepo);
    const postParentDir = path.dirname(postAbsolutePath);

    const existed = await removePostAndPruneParent(
      postAbsolutePath,
      postParentDir,
    );

    const branch =
      host.branch ??
      (await this.gitService.getCurrentBranch(host.repoRoot)) ??
      "";
    if (!branch) {
      throw new StaticSitePublishError(
        "Could not resolve current branch for push. Is HEAD detached?",
      );
    }

    if (!existed) {
      return {
        status: "not_found",
        removedPath: postRelativePathFromRepo,
        commitSha: await this.gitService.getHeadSha(host.repoRoot),
        branch,
      };
    }

    await this.gitService.stagePathsInRepo(host.repoRoot, [
      postRelativePathFromRepo,
    ]);
    const stagedFiles = await this.gitService.getStagedFilesFiltered(
      host.repoRoot,
      [postRelativePathFromRepo],
    );

    if (stagedFiles.length > 0) {
      const message = this.renderCommitMessage(host.commitMessageUnpublish, {
        slug: record.slug,
        title: record.slug,
        vaultPath: record.vaultPath,
      });

      try {
        await this.gitService.commitInRepo(host.repoRoot, message);
      } catch (error: unknown) {
        const commandError =
          error instanceof GitCommandError
            ? error
            : new GitCommandError({
                command: "git",
                args: ["commit"],
                cwd: host.repoRoot,
                message: (error as Error).message,
              });
        const output =
          `${commandError.stderr}\n${commandError.stdout}`.toLowerCase();
        if (!output.includes("nothing to commit")) {
          throw new StaticSitePublishError(
            `git commit failed: ${commandError.displayMessage()}`,
          );
        }
      }

      try {
        await this.gitService.pushCurrentBranchInRepo(
          host.repoRoot,
          host.remote,
          host.branch,
        );
      } catch (error: unknown) {
        const commandError =
          error instanceof GitCommandError
            ? error
            : new GitCommandError({
                command: "git",
                args: ["push"],
                cwd: host.repoRoot,
                message: (error as Error).message,
              });
        throw new StaticSitePublishError(
          `git push failed: ${commandError.displayMessage()}`,
        );
      }
    }

    return {
      status: "unpublished",
      removedPath: postRelativePathFromRepo,
      commitSha: await this.gitService.getHeadSha(host.repoRoot),
      branch,
    };
  }

  private renderCommitMessage(
    template: string,
    values: { slug: string; title: string; vaultPath: string },
  ): string {
    const base =
      template && template.length > 0 ? template : "static-site: update {slug}";
    return base
      .replace(/\{slug\}/g, values.slug)
      .replace(/\{title\}/g, values.title)
      .replace(/\{vaultPath\}/g, values.vaultPath);
  }
}
