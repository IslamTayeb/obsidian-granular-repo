import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitService } from "../src/services/git-service";
import { createApmOverflowPreset } from "../src/services/static-site-presets";
import {
  StaticSitePublishError,
  StaticSitePublisher,
} from "../src/services/static-site-publisher";

const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return result.stdout;
}

const APM_TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <title>POST_TITLE | APM Overflow</title>
    <link rel="canonical" href="https://apmoverflow.xyz/POST_SLUG/" />
  </head>
  <body class="post">
    <main>
      <h1>POST_TITLE</h1>
      <p>
        <i><time datetime="YYYY-MM-DDTHH:MMZ">Mon DD, YYYY</time></i>
      </p>
      <p>Article content...</p>
    </main>
  </body>
</html>`;

function createTestHost(repoRoot: string) {
  return {
    ...createApmOverflowPreset(repoRoot),
    id: "test-static-site",
  };
}

describe("StaticSitePublisher (integration)", () => {
  let tempRoot: string;
  let repoRoot: string;
  let remoteDir: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "static-site-pub-"));
    repoRoot = path.join(tempRoot, "repo");
    remoteDir = path.join(tempRoot, "remote.git");

    await fs.mkdir(repoRoot, { recursive: true });
    await fs.mkdir(path.join(repoRoot, "apmoverflow"), { recursive: true });
    await fs.writeFile(
      path.join(repoRoot, "apmoverflow", "_template.html"),
      APM_TEMPLATE,
      "utf8",
    );

    await runGit(repoRoot, ["init", "-b", "main"]);
    await runGit(repoRoot, ["config", "user.email", "test@example.com"]);
    await runGit(repoRoot, ["config", "user.name", "Test"]);
    await runGit(repoRoot, ["add", "--all"]);
    await runGit(repoRoot, ["commit", "-m", "initial"]);

    await execFileAsync("git", ["init", "--bare", remoteDir]);
    await runGit(repoRoot, ["remote", "add", "origin", remoteDir]);
    await runGit(repoRoot, ["push", "-u", "origin", "main"]);
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("writes a post, commits, and pushes only that file", async () => {
    const publisher = new StaticSitePublisher(new GitService());
    const host = createTestHost(repoRoot);

    const result = await publisher.publish({
      host,
      frontmatter: {
        title: "On Closing Doors",
        slug: "on-closing-doors",
        date: "2025-12-18T23:53Z",
        description: "Much of our fears stem from uncertainty.",
      },
      markdownBody: "This is the *body*.",
      vaultPath: "posts/on-closing-doors.md",
    });

    expect(result.status).toBe("published");
    expect(result.slug).toBe("on-closing-doors");

    const written = await fs.readFile(
      path.join(repoRoot, "apmoverflow", "on-closing-doors", "index.html"),
      "utf8",
    );
    expect(written).toContain("<h1>On Closing Doors</h1>");
    expect(written).toContain(
      '<time datetime="2025-12-18T23:53Z">Dec 18, 2025</time>',
    );
    expect(written).toContain("<em>body</em>");

    const log = await runGit(repoRoot, ["log", "--oneline"]);
    expect(log).toContain("apmoverflow: publish on-closing-doors");

    const remoteLog = await runGit(remoteDir, ["log", "--oneline"]);
    expect(remoteLog).toContain("apmoverflow: publish on-closing-doors");
  });

  it("skips the commit when rendered output is unchanged", async () => {
    const publisher = new StaticSitePublisher(new GitService());
    const host = createTestHost(repoRoot);
    const frontmatter = {
      title: "On Closing Doors",
      slug: "on-closing-doors",
      date: "2025-12-18T23:53Z",
      description: "Much of our fears stem from uncertainty.",
    };

    await publisher.publish({
      host,
      frontmatter,
      markdownBody: "Body.",
      vaultPath: "posts/on-closing-doors.md",
    });

    const second = await publisher.publish({
      host,
      frontmatter,
      markdownBody: "Body.",
      vaultPath: "posts/on-closing-doors.md",
    });

    expect(second.status).toBe("unchanged");
    const log = await runGit(repoRoot, ["log", "--oneline"]);
    const publishCommits = log
      .split(/\r?\n/)
      .filter((line) => line.includes("apmoverflow: publish"));
    expect(publishCommits).toHaveLength(1);
  });

  it("removes the old post when slug changes", async () => {
    const publisher = new StaticSitePublisher(new GitService());
    const host = createTestHost(repoRoot);

    await publisher.publish({
      host,
      frontmatter: {
        title: "Old Title",
        slug: "old-slug",
        date: "2026-01-01",
        description: "desc",
      },
      markdownBody: "Body.",
      vaultPath: "posts/old-slug.md",
    });

    const renamed = await publisher.publish({
      host,
      frontmatter: {
        title: "New Title",
        slug: "new-slug",
        date: "2026-01-01",
        description: "desc",
      },
      markdownBody: "Body.",
      vaultPath: "posts/old-slug.md",
      previousRecord: {
        hostId: host.id,
        vaultPath: "posts/old-slug.md",
        slug: "old-slug",
        lastPublished: "2026-01-01T00:00:00Z",
      },
    });

    expect(renamed.status).toBe("published");
    expect(renamed.removedPreviousSlug).toBe("old-slug");

    await expect(
      fs.stat(path.join(repoRoot, "apmoverflow", "old-slug")),
    ).rejects.toThrow();
    await expect(
      fs.readFile(
        path.join(repoRoot, "apmoverflow", "new-slug", "index.html"),
        "utf8",
      ),
    ).resolves.toContain("<h1>New Title</h1>");
  });

  it("unpublishes by deleting the post and pushing the removal", async () => {
    const publisher = new StaticSitePublisher(new GitService());
    const host = createTestHost(repoRoot);

    await publisher.publish({
      host,
      frontmatter: {
        title: "Gone Soon",
        slug: "gone-soon",
        date: "2026-01-01",
        description: "desc",
      },
      markdownBody: "Body.",
      vaultPath: "posts/gone-soon.md",
    });

    const result = await publisher.unpublish({
      host,
      record: {
        hostId: host.id,
        vaultPath: "posts/gone-soon.md",
        slug: "gone-soon",
        lastPublished: "2026-01-01T00:00:00Z",
      },
    });

    expect(result.status).toBe("unpublished");
    await expect(
      fs.stat(path.join(repoRoot, "apmoverflow", "gone-soon")),
    ).rejects.toThrow();

    const log = await runGit(repoRoot, ["log", "--oneline"]);
    expect(log).toContain("apmoverflow: unpublish gone-soon");
  });

  it("rejects frontmatter missing required fields", async () => {
    const publisher = new StaticSitePublisher(new GitService());
    const host = createTestHost(repoRoot);

    await expect(
      publisher.publish({
        host,
        frontmatter: { title: "Only title" },
        markdownBody: "",
        vaultPath: "posts/broken.md",
      }),
    ).rejects.toBeInstanceOf(StaticSitePublishError);
  });

  it("allows the APM Overflow guard for the expected repo on main", async () => {
    await runGit(repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/IslamTayeb/personal-website.git",
    ]);
    const publisher = new StaticSitePublisher(new GitService());
    const host = { ...createApmOverflowPreset(repoRoot), repoRoot };

    await expect(publisher.ensurePrerequisites(host)).resolves.toBeUndefined();
  });

  it("rejects APM Overflow when the remote is not the personal website repo", async () => {
    const publisher = new StaticSitePublisher(new GitService());
    const host = { ...createApmOverflowPreset(repoRoot), repoRoot };

    await expect(publisher.ensurePrerequisites(host)).rejects.toThrow(
      "IslamTayeb/personal-website",
    );
  });

  it("rejects APM Overflow when the local branch is not main", async () => {
    await runGit(repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/IslamTayeb/personal-website.git",
    ]);
    await runGit(repoRoot, ["checkout", "-b", "draft"]);
    const publisher = new StaticSitePublisher(new GitService());
    const host = { ...createApmOverflowPreset(repoRoot), repoRoot };

    await expect(publisher.ensurePrerequisites(host)).rejects.toThrow(
      "local repo is on main",
    );
  });

  it("rejects APM Overflow writes outside the expected post path", async () => {
    await runGit(repoRoot, [
      "remote",
      "set-url",
      "origin",
      "https://github.com/IslamTayeb/personal-website.git",
    ]);
    const publisher = new StaticSitePublisher(new GitService());
    const host = {
      ...createApmOverflowPreset(repoRoot),
      repoRoot,
      postPathTemplate: "posts/{slug}.html",
    };

    await expect(publisher.ensurePrerequisites(host)).rejects.toThrow(
      "apmoverflow/{slug}/index.html",
    );
  });
});
