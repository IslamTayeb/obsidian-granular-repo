export type RepoVisibility = "public" | "private";

export interface PublishedDirRecord {
  vaultPath: string;
  repoName: string;
  remote: "origin";
  visibility: RepoVisibility;
  lastPushed: string;
}

export interface VaultPublisherData {
  publishedDirs: PublishedDirRecord[];
}

export interface RepoState {
  hasLocalGit: boolean;
  hasOrigin: boolean;
  originUrl?: string;
  isGitHubOrigin: boolean;
}

export type PushRepoStatus = "pushed" | "up_to_date" | "skipped" | "failed";

export interface PushRepoResult {
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
