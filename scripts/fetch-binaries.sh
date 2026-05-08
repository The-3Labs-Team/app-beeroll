#!/usr/bin/env bash
# Fetch the static ffmpeg binary for the current Rust target (or one supplied
# as $1) and place it under src-tauri/binaries/ where Tauri expects sidecar
# binaries. The destination filename embeds the Rust target triple, matching
# the externalBin convention.
#
# Usage:
#   bash scripts/fetch-binaries.sh                  # auto-detect host
#   bash scripts/fetch-binaries.sh aarch64-apple-darwin
#
# Source: https://github.com/eugeneware/ffmpeg-static — single-file static
# builds for the four desktop Tauri targets we care about. Pinned to a known
# release tag so CI is reproducible.
set -euo pipefail

FFMPEG_TAG="${FFMPEG_STATIC_TAG:-b6.1.1}"

# Determine the target triple if not passed explicitly.
if [ "$#" -ge 1 ]; then
  TARGET="$1"
else
  if ! command -v rustc >/dev/null 2>&1; then
    echo "rustc not found; pass the target triple as the first argument." >&2
    exit 1
  fi
  TARGET="$(rustc -vV | awk '/^host:/ {print $2}')"
fi

case "$TARGET" in
  aarch64-apple-darwin)     SUFFIX="darwin-arm64" ; EXT=""     ;;
  x86_64-apple-darwin)      SUFFIX="darwin-x64"   ; EXT=""     ;;
  aarch64-unknown-linux-gnu) SUFFIX="linux-arm64" ; EXT=""     ;;
  x86_64-unknown-linux-gnu) SUFFIX="linux-x64"    ; EXT=""     ;;
  x86_64-pc-windows-msvc)   SUFFIX="win32-x64"    ; EXT=".exe" ;;
  *)
    echo "Unsupported target: $TARGET" >&2
    exit 1
    ;;
esac

# Resolve the repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="$ROOT_DIR/src-tauri/binaries"
DEST="$DEST_DIR/ffmpeg-${TARGET}${EXT}"

mkdir -p "$DEST_DIR"

# eugeneware/ffmpeg-static publishes ffmpeg-<suffix> with no extension on
# every platform (Windows included), so we drop EXT from the URL but keep it
# on disk so Tauri picks the right file at bundle time.
URL="https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_TAG}/ffmpeg-${SUFFIX}"

if [ -x "$DEST" ] && [ -s "$DEST" ]; then
  echo "Already present: $DEST"
  exit 0
fi

echo "Downloading $URL"
curl -L --fail --progress-bar -o "$DEST" "$URL"
chmod 755 "$DEST"
echo "Wrote $DEST"
