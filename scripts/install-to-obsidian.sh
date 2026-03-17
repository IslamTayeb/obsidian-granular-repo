#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR_DEFAULT="/Users/islamtayeb/Documents/Obsidian Vault/.obsidian/plugins/vault-publisher"
PLUGIN_DIR="${1:-${OBSIDIAN_PLUGIN_DIR:-$PLUGIN_DIR_DEFAULT}}"

mkdir -p "$PLUGIN_DIR"

cd "$REPO_ROOT"
npm run build

link_artifact() {
  local source_path="$1"
  local target_path="$2"

  rm -f "$target_path"
  ln -s "$source_path" "$target_path"
}

link_artifact "$REPO_ROOT/main.js" "$PLUGIN_DIR/main.js"
link_artifact "$REPO_ROOT/manifest.json" "$PLUGIN_DIR/manifest.json"
link_artifact "$REPO_ROOT/styles.css" "$PLUGIN_DIR/styles.css"
link_artifact "$REPO_ROOT/versions.json" "$PLUGIN_DIR/versions.json"

printf 'Installed Vault Publisher into %s\n' "$PLUGIN_DIR"
printf 'Symlinked: main.js, manifest.json, styles.css, versions.json\n'
printf 'Preserved: data.json, mirrors/\n'
