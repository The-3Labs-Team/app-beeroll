# Video B-Roll Tool

Desktop tool per generare B-Roll YouTube guidato da AI. Carichi il voiceover, l'AI individua i punti dove servono i B-Roll, tu scegli i video, il tool li scarica con overlay copyright pronto per il montaggio.

## Stack

Tauri 2 + React 19 + TypeScript + Tailwind/shadcn (frontend) — Rust (backend orchestrator).

## Sviluppo (macOS)

### Prerequisiti

```bash
brew install rustup-init
rustup-init -y
brew install node@20
cargo install tauri-cli --version "^2.0"
brew install yt-dlp ffmpeg
```

Assicurati che `~/.cargo/bin` sia in `PATH` prima di `/opt/homebrew/bin` (il rustc Homebrew è troppo vecchio per le dipendenze Tauri 2). Il file `rust-toolchain.toml` nel repo seleziona `stable` via rustup.

### Setup

```bash
git clone <repo>
cd video-broll
npm install
```

### Run dev

```bash
npm run tauri dev
```

Si apre una finestra desktop. Apri `Settings`, incolla l'API key Anthropic (`sk-ant-...`) da `console.anthropic.com` e premi `Save & test`.

### Test

```bash
# Rust
cd src-tauri
PATH="$HOME/.cargo/bin:$PATH" cargo test                            # unit tests
PATH="$HOME/.cargo/bin:$PATH" cargo test -- --include-ignored       # include integration (yt-dlp, ffmpeg)

# Frontend
npx vitest run
```

### Build production (macOS)

```bash
npm run tauri build
```

Produce un `.dmg` in `src-tauri/target/release/bundle/`.

## Struttura

```
video-broll/
├── docs/superpowers/
│   ├── specs/                 # design specs
│   ├── plans/                 # implementation plans
│   └── QA-checklist-mvp.md    # smoke test manuale
├── src-tauri/                 # backend Rust
│   ├── src/
│   │   ├── ai/                # provider AI (Anthropic per MVP)
│   │   ├── domain.rs
│   │   ├── error.rs
│   │   ├── project_store.rs
│   │   ├── settings_store.rs
│   │   ├── extractor.rs
│   │   ├── youtube_search.rs
│   │   ├── download_manager.rs
│   │   ├── video_processor.rs
│   │   ├── toolchain_manager.rs
│   │   ├── commands.rs
│   │   ├── lib.rs
│   │   └── main.rs
│   └── resources/fonts/Inter-Regular.ttf
└── src/                       # frontend React
    ├── pages/                 # ProjectsPage, ImportPage, ReviewPage, PickerPage, SummaryPage, SettingsPage
    ├── components/            # KeywordHeader, VideoGrid, HoverStoryboard, PreviewPane, TimelineStrip, ui/
    ├── store.ts               # Zustand state
    ├── ipc.ts                 # Tauri IPC wrapper
    ├── types.ts
    └── App.tsx
```

## Configurazione utente

- **API key Anthropic** → Settings (salvata in macOS Keychain)
- **Progetti** → `~/B-Roll Projects/<slug>/`
  - `project.json` — stato persistente
  - `voiceover.txt` — input testo
  - `clips/` — output con overlay copyright
  - `cache/` — download grezzi yt-dlp e cache search

## Scope MVP

**Dentro:** input testo, AI Anthropic, search yt-dlp, picker iframe, download + overlay, summary.

**Fuori (futuri plan):** input audio + whisper, multi-provider AI, export EDL/FCPXML, build cross-platform firmato.

## CI / Releases

- **Test** — su ogni PR e push a `master`, GitHub Actions esegue la matrice `ubuntu-latest`/`macos-latest`/`windows-latest`: `cargo test`, `tsc --noEmit`, `vitest run`, `vite build`. Vedi `.github/workflows/test.yml`.
- **Release** — push di un tag `v*.*.*` (es. `git tag v0.1.0 && git push --tags`) lancia `.github/workflows/release.yml`, che produce installer nativi (`.dmg` universal macOS, `.AppImage`/`.deb` Linux, `.msi`/`.exe` Windows) tramite `tauri-apps/tauri-action` e li carica come release draft su GitHub.
- **Code signing** — i 6 secret Apple per signing/notarization e la coppia di chiavi Tauri updater sono opzionali; senza, le build escono unsigned. Setup completo in [`.github/SIGNING.md`](.github/SIGNING.md).

## Licenze

Inter Regular (font bundled per overlay): SIL Open Font License 1.1.
