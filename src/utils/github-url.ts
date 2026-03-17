function parseRepoPathname(pathname: string): string | null {
  const segments = pathname
    .replace(/^\/+/, "")
    .split("/")
    .filter((segment) => segment.length > 0);

  if (segments.length < 2) {
    return null;
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, "");
  if (!owner || !repo) {
    return null;
  }

  return `${owner}/${repo}`;
}

export function parseGitHubRepoSlug(originUrl: string): string | null {
  const trimmed = originUrl.trim();
  if (!trimmed) {
    return null;
  }

  const scpMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (scpMatch) {
    return `${scpMatch[1]}/${scpMatch[2]}`;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== "github.com") {
      return null;
    }

    if (protocol !== "http:" && protocol !== "https:" && protocol !== "ssh:") {
      return null;
    }

    return parseRepoPathname(parsed.pathname);
  } catch {
    return null;
  }
}

export function isGitHubOrigin(originUrl: string): boolean {
  return parseGitHubRepoSlug(originUrl) !== null;
}

export function originToWebUrl(originUrl: string): string | null {
  const slug = parseGitHubRepoSlug(originUrl);
  if (slug) {
    return `https://github.com/${slug}`;
  }

  return null;
}
