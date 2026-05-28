# BeeRoll Cross-Platform Release Checklist

## 0) One-command Gate (recommended)
- Run: `./scripts/release-gate.sh`
- Optional env switches:
  - `SKIP_NPM_CI=0` to force reinstall dependencies
  - `SKIP_RUST_TESTS=1` to skip Rust tests
  - `SKIP_WINDOWS_SIDECAR=1` to skip Windows sidecar fetch
  - `SKIP_TAURI_BUILD=1` to skip universal macOS bundle build

## 1) Preflight
- `npm ci`
- `npm run build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- Note: keyring roundtrip tests can fail in sandbox/CI environments without OS keychain access.

## 2) Sidecar Binaries
- macOS universal: `bash scripts/fetch-binaries.sh universal-apple-darwin`
- Windows x64: `bash scripts/fetch-binaries.sh x86_64-pc-windows-msvc`
- Verify files exist under `src-tauri/binaries/`:
  - `ffmpeg-universal-apple-darwin`
  - `ffmpeg-x86_64-pc-windows-msvc.exe`

## 3) Build Verification
- macOS universal:
  - `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
  - `npm run tauri build -- --target universal-apple-darwin`
- Windows x64 (from Windows runner):
  - `npm run tauri build`

## 4) Runtime Smoke Tests (manual)
- Launch app and create a project (text voiceover).
- Confirm first-run toolchain bootstrap completes and `yt-dlp` path is populated in Settings.
- Run extraction with each provider type available (API / CLI / Ollama).
- Open picker, search YouTube, pick a clip, wait download+overlay completion.
- Export EDL and FCPXML; import in editor to verify media relinking.

## 5) Platform-Specific Checks
- macOS Intel + Apple Silicon:
  - App starts without Rosetta prompts (universal bundle).
  - `open project folder` works from UI.
- Windows 10/11:
  - No console window flashing during `yt-dlp`/`ffmpeg` operations.
  - `open project folder` opens Explorer.
  - Exported FCPXML uses valid `file:///C:/...` asset URLs.

## 6) CI Gate (required)
- GitHub release workflow passes on:
  - `macos-latest` with `--target universal-apple-darwin`
  - `windows-latest`
- Artifacts produced:
  - `.app` and `.dmg` for macOS universal
  - `.msi`/`.exe` bundle artifacts for Windows
