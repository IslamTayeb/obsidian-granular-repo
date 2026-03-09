import path from "node:path";

export function normalizeVaultPath(input: string): string {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "").trim();
  return normalized;
}

export function isVaultRoot(vaultPath: string): boolean {
  return normalizeVaultPath(vaultPath).length === 0;
}

export function folderNameFromVaultPath(vaultPath: string): string {
  const normalized = normalizeVaultPath(vaultPath);
  if (!normalized) {
    return "vault";
  }

  return path.posix.basename(normalized);
}

export function fileStemFromVaultPath(vaultPath: string): string {
  const fileName = folderNameFromVaultPath(vaultPath);
  const extension = path.posix.extname(fileName);
  if (!extension) {
    return fileName;
  }

  return fileName.slice(0, -extension.length);
}

export function ensureInsideVault(vaultBasePath: string, absoluteTargetPath: string): boolean {
  const relative = path.relative(vaultBasePath, absoluteTargetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function absolutePathForVaultPath(vaultBasePath: string, vaultPath: string): string {
  return path.resolve(vaultBasePath, normalizeVaultPath(vaultPath));
}
