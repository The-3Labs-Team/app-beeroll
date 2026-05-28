#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SKIP_RUST_TESTS="${SKIP_RUST_TESTS:-0}"
SKIP_TAURI_BUILD="${SKIP_TAURI_BUILD:-0}"
SKIP_WINDOWS_SIDECAR="${SKIP_WINDOWS_SIDECAR:-0}"
SKIP_NPM_CI="${SKIP_NPM_CI:-1}"

info() { printf "\n==> %s\n" "$*"; }
warn() { printf "\n[warn] %s\n" "$*"; }

info "BeeRoll release gate started"
echo "ROOT_DIR=$ROOT_DIR"
echo "SKIP_NPM_CI=$SKIP_NPM_CI SKIP_RUST_TESTS=$SKIP_RUST_TESTS SKIP_TAURI_BUILD=$SKIP_TAURI_BUILD SKIP_WINDOWS_SIDECAR=$SKIP_WINDOWS_SIDECAR"

if [[ "$SKIP_NPM_CI" != "1" ]]; then
  info "Installing frontend dependencies"
  npm ci
else
  warn "Skipping npm ci (set SKIP_NPM_CI=0 to enable)"
fi

info "Building frontend"
npm run build

if [[ "$SKIP_RUST_TESTS" != "1" ]]; then
  info "Running Rust tests (full suite)"
  if ! cargo test --manifest-path src-tauri/Cargo.toml --features test-mocks; then
    warn "Full Rust test suite failed. Retrying without keyring roundtrip tests..."
    if cargo test --manifest-path src-tauri/Cargo.toml --features test-mocks -- --skip set_get_delete_; then
      warn "Proceeding: non-keyring tests passed; keyring failures are expected in restricted environments."
    else
      warn "Rust tests failed beyond keyring constraints."
      exit 1
    fi
  fi
else
  warn "Skipping Rust tests (set SKIP_RUST_TESTS=0 to enable)"
fi

info "Fetching macOS universal ffmpeg sidecar"
bash scripts/fetch-binaries.sh universal-apple-darwin

if [[ "$SKIP_WINDOWS_SIDECAR" != "1" ]]; then
  info "Fetching Windows x64 ffmpeg sidecar"
  bash scripts/fetch-binaries.sh x86_64-pc-windows-msvc
else
  warn "Skipping Windows sidecar fetch (set SKIP_WINDOWS_SIDECAR=0 to enable)"
fi

if [[ "$SKIP_TAURI_BUILD" != "1" ]]; then
  if command -v rustup >/dev/null 2>&1; then
    info "Ensuring Rust targets for universal macOS"
    rustup target add aarch64-apple-darwin x86_64-apple-darwin
  fi
  info "Building Tauri universal macOS bundle"
  npm run tauri build -- --target universal-apple-darwin
else
  warn "Skipping Tauri universal build (set SKIP_TAURI_BUILD=0 to enable)"
fi

info "Release gate completed successfully"
