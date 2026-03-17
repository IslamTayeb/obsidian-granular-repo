export type RepoVisibility = "public" | "private";
export type PublishTargetType = "directory" | "file";

export interface PublishedTargetRecord {
  targetType: PublishTargetType;
  vaultPath: string;
  repoName: string;
  remote: "origin";
  visibility: RepoVisibility;
  lastPushed: string;
  originUrl?: string;
  mirrorPath?: string;
  mirrorFileName?: string;
}

export interface VaultPublisherData {
  publishedTargets: PublishedTargetRecord[];
}

export interface RepoState {
  hasLocalGit: boolean;
  hasOrigin: boolean;
  originUrl?: string;
  isGitHubOrigin: boolean;
}

export type PushRepoStatus = "pushed" | "up_to_date" | "skipped" | "failed";

export interface PushRepoResult {
  targetType: PublishTargetType;
  vaultPath: string;
  status: PushRepoStatus;
  changedCount?: number;
  originUrl?: string;
  error?: string;
}

export interface PushAllSummary {
  total: number;
  pushed: number;
  upToDate: number;
  skipped: number;
  failed: number;
  results: PushRepoResult[];
}

export interface PrerequisiteStatus {
  ok: boolean;
  message?: string;
}

export interface LegacyPublishedDirRecord {
  vaultPath: string;
  repoName: string;
  remote: "origin";
  visibility: RepoVisibility;
  lastPushed: string;
}

export type RepoInventorySourceKind =
  | "tracked-directory"
  | "tracked-file"
  | "scanned-directory"
  | "orphan-mirror";

export interface RepoInventoryEntry {
  id: string;
  sourceKind: RepoInventorySourceKind;
  targetType: PublishTargetType;
  vaultPath: string;
  mirrorPath?: string;
  repoName?: string;
  visibility?: RepoVisibility;
  localRepoPath: string;
  localRepoVaultPath: string;
  liveOriginUrl: string | null;
  storedOriginUrl: string | null;
  githubRepoSlug: string | null;
  hasLocalGit: boolean;
  hasOrigin: boolean;
  isGitHubOrigin: boolean;
  canUnpublish: boolean;
  disabledReason?: string;
}
