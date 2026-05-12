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
# Sources:
#   - macOS x86_64: evermeet.cx — full tessus build with libfreetype +
#     libharfbuzz + fontconfig, so the `drawtext` filter used for the
#     copyright overlay is present.
#   - macOS arm64:  ffmpeg.martin-riedl.de — native Apple Silicon static
#     build, same feature set as evermeet (drawtext, libfreetype, etc.).
#     Avoids the Rosetta penalty (≈30-40% on overlay) we'd pay if we
#     reused the Intel evermeet binary.
#   - Windows:      BtbN/FFmpeg-Builds — official GPL static builds with
#     the full filter set, ships ffmpeg.exe inside a versioned zip.
#   - Linux:        eugeneware/ffmpeg-static — single-file static builds
#     pinned to a known tag so CI is reproducible.
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

# Resolve the repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="$ROOT_DIR/src-tauri/binaries"
mkdir -p "$DEST_DIR"

# Helper: download a zip, extract the first file named `ffmpeg` (or
# `ffmpeg.exe`) found at any depth, and place it at $1.
extract_ffmpeg_from_zip() {
  local zip_path="$1"
  local dest="$2"
  local tmp
  tmp="$(mktemp -d)"
  unzip -q -o "$zip_path" -d "$tmp"
  # `find ... -print -quit` returns the first match and stops; covers both
  # martin-riedl (flat archive) and BtbN (nested under bin/) layouts.
  local extracted
  extracted="$(find "$tmp" \( -name ffmpeg -o -name ffmpeg.exe \) -type f -print -quit)"
  if [ -z "$extracted" ]; then
    echo "no ffmpeg binary found inside $zip_path" >&2
    rm -rf "$tmp"
    return 1
  fi
  mv "$extracted" "$dest"
  rm -rf "$tmp"
}

case "$TARGET" in
  x86_64-apple-darwin)
    DEST="$DEST_DIR/ffmpeg-${TARGET}"
    if [ -x "$DEST" ] && [ -s "$DEST" ]; then
      echo "Already present: $DEST"
      exit 0
    fi
    URL="${FFMPEG_EVERMEET_URL:-https://evermeet.cx/ffmpeg/getrelease/zip}"
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    echo "Downloading $URL"
    curl -L --fail --progress-bar -o "$TMP/ffmpeg.zip" "$URL"
    extract_ffmpeg_from_zip "$TMP/ffmpeg.zip" "$DEST"
    chmod 755 "$DEST"
    echo "Wrote $DEST"
    ;;
  aarch64-apple-darwin)
    DEST="$DEST_DIR/ffmpeg-${TARGET}"
    if [ -x "$DEST" ] && [ -s "$DEST" ]; then
      echo "Already present: $DEST"
      exit 0
    fi
    # martin-riedl.de exposes a stable redirect endpoint that always
    # serves the latest release build. Set FFMPEG_MARTIN_RIEDL_URL to
    # pin a specific version for reproducible CI.
    URL="${FFMPEG_MARTIN_RIEDL_URL:-https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip}"
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    echo "Downloading $URL"
    curl -L --fail --progress-bar -o "$TMP/ffmpeg.zip" "$URL"
    extract_ffmpeg_from_zip "$TMP/ffmpeg.zip" "$DEST"
    chmod 755 "$DEST"
    echo "Wrote $DEST"
    ;;
  x86_64-pc-windows-msvc)
    DEST="$DEST_DIR/ffmpeg-${TARGET}.exe"
    if [ -x "$DEST" ] && [ -s "$DEST" ]; then
      echo "Already present: $DEST"
      exit 0
    fi
    # BtbN ships rolling builds at the `latest` tag and pinned builds at
    # versioned tags. FFMPEG_BTBN_URL overrides the URL for reproducible CI.
    URL="${FFMPEG_BTBN_URL:-https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip}"
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    echo "Downloading $URL"
    curl -L --fail --progress-bar -o "$TMP/ffmpeg.zip" "$URL"
    extract_ffmpeg_from_zip "$TMP/ffmpeg.zip" "$DEST"
    chmod 755 "$DEST"
    echo "Wrote $DEST"
    ;;
  aarch64-unknown-linux-gnu|x86_64-unknown-linux-gnu)
    case "$TARGET" in
      aarch64-unknown-linux-gnu) SUFFIX="linux-arm64" ;;
      x86_64-unknown-linux-gnu)  SUFFIX="linux-x64"   ;;
    esac
    DEST="$DEST_DIR/ffmpeg-${TARGET}"
    if [ -x "$DEST" ] && [ -s "$DEST" ]; then
      echo "Already present: $DEST"
      exit 0
    fi
    URL="https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_TAG}/ffmpeg-${SUFFIX}"
    echo "Downloading $URL"
    curl -L --fail --progress-bar -o "$DEST" "$URL"
    chmod 755 "$DEST"
    echo "Wrote $DEST"
    ;;
  *)
    echo "Unsupported target: $TARGET" >&2
    exit 1
    ;;
esac
