import { absolutePathForVaultPath, normalizeVaultPath } from "../utils/path-utils";
import { parseGitHubRepoSlug } from "../utils/github-url";
import { PublishedTargetRecord, RepoInventoryEntry, RepoState } from "../types";

type RepoStateResolver = (absolutePath: string) => Promise<RepoState>;

export interface BuildRepoInventoryOptions {
  vaultBasePath: string;
  trackedTargets: PublishedTargetRecord[];
  standaloneRepoPaths: string[];
  orphanMirrorPaths: string[];
  resolveRepoState: RepoStateResolver;
}

const SOURCE_KIND_ORDER: Record<RepoInventoryEntry["sourceKind"], number> = {
  "tracked-directory": 0,
  "tracked-file": 1,
  "scanned-directory": 2,
  "orphan-mirror": 3,
};

function buildEntryId(sourceKind: RepoInventoryEntry["sourceKind"], vaultPath: string): string {
  return `${sourceKind}:${normalizeVaultPath(vaultPath)}`;
}

function resolveUnpublishState(
  liveOriginUrl: string | null,
  storedOriginUrl: string | null,
): Pick<RepoInventoryEntry, "githubRepoSlug" | "canUnpublish" | "disabledReason"> {
  const githubRepoSlug =
    (liveOriginUrl ? parseGitHubRepoSlug(liveOriginUrl) : null) ??
    (storedOriginUrl ? parseGitHubRepoSlug(storedOriginUrl) : null);
  if (githubRepoSlug) {
    return {
      githubRepoSlug,
      canUnpublish: true,
    };
  }

  const knownOrigin = liveOriginUrl ?? storedOriginUrl;
  if (knownOrigin) {
    return {
      githubRepoSlug: null,
      canUnpublish: false,
      disabledReason: "Only GitHub remotes can be unpublished.",
    };
  }

  return {
    githubRepoSlug: null,
    canUnpublish: false,
    disabledReason: "No GitHub remote is known for this repo.",
  };
}

async function buildEntry(
  sourceKind: RepoInventoryEntry["sourceKind"],
  target: {
    targetType: RepoInventoryEntry["targetType"];
    vaultPath: string;
    mirrorPath?: string;
    repoName?: string;
    visibility?: RepoInventoryEntry["visibility"];
    storedOriginUrl?: string;
  },
  vaultBasePath: string,
  resolveRepoState: RepoStateResolver,
): Promise<RepoInventoryEntry> {
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
    mirrorPath: target.mirrorPath ? normalizeVaultPath(target.mirrorPath) : undefined,
    repoName: target.repoName,
    visibility: target.visibility,
    localRepoPath,
    localRepoVaultPath,
    liveOriginUrl,
    storedOriginUrl,
    hasLocalGit: repoState.hasLocalGit,
    hasOrigin: repoState.hasOrigin,
    isGitHubOrigin: repoState.isGitHubOrigin,
    ...unpublishState,
  };
}

export async function buildRepoInventory(options: BuildRepoInventoryOptions): Promise<RepoInventoryEntry[]> {
  const trackedDirectoryPaths = new Set<string>();
  const trackedMirrorPaths = new Set<string>();
  const work: Array<Promise<RepoInventoryEntry>> = [];

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
            storedOriginUrl: record.originUrl,
          },
          options.vaultBasePath,
          options.resolveRepoState,
        ),
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
          storedOriginUrl: record.originUrl,
        },
        options.vaultBasePath,
        options.resolveRepoState,
      ),
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
          vaultPath: normalizedRepoPath,
        },
        options.vaultBasePath,
        options.resolveRepoState,
      ),
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
          mirrorPath: normalizedMirrorPath,
        },
        options.vaultBasePath,
        options.resolveRepoState,
      ),
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
