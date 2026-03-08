const GITHUB_PATTERNS = [
  /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
  /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
];

export function isGitHubOrigin(originUrl: string): boolean {
  const trimmed = originUrl.trim();
  return GITHUB_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function originToWebUrl(originUrl: string): string | null {
  const trimmed = originUrl.trim();

  for (const pattern of GITHUB_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const owner = match[1];
      const repo = match[2];
      return `https://github.com/${owner}/${repo}`;
    }
  }

  return null;
}
