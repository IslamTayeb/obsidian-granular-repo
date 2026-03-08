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
  const trimmed = originUrl.trim();

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (sshMatch) {
    return sshMatch[2];
  }

  const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (httpsMatch) {
    return httpsMatch[2];
  }

  const sshProtocolMatch = trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (sshProtocolMatch) {
    return sshProtocolMatch[2];
  }

  return null;
}
