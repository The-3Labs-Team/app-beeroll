# Video B-Roll Tool

Desktop tool per generare B-Roll YouTube guidato da AI. Carichi il voiceover, l'AI individua i punti dove servono i B-Roll, tu scegli i video, il tool li scarica con overlay copyright pronto per il montaggio.

## Stack

Tauri 2 + React 19 + TypeScript + Tailwind/shadcn (frontend) — Rust (backend orchestrator).

## Installazione (per i collaboratori)

Scarica il bundle per il tuo sistema dall'ultima [release su GitHub](https://github.com/The-3Labs-Team/app-beeroll/releases/latest):

- **macOS** (Intel + Apple Silicon): `BeeRoll_<version>_universal.dmg`
- **Windows**: `BeeRoll_<version>_x64-setup.exe` (NSIS) o `BeeRoll_<version>_x64_en-US.msi`

I bundle non sono firmati (uso interno), quindi al primo avvio il sistema operativo mostra un warning di sicurezza che va sbloccato una volta sola.

### macOS — bypass Gatekeeper al primo avvio

Su Sonoma 14.5+ / Sequoia, fai doppio click su `BeeRoll.app` e Apple mostra "Apple non è in grado di verificare che BeeRoll non contenga malware..." con solo le opzioni "Sposta nel cestino" / "Fine". Per aprire lo stesso:

1. Click su **Fine** per chiudere il dialog.
2. Apri **System Settings → Privacy & Security**.
3. Scorri fino alla riga "Hai aperto BeeRoll che non è stato verificato..." e clicca **"Apri comunque"**.
4. Autenticati con Touch ID o password — il dialog riappare con il pulsante **Apri**.

In alternativa, da Terminale:

```bash
xattr -d com.apple.quarantine /Applications/BeeRoll.app
```

Rimuove la quarantena messa dal download. Funziona su qualunque versione di macOS recente, anche prima del primo lancio.

### Windows — bypass SmartScreen al primo avvio

Eseguendo l'`.exe` o l'`.msi` appare "Windows ha protetto il PC" / "Origine sconosciuta". Click su **"Ulteriori informazioni"** → **"Esegui comunque"**. Una volta sola.

### Primo avvio dell'app

1. L'app scarica `yt-dlp` (~12 MB) — vedi lo splash per qualche secondo.
2. Compare l'onboarding: inserisci la **API key Anthropic** (`sk-ant-...`, da [console.anthropic.com](https://console.anthropic.com)). Chiavi opzionali per YouTube Data API / Pixabay / Pexels nelle impostazioni.
3. I progetti vengono creati in `~/B-Roll Projects/` (modificabile da Settings → Cartella progetti).

## Sviluppo (macOS)

### Prerequisiti

```bash
brew install rustup-init
rustup-init -y
brew install node@20
cargo install tauri-cli --version "^2.0"
```

Né `yt-dlp` né `ffmpeg` vanno installati a mano:

- `yt-dlp` viene **scaricato automaticamente al primo avvio** (~12 MB) in `~/Library/Application Support/com.videobroll.app/bin/yt-dlp`. L'update viene controllato al massimo una volta al giorno.
- `ffmpeg` viene scaricato dallo script di setup (`scripts/fetch-binaries.sh`) e bundlato come [Tauri sidecar](https://v2.tauri.app/develop/sidecar/).

Assicurati che `~/.cargo/bin` sia in `PATH` prima di `/opt/homebrew/bin` (il rustc Homebrew è troppo vecchio per le dipendenze Tauri 2). Il file `rust-toolchain.toml` nel repo seleziona `stable` via rustup.

### Setup

```bash
git clone <repo>
cd video-broll
npm install
bash scripts/fetch-binaries.sh   # scarica ffmpeg sidecar per il target host
```

Lo script va rieseguito **prima di `npm run tauri dev`/`build`** (il file vive in `src-tauri/binaries/` ed è gitignored). Su CI è invocato automaticamente dai workflow.

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
PATH="$HOME/.cargo/bin:$PATH" cargo test -- --include-ignored       # include integration (richiede sidecar ffmpeg già scaricato)

# Frontend (vitest, cross-platform)
npx vitest run
```

#### Frontend integration tests (sostituto E2E su macOS)

`src/pages/PickerPage.test.tsx` simula il flusso Picker (search → click thumbnail → "Download & use" → marker timeline avanza) mockando `../ipc`. Stesso scope del controllo E2E manuale, senza richiedere il binary Tauri o un WebDriver. Lo store Zustand globale viene resettato in ogni `beforeEach`.

#### E2E reali — webdriverio + tauri-driver (Linux/Windows only)

`tauri-driver` ufficialmente supporta solo Linux + Windows. Su macOS l'eseguibile esiste ma esce con `tauri-driver is not supported on this platform` perché Apple's WebDriver non espone l'API necessaria per la webview Tauri. Su macOS limitarsi a `npx vitest run`.

Sui due OS supportati:

```bash
cargo install tauri-driver --locked            # una volta sola
bash scripts/fetch-binaries.sh                 # ffmpeg sidecar per il target host
npm run tauri build -- --debug                 # binary in src-tauri/target/debug/video-broll
npm run e2e                                    # spawna tauri-driver + lancia wdio
```

Su Linux servono anche `webkit2gtk-driver` (Debian/Ubuntu) o equivalente; su Windows Edge WebDriver corrispondente al runtime WebView2.

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
