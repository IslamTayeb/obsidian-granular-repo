import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ExecRunner, GitService } from "../src/services/git-service";

function commandKey(command: string, args: string[]): string {
  return `${command} ${args.join(" ")}`;
}

describe("GitService", () => {
  it("returns prerequisite error when git is missing", async () => {
    const runner: ExecRunner = async (command) => {
      if (command === "git") {
        throw {
          message: "spawn git ENOENT",
          code: "ENOENT",
        };
      }

      return { stdout: "", stderr: "" };
    };

    const service = new GitService(runner);
    const status = await service.checkPrerequisites();

    expect(status.ok).toBe(false);
    expect(status.message).toBe("Git not found. Please install git.");
  });

  it("auto-suffixes repo name when initial name is taken", async () => {
    const runner = vi.fn<ExecRunner>(async (command, args) => {
      if (command === "gh" && args[0] === "repo" && args[1] === "create" && args[2] === "blog") {
        throw {
          message: "repo already exists",
          stderr: "name already exists on this account",
          stdout: "",
          code: 1,
        };
      }

      return { stdout: "", stderr: "" };
    });

    const service = new GitService(runner);
    const name = await service.createRepoWithAutoName("/tmp/repo", "blog", "public", 3);

    expect(name).toBe("blog-2");
    const attempted = runner.mock.calls
      .filter(([command, args]) => command === "gh" && args[0] === "repo" && args[1] === "create")
      .map(([, args]) => args[2]);
    expect(attempted).toEqual(["blog", "blog-2"]);
  });

  it("recovers when gh creates repo but cannot attach origin", async () => {
    const runner = vi.fn<ExecRunner>(async (command, args) => {
      const key = commandKey(command, args);
      if (key === "gh repo create blog --private --source=. --push") {
        throw {
          message: "remote attach failed",
          stderr: "Unable to add remote \"origin\"",
          stdout: "https://github.com/IslamTayeb/blog",
          code: 1,
        };
      }
      if (key === "gh api user --jq .login") {
        return { stdout: "IslamTayeb\n", stderr: "" };
      }
      if (key === "gh repo view IslamTayeb/blog") {
        return { stdout: "", stderr: "" };
      }
      if (key === "git remote get-url origin") {
        throw {
          message: "missing origin",
          stderr: "No such remote",
          stdout: "",
          code: 2,
        };
      }
      if (key === "git rev-parse --verify HEAD") {
        return { stdout: "abc123\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    const service = new GitService(runner);
    const name = await service.createRepoWithAutoName("/tmp/repo", "blog", "private", 1);

    expect(name).toBe("blog");
    expect(
      runner.mock.calls.some(
        ([command, args]) =>
          command === "git" &&
          args[0] === "remote" &&
          args[1] === "add" &&
          args[2] === "origin" &&
          args[3] === "https://github.com/IslamTayeb/blog.git",
      ),
    ).toBe(true);
  });

  it("returns up_to_date when there are no staged files", async () => {
    const runner: ExecRunner = async (command, args) => {
      if (commandKey(command, args) === "git diff --cached --name-only") {
        return { stdout: "", stderr: "" };
      }

      return { stdout: "", stderr: "" };
    };

    const service = new GitService(runner);
    const result = await service.pushDirectory("/tmp/repo", "blog");

    expect(result.status).toBe("up_to_date");
  });

  it("falls back to setting upstream when git push has no upstream branch", async () => {
    const runner = vi.fn<ExecRunner>(async (command, args) => {
      if (commandKey(command, args) === "git diff --cached --name-only") {
        return { stdout: "a.md\nb.md\n", stderr: "" };
      }

      if (commandKey(command, args) === "git push") {
        throw {
          message: "no upstream branch",
          stderr: "fatal: The current branch has no upstream branch.",
          stdout: "",
          code: 1,
        };
      }

      return { stdout: "", stderr: "" };
    });

    const service = new GitService(runner);
    const result = await service.pushDirectory("/tmp/repo", "blog");

    expect(result.status).toBe("pushed");
    expect(result.changedCount).toBe(2);

    const pushCommands = runner.mock.calls
      .filter(([command, args]) => command === "git" && args[0] === "push")
      .map(([, args]) => args.join(" "));

    expect(pushCommands).toContain("push");
    expect(pushCommands).toContain("push -u origin HEAD");
  });

  it("finds standalone repositories and skips submodule-like .git files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vault-publisher-test-"));

    try {
      await fs.mkdir(path.join(tempRoot, "alpha", ".git"), { recursive: true });
      await fs.mkdir(path.join(tempRoot, "beta", "nested", ".git"), { recursive: true });
      await fs.mkdir(path.join(tempRoot, "submodule-like"), { recursive: true });
      await fs.writeFile(path.join(tempRoot, "submodule-like", ".git"), "gitdir: ../.git/modules/submodule-like");

      const service = new GitService(async () => ({ stdout: "", stderr: "" }));
      const repos = await service.findStandaloneRepos(tempRoot);

      expect(repos).toEqual(["alpha", "beta/nested"]);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("syncs single file mirrors and removes stale files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vault-publisher-sync-"));

    try {
      const sourceFile = path.join(tempRoot, "source.md");
      const mirrorDir = path.join(tempRoot, "mirror");
      await fs.mkdir(path.join(mirrorDir, ".git"), { recursive: true });
      await fs.writeFile(path.join(mirrorDir, "old.md"), "old");
      await fs.mkdir(path.join(mirrorDir, "stale"), { recursive: true });
      await fs.writeFile(path.join(mirrorDir, "stale", "x.txt"), "x");
      await fs.writeFile(sourceFile, "hello");

      const service = new GitService(async () => ({ stdout: "", stderr: "" }));
      await service.syncSingleFileToRepo(sourceFile, mirrorDir, "target.md");

      await expect(fs.readFile(path.join(mirrorDir, "target.md"), "utf8")).resolves.toBe("hello");
      await expect(fs.stat(path.join(mirrorDir, ".git"))).resolves.toBeTruthy();
      await expect(fs.stat(path.join(mirrorDir, "old.md"))).rejects.toThrow();
      await expect(fs.stat(path.join(mirrorDir, "stale"))).rejects.toThrow();
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("removes only the .git directory during local repo cleanup", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vault-publisher-cleanup-"));

    try {
      const repoDir = path.join(tempRoot, "alpha");
      await fs.mkdir(path.join(repoDir, ".git"), { recursive: true });
      await fs.writeFile(path.join(repoDir, "note.md"), "hello");

      const service = new GitService(async () => ({ stdout: "", stderr: "" }));
      await service.removeGitDirectory(repoDir);

      await expect(fs.readFile(path.join(repoDir, "note.md"), "utf8")).resolves.toBe("hello");
      await expect(fs.stat(path.join(repoDir, ".git"))).rejects.toThrow();
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("treats missing GitHub repos as already deleted", async () => {
    const runner: ExecRunner = async (command, args) => {
      if (commandKey(command, args) === "gh repo delete user/blog --yes") {
        throw {
          message: "missing repo",
          stderr: "GraphQL: Could not resolve to a Repository with the name 'user/blog'.",
          stdout: "",
          code: 1,
        };
      }

      return { stdout: "", stderr: "" };
    };

    const service = new GitService(runner);
    const result = await service.deleteGitHubRepo("user/blog");

    expect(result.status).toBe("not_found");
  });

  it("finds mirror repos inside the plugin mirror root", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vault-publisher-mirrors-"));

    try {
      const mirrorRoot = path.join(tempRoot, ".obsidian", "plugins", "vault-publisher", "mirrors");
      await fs.mkdir(path.join(mirrorRoot, "idea-abc12345", ".git"), { recursive: true });
      await fs.mkdir(path.join(mirrorRoot, "nested", "draft-def67890", ".git"), { recursive: true });

      const service = new GitService(async () => ({ stdout: "", stderr: "" }));
      const mirrors = await service.findMirrorRepos(tempRoot, ".obsidian/plugins/vault-publisher/mirrors");

      expect(mirrors).toEqual([
        ".obsidian/plugins/vault-publisher/mirrors/idea-abc12345",
        ".obsidian/plugins/vault-publisher/mirrors/nested/draft-def67890",
      ]);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("push-all continues when one repo fails", async () => {
    const service = new GitService(async () => ({ stdout: "", stderr: "" }));

    vi.spyOn(service, "findStandaloneRepos").mockResolvedValue(["alpha", "beta"]);
    vi.spyOn(service, "detectRepoState").mockImplementation(async (targetDir) => {
      if (targetDir.endsWith("alpha")) {
        return {
          hasLocalGit: true,
          hasOrigin: true,
          originUrl: "https://github.com/user/alpha.git",
          isGitHubOrigin: true,
        };
      }

      return {
        hasLocalGit: true,
        hasOrigin: true,
        originUrl: "https://github.com/user/beta.git",
        isGitHubOrigin: true,
      };
    });

    vi.spyOn(service, "pushDirectory").mockImplementation(async (targetDir) => {
      if (targetDir.endsWith("alpha")) {
        return {
          status: "failed",
          error: "network error",
        };
      }

      return {
        status: "pushed",
        changedCount: 1,
      };
    });

    const summary = await service.pushAllRepos("/vault");

    expect(summary.total).toBe(2);
    expect(summary.pushed).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it("push-all auto-links repos with no origin to GitHub", async () => {
    const service = new GitService(async () => ({ stdout: "", stderr: "" }));

    vi.spyOn(service, "findStandaloneRepos").mockResolvedValue(["alpha"]);
    vi.spyOn(service, "detectRepoState").mockResolvedValue({
      hasLocalGit: true,
      hasOrigin: false,
      isGitHubOrigin: false,
    });
    vi.spyOn(service, "linkLocalRepoWithoutOrigin").mockResolvedValue({
      repoName: "alpha",
      originUrl: "https://github.com/user/alpha.git",
      pushed: true,
    });

    const summary = await service.pushAllRepos("/vault");

    expect(summary.total).toBe(1);
    expect(summary.pushed).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.results[0].originUrl).toBe("https://github.com/user/alpha.git");
  });

  it("links local repo without origin even when no commits exist", async () => {
    const runner = vi.fn<ExecRunner>(async (command, args) => {
      const key = commandKey(command, args);
      if (key === "git diff --cached --name-only") {
        return { stdout: "", stderr: "" };
      }
      if (key === "gh repo create alpha --private --source=. --push") {
        throw {
          message: "no commits",
          stderr: "failed to run git: ambiguous argument 'HEAD'",
          stdout: "",
          code: 1,
        };
      }
      if (key === "gh repo create alpha --private --source=. --remote=origin") {
        return { stdout: "", stderr: "" };
      }
      if (key === "git rev-parse --verify HEAD") {
        throw {
          message: "no commits",
          stderr: "fatal: Needed a single revision",
          stdout: "",
          code: 128,
        };
      }
      if (key === "git remote get-url origin") {
        return { stdout: "https://github.com/user/alpha.git\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    const service = new GitService(runner);
    const linked = await service.linkLocalRepoWithoutOrigin("/tmp/repo", "alpha", "alpha", "private");

    expect(linked.repoName).toBe("alpha");
    expect(linked.pushed).toBe(false);
    expect(linked.originUrl).toBe("https://github.com/user/alpha.git");
  });
});
