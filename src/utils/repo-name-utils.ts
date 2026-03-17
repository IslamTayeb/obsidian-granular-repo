import { parseGitHubRepoSlug } from "./github-url";

export function sanitizeRepoName(input: string): string {
  const sanitized = input
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  return sanitized || "vault-publisher";
}

export function repoNameCandidates(baseName: string, maxAttempts = 50): string[] {
  if (maxAttempts < 1) {
    return [];
  }

  const candidates: string[] = [];
  for (let index = 0; index < maxAttempts; index += 1) {
    if (index === 0) {
      candidates.push(baseName);
    } else {
      candidates.push(`${baseName}-${index + 1}`);
    }
  }

  return candidates;
}

export function parseRepoNameFromOrigin(originUrl: string): string | null {
  const slug = parseGitHubRepoSlug(originUrl);
  if (!slug) {
    return null;
  }

  const segments = slug.split("/");
  return segments[1] ?? null;
}
