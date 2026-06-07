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

export interface StaticSiteTokenMap {
  title: string;
  slug: string;
  description: string;
  dateIso: string;
  dateDisplay: string;
}

export interface StaticSiteHostConfig {
  id: string;
  name: string;
  repoRoot: string;
  siteSubdir: string;
  postPathTemplate: string;
  templateRelPath: string;
  contentMarker: string;
  tokens: StaticSiteTokenMap;
  commitMessagePublish: string;
  commitMessageUnpublish: string;
  remote: string;
  branch?: string;
  publicBaseUrl?: string;
}

export interface StaticSitePublishRecord {
  hostId: string;
  vaultPath: string;
  slug: string;
  lastPublished: string;
  lastCommitSha?: string;
}

export interface GoogleDocsSettings {
  credentialsPath?: string;
  refreshToken?: string;
  docsFolderId?: string;
  mediaFolderId?: string;
}

export type GoogleDocsAssetKind = "image" | "video" | "other";

export interface GoogleDocsAssetRecord {
  vaultPath: string;
  fileId: string;
  name: string;
  mimeType: string;
  checksum: string;
  kind: GoogleDocsAssetKind;
  webViewLink?: string;
  webContentLink?: string;
  lastUploaded: string;
}

export interface GoogleDocsPublishRecord {
  vaultPath: string;
  docId: string;
  docUrl: string;
  assetFolderId: string;
  lastUploaded: string;
  assets: GoogleDocsAssetRecord[];
}

export interface VaultPublisherData {
  publishedTargets: PublishedTargetRecord[];
  staticSiteHosts?: StaticSiteHostConfig[];
  staticSitePublishes?: StaticSitePublishRecord[];
  googleDocs?: GoogleDocsSettings;
  googleDocsPublishes?: GoogleDocsPublishRecord[];
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
