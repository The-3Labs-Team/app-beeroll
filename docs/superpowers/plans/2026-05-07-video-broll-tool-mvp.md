# Video B-Roll Tool — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire un MVP funzionante del tool desktop B-Roll: input testo → AI estrae punti → search YouTube → picker con preview iframe → download + overlay copyright → summary.

**Architecture:** Tauri 2 (shell desktop) + React/TypeScript/Vite (frontend) + Rust (backend orchestrator). Backend espone comandi/eventi IPC verso il frontend. Spawn di `yt-dlp` (subprocess) e `ffmpeg` (subprocess) per le operazioni esterne. AI via HTTP API Anthropic (singolo provider per MVP).

**Tech Stack:** Tauri 2, React 18, TypeScript 5, Vite 5, Tailwind CSS, shadcn/ui, Zustand, Rust 1.78+, tokio, serde, reqwest, anyhow, thiserror, keyring-rs, vitest, cargo test.

**Out of scope for this plan** (futuri plan):
- Input audio + trascrizione whisper
- Provider AI diversi da Anthropic API
- Export EDL/FCPXML
- Build cross-platform firmato (sviluppo solo macOS in questo plan)
- Auto-update dell'app

---

## File Structure

### Repository root

```
video-broll/
├── docs/superpowers/
│   ├── specs/2026-05-07-video-broll-tool-design.md     (esistente)
│   └── plans/2026-05-07-video-broll-tool-mvp.md        (questo file)
├── src-tauri/                                            (backend Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/
│   ├── resources/
│   │   └── fonts/Inter-Regular.ttf                      (per overlay)
│   └── src/
│       ├── main.rs                                       (entrypoint, registra commands/events)
│       ├── error.rs                                      (AppError + Result type)
│       ├── domain.rs                                     (Project, BRollPoint, Voiceover, Status)
│       ├── project_store.rs                              (CRUD + persistenza JSON)
│       ├── settings_store.rs                             (keyring + JSON non-segreti)
│       ├── ai/
│       │   ├── mod.rs                                    (trait AIProvider)
│       │   └── anthropic.rs                              (impl Anthropic API)
│       ├── extractor.rs                                  (BRollExtractor: prompt + parsing JSON)
│       ├── youtube_search.rs                             (yt-dlp search)
│       ├── download_manager.rs                           (yt-dlp download + queue)
│       ├── video_processor.rs                            (ffmpeg drawtext)
│       ├── toolchain_manager.rs                          (verifica/installa yt-dlp)
│       └── commands.rs                                   (Tauri #[command] wrappers)
├── src/                                                  (frontend React)
│   ├── main.tsx
│   ├── App.tsx                                           (router)
│   ├── store.ts                                          (Zustand store)
│   ├── ipc.ts                                            (wrapper su invoke/listen Tauri)
│   ├── pages/
│   │   ├── ProjectsPage.tsx                              (lista progetti / nuovo)
│   │   ├── SettingsPage.tsx                              (API key)
│   │   ├── ImportPage.tsx                                (textarea voiceover)
│   │   ├── ReviewPage.tsx                                (lista punti estratti)
│   │   ├── PickerPage.tsx                                (cuore: grid + preview)
│   │   └── SummaryPage.tsx                               (clip generati)
│   ├── components/
│   │   ├── KeywordHeader.tsx                             (top: keyword grande + skip)
│   │   ├── VideoGrid.tsx                                 (3x3 thumb)
│   │   ├── HoverStoryboard.tsx                           (scrubbing storyboards)
│   │   ├── PreviewPane.tsx                               (iframe + metadati + commit)
│   │   ├── TimelineStrip.tsx                             (striscia stati)
│   │   └── ui/                                            (shadcn components)
│   └── lib/
│       └── utils.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

### Test files (paralleli alla struttura)

```
src-tauri/src/
├── project_store.rs        (#[cfg(test)] mod tests in-file)
├── ai/anthropic.rs         (#[cfg(test)] mod tests in-file)
├── extractor.rs            (#[cfg(test)] mod tests in-file)
├── youtube_search.rs       (#[cfg(test)] mod tests in-file)
├── video_processor.rs      (#[cfg(test)] mod tests in-file)
└── tests/                  (integration tests con fixture)
    ├── ffmpeg_overlay_test.rs
    └── ytdlp_search_test.rs

src/
├── store.test.ts           (vitest)
└── components/
    ├── TimelineStrip.test.tsx
    └── VideoGrid.test.tsx
```

### Responsabilità per file

- `src-tauri/src/domain.rs` — solo tipi serializzabili, nessuna logica
- `src-tauri/src/project_store.rs` — persistenza, debouncing, watch events
- `src-tauri/src/ai/` — astrazione provider, l'impl Anthropic vive qui
- `src-tauri/src/extractor.rs` — prompt template + parsing JSON robusto
- `src-tauri/src/commands.rs` — sottile, solo wrapper IPC (un comando per riga)
- `src/store.ts` — single source of truth UI, sincronizzato via eventi backend

---

## Setup pre-requisiti (una sola volta, manuale)

Prima di iniziare le tasks:

1. Installato Rust toolchain (`rustc 1.78+`): `rustup update`
2. Installato Node.js 20+: `node --version`
3. Installato Tauri CLI: `cargo install tauri-cli --version "^2.0"`
4. Installato `yt-dlp` (sarà bundlato per produzione, ma serve per dev): `brew install yt-dlp`
5. Installato `ffmpeg` (sarà bundlato per produzione, ma serve per dev): `brew install ffmpeg`
6. API key Anthropic da `console.anthropic.com` salvata in un posto raggiungibile

---

## Task 1: Scaffold Tauri 2 + React + TypeScript

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`

- [ ] **Step 1: Crea il progetto Tauri 2 + React + TS**

```bash
npm create tauri-app@latest -- video-broll-app --template react-ts --manager npm
# Sposta il contenuto in root del repo (siamo già in video-broll/)
mv video-broll-app/{,.}[!.]* . 2>/dev/null
mv video-broll-app/* . 2>/dev/null
rm -rf video-broll-app
```

- [ ] **Step 2: Verifica struttura generata**

```bash
ls -la
# Deve esistere: package.json, src-tauri/, src/, vite.config.ts, tsconfig.json
```

Expected: presenti tutti i file standard del template Tauri+React+TS.

- [ ] **Step 3: Installa dipendenze npm**

```bash
npm install
```

Expected: `node_modules/` creato senza errori.

- [ ] **Step 4: Verifica build dev**

```bash
npm run tauri dev
```

Expected: si apre una finestra desktop con la pagina di default Tauri+React. Chiudi con Cmd+Q.

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json package-lock.json index.html vite.config.ts tsconfig.json src/ src-tauri/
git commit -m "feat: scaffold Tauri 2 + React + TypeScript project"
```

---

## Task 2: Aggiungi Tailwind CSS + shadcn/ui

**Files:**
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`
- Create: `tailwind.config.js`, `postcss.config.js`, `src/index.css`, `components.json`, `src/lib/utils.ts`

- [ ] **Step 1: Installa Tailwind**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: Configura `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        border: "hsl(var(--border))",
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Sostituisci `src/index.css` con direttive Tailwind**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 4%;
    --primary: 240 6% 10%;
    --primary-foreground: 0 0% 98%;
    --muted: 240 5% 96%;
    --muted-foreground: 240 4% 46%;
    --border: 240 6% 90%;
  }
  .dark {
    --background: 240 10% 4%;
    --foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 6% 10%;
    --muted: 240 4% 16%;
    --muted-foreground: 240 5% 65%;
    --border: 240 4% 16%;
  }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Step 4: Inizializza shadcn/ui**

```bash
npx shadcn@latest init -y -b slate
```

Quando richiede path alias, accetta `@/*` (di default).

- [ ] **Step 5: Aggiungi componenti shadcn base**

```bash
npx shadcn@latest add button input textarea card dialog toast
```

- [ ] **Step 6: Verifica che la build dev funzioni ancora**

```bash
npm run tauri dev
```

Expected: app si apre, niente errori in console.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: add Tailwind CSS + shadcn/ui base components"
```

---

## Task 3: Aggiungi dipendenze Rust e struttura moduli

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/error.rs`, `src-tauri/src/domain.rs`
- Modify: `src-tauri/src/main.rs` (o `lib.rs` se Tauri 2 lo usa)

- [ ] **Step 1: Aggiungi dipendenze a `src-tauri/Cargo.toml`**

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
anyhow = "1"
thiserror = "1"
reqwest = { version = "0.12", features = ["json", "rustls-tls"], default-features = false }
keyring = "3"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["v4", "serde"] }
slug = "0.1"
dirs = "5"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

[dev-dependencies]
tempfile = "3"
mockito = "1"
```

- [ ] **Step 2: Crea `src-tauri/src/error.rs`**

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("ai provider error: {0}")]
    AiProvider(String),

    #[error("invalid response from AI: {0}")]
    AiResponseInvalid(String),

    #[error("subprocess failed: {0}")]
    Subprocess(String),

    #[error("project not found: {0}")]
    ProjectNotFound(String),

    #[error("invalid input: {0}")]
    InvalidInput(String),
}

pub type AppResult<T> = std::result::Result<T, AppError>;

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
```

- [ ] **Step 3: Crea `src-tauri/src/domain.rs`**

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BRollStatus {
    Pending,
    Searching,
    Picking,
    Downloading,
    Done,
    Skipped,
    Error,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VoiceoverInput {
    pub kind: VoiceoverKind,
    pub path: String,
    pub duration_sec: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VoiceoverKind {
    Audio,
    Text,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoCandidate {
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub duration_sec: u32,
    pub thumb_url: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BRollPoint {
    pub id: String,
    pub phrase: String,
    pub t_start: Option<f64>,
    pub t_end: Option<f64>,
    pub keywords: Vec<String>,
    pub active_keyword: String,
    pub status: BRollStatus,
    pub selected_video: Option<VideoCandidate>,
    pub output_clip: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub version: u32,
    pub slug: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub voiceover: VoiceoverInput,
    pub transcript: Vec<TranscriptSegment>,
    pub broll_points: Vec<BRollPoint>,
}

impl Project {
    pub const CURRENT_VERSION: u32 = 1;
}
```

- [ ] **Step 4: Aggiorna `src-tauri/src/main.rs` per registrare i moduli**

Apri il file generato dallo scaffold e modifica per includere:

```rust
mod error;
mod domain;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Verifica compilazione**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: build success.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/error.rs src-tauri/src/domain.rs src-tauri/src/main.rs
git commit -m "feat: add Rust dependencies, error types, domain model"
```

---

## Task 4: ProjectStore — TDD CRUD + persistenza

**Files:**
- Create: `src-tauri/src/project_store.rs`
- Modify: `src-tauri/src/main.rs` (register module)

- [ ] **Step 1: Crea `src-tauri/src/project_store.rs` con il primo test**

```rust
use crate::domain::*;
use crate::error::*;
use chrono::Utc;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct ProjectStore {
    root: PathBuf,
    project: Arc<RwLock<Project>>,
}

impl ProjectStore {
    pub async fn create(root: &Path, name: &str, voiceover: VoiceoverInput) -> AppResult<Self> {
        let slug = slug::slugify(name);
        let project_dir = root.join(&slug);
        if project_dir.exists() {
            return Err(AppError::InvalidInput(format!("project '{slug}' already exists")));
        }
        tokio::fs::create_dir_all(project_dir.join("audio")).await?;
        tokio::fs::create_dir_all(project_dir.join("clips")).await?;
        tokio::fs::create_dir_all(project_dir.join("cache")).await?;

        let project = Project {
            version: Project::CURRENT_VERSION,
            slug: slug.clone(),
            name: name.to_string(),
            created_at: Utc::now(),
            voiceover,
            transcript: Vec::new(),
            broll_points: Vec::new(),
        };

        let store = Self {
            root: project_dir,
            project: Arc::new(RwLock::new(project)),
        };
        store.save().await?;
        Ok(store)
    }

    pub async fn save(&self) -> AppResult<()> {
        let project = self.project.read().await;
        let path = self.root.join("project.json");
        let json = serde_json::to_string_pretty(&*project)?;
        tokio::fs::write(&path, json).await?;
        Ok(())
    }

    pub async fn project(&self) -> Project {
        self.project.read().await.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn dummy_voiceover() -> VoiceoverInput {
        VoiceoverInput {
            kind: VoiceoverKind::Text,
            path: "n/a".into(),
            duration_sec: None,
        }
    }

    #[tokio::test]
    async fn create_persists_project_json() {
        let tmp = TempDir::new().unwrap();
        let store = ProjectStore::create(tmp.path(), "Test Episode", dummy_voiceover())
            .await
            .unwrap();
        let pj_path = tmp.path().join("test-episode").join("project.json");
        assert!(pj_path.exists(), "project.json should exist");
        let saved: Project = serde_json::from_str(&std::fs::read_to_string(pj_path).unwrap()).unwrap();
        assert_eq!(saved.name, "Test Episode");
        assert_eq!(saved.slug, "test-episode");
        assert_eq!(saved.version, 1);
    }
}
```

- [ ] **Step 2: Registra il modulo in `main.rs`**

Aggiungi `mod project_store;` in cima a `main.rs`.

- [ ] **Step 3: Esegui test → deve passare**

```bash
cd src-tauri && cargo test project_store::tests::create_persists_project_json && cd ..
```

Expected: PASS.

- [ ] **Step 4: Aggiungi test `load_restores_project`**

In `src-tauri/src/project_store.rs`, dentro `mod tests`, aggiungi:

```rust
#[tokio::test]
async fn load_restores_project() {
    let tmp = TempDir::new().unwrap();
    {
        let store = ProjectStore::create(tmp.path(), "Restore Me", dummy_voiceover())
            .await
            .unwrap();
        store.save().await.unwrap();
    }
    let store = ProjectStore::load(&tmp.path().join("restore-me")).await.unwrap();
    assert_eq!(store.project().await.name, "Restore Me");
}
```

- [ ] **Step 5: Esegui test → deve fallire (load non esiste)**

```bash
cd src-tauri && cargo test load_restores_project && cd ..
```

Expected: FAIL ("method `load` not found").

- [ ] **Step 6: Implementa `load` in `ProjectStore`**

Aggiungi nel blocco `impl ProjectStore`:

```rust
pub async fn load(project_dir: &Path) -> AppResult<Self> {
    let path = project_dir.join("project.json");
    let bytes = tokio::fs::read(&path).await?;
    let project: Project = serde_json::from_slice(&bytes)?;
    Ok(Self {
        root: project_dir.to_path_buf(),
        project: Arc::new(RwLock::new(project)),
    })
}
```

- [ ] **Step 7: Esegui test → deve passare**

```bash
cd src-tauri && cargo test load_restores_project && cd ..
```

Expected: PASS.

- [ ] **Step 8: Aggiungi test `add_broll_point_persists`**

```rust
#[tokio::test]
async fn add_broll_point_persists() {
    let tmp = TempDir::new().unwrap();
    let store = ProjectStore::create(tmp.path(), "BR Test", dummy_voiceover())
        .await
        .unwrap();
    let bp = BRollPoint {
        id: "bp_01".into(),
        phrase: "trail running".into(),
        t_start: None,
        t_end: None,
        keywords: vec!["trail".into()],
        active_keyword: "trail".into(),
        status: BRollStatus::Pending,
        selected_video: None,
        output_clip: None,
    };
    store.add_broll_point(bp.clone()).await.unwrap();

    let reloaded = ProjectStore::load(&tmp.path().join("br-test")).await.unwrap();
    assert_eq!(reloaded.project().await.broll_points.len(), 1);
    assert_eq!(reloaded.project().await.broll_points[0].id, "bp_01");
}
```

- [ ] **Step 9: Implementa `add_broll_point`**

Nel blocco `impl ProjectStore`:

```rust
pub async fn add_broll_point(&self, point: BRollPoint) -> AppResult<()> {
    {
        let mut project = self.project.write().await;
        project.broll_points.push(point);
    }
    self.save().await
}

pub async fn update_broll_point<F>(&self, id: &str, updater: F) -> AppResult<()>
where
    F: FnOnce(&mut BRollPoint),
{
    {
        let mut project = self.project.write().await;
        let bp = project
            .broll_points
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::InvalidInput(format!("broll point {id} not found")))?;
        updater(bp);
    }
    self.save().await
}
```

- [ ] **Step 10: Esegui tutti i test del modulo**

```bash
cd src-tauri && cargo test project_store && cd ..
```

Expected: 3 PASS.

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/project_store.rs src-tauri/src/main.rs
git commit -m "feat: ProjectStore with create, load, add/update broll points"
```

---

## Task 5: SettingsStore con keyring per API key

**Files:**
- Create: `src-tauri/src/settings_store.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Crea `src-tauri/src/settings_store.rs` con primo test**

```rust
use crate::error::*;
use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "video-broll";
const KEYRING_USER_ANTHROPIC: &str = "anthropic_api_key";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub ai_provider: String,
    pub anthropic_model: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            ai_provider: "anthropic_api".into(),
            anthropic_model: "claude-sonnet-4-6".into(),
        }
    }
}

pub struct SettingsStore;

impl SettingsStore {
    pub fn set_anthropic_key(key: &str) -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_ANTHROPIC)?;
        entry.set_password(key)?;
        Ok(())
    }

    pub fn get_anthropic_key() -> AppResult<Option<String>> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_ANTHROPIC)?;
        match entry.get_password() {
            Ok(k) => Ok(Some(k)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete_anthropic_key() -> AppResult<()> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_ANTHROPIC)?;
        match entry.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_get_delete_anthropic_key_roundtrip() {
        // Pulisci eventuale chiave residua dai test precedenti
        let _ = SettingsStore::delete_anthropic_key();
        assert_eq!(SettingsStore::get_anthropic_key().unwrap(), None);

        SettingsStore::set_anthropic_key("sk-ant-test-12345").unwrap();
        assert_eq!(
            SettingsStore::get_anthropic_key().unwrap(),
            Some("sk-ant-test-12345".to_string())
        );

        SettingsStore::delete_anthropic_key().unwrap();
        assert_eq!(SettingsStore::get_anthropic_key().unwrap(), None);
    }
}
```

- [ ] **Step 2: Registra il modulo in `main.rs`**

Aggiungi `mod settings_store;`.

- [ ] **Step 3: Esegui il test**

```bash
cd src-tauri && cargo test settings_store && cd ..
```

Expected: PASS (può richiedere autorizzazione Keychain alla prima esecuzione su macOS).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/settings_store.rs src-tauri/src/main.rs
git commit -m "feat: SettingsStore with keyring-backed API key storage"
```

---

## Task 6: AIProvider trait + AnthropicProvider con TDD (mockito)

**Files:**
- Create: `src-tauri/src/ai/mod.rs`, `src-tauri/src/ai/anthropic.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Crea il modulo trait `src-tauri/src/ai/mod.rs`**

```rust
use crate::error::AppResult;
use async_trait::async_trait;

pub mod anthropic;

#[async_trait]
pub trait AIProvider: Send + Sync {
    async fn complete(&self, system: &str, user: &str) -> AppResult<String>;
    fn name(&self) -> &'static str;
}
```

Aggiungi `async-trait = "0.1"` a `Cargo.toml` (sezione `[dependencies]`).

- [ ] **Step 2: Crea `src-tauri/src/ai/anthropic.rs` con primo test usando mockito**

```rust
use crate::ai::AIProvider;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
const DEFAULT_MODEL: &str = "claude-sonnet-4-6";

pub struct AnthropicProvider {
    api_key: String,
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: DEFAULT_BASE_URL.to_string(),
            model: DEFAULT_MODEL.to_string(),
            client: reqwest::Client::new(),
        }
    }

    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }

    pub fn with_model(mut self, model: String) -> Self {
        self.model = model;
        self
    }
}

#[derive(Serialize)]
struct ReqMessage {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ReqBody<'a> {
    model: &'a str,
    max_tokens: u32,
    system: &'a str,
    messages: Vec<ReqMessage>,
}

#[derive(Deserialize)]
struct RespContent {
    text: String,
}

#[derive(Deserialize)]
struct RespBody {
    content: Vec<RespContent>,
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    fn name(&self) -> &'static str {
        "anthropic_api"
    }

    async fn complete(&self, system: &str, user: &str) -> AppResult<String> {
        let url = format!("{}/v1/messages", self.base_url);
        let body = ReqBody {
            model: &self.model,
            max_tokens: 4096,
            system,
            messages: vec![ReqMessage {
                role: "user",
                content: user.to_string(),
            }],
        };
        let resp = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::AiProvider(format!("status {status}: {body}")));
        }

        let parsed: RespBody = resp.json().await?;
        parsed
            .content
            .into_iter()
            .next()
            .map(|c| c.text)
            .ok_or_else(|| AppError::AiResponseInvalid("empty content array".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn complete_returns_first_content_text() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("POST", "/v1/messages")
            .match_header("x-api-key", "test-key")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"content":[{"type":"text","text":"hello world"}]}"#)
            .create_async()
            .await;

        let provider = AnthropicProvider::new("test-key".into()).with_base_url(server.url());
        let out = provider.complete("system prompt", "user prompt").await.unwrap();
        assert_eq!(out, "hello world");
    }

    #[tokio::test]
    async fn complete_propagates_4xx_as_error() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("POST", "/v1/messages")
            .with_status(401)
            .with_body(r#"{"error":"invalid api key"}"#)
            .create_async()
            .await;

        let provider = AnthropicProvider::new("bad".into()).with_base_url(server.url());
        let err = provider.complete("s", "u").await.unwrap_err();
        assert!(matches!(err, AppError::AiProvider(_)));
    }
}
```

- [ ] **Step 3: Registra `mod ai;` in `main.rs`**

```rust
mod ai;
```

- [ ] **Step 4: Esegui i test**

```bash
cd src-tauri && cargo test anthropic && cd ..
```

Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/ai/ src-tauri/src/main.rs
git commit -m "feat: AIProvider trait + AnthropicProvider with mocked tests"
```

---

## Task 7: BRollExtractor — prompt + parsing JSON

**Files:**
- Create: `src-tauri/src/extractor.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Crea `src-tauri/src/extractor.rs` con primo test**

```rust
use crate::ai::AIProvider;
use crate::domain::{BRollPoint, BRollStatus};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::sync::Arc;

const SYSTEM_PROMPT: &str = "You are an expert video editor assistant. Given a voiceover transcript, identify points where B-Roll footage would enhance the video. For each point, propose 2-3 short search keywords for YouTube. Return ONLY valid JSON with this exact shape: {\"points\":[{\"phrase\":\"<text from transcript>\",\"keywords\":[\"kw1\",\"kw2\"]}]}";

#[derive(Deserialize)]
struct ExtractionResponse {
    points: Vec<ExtractedPoint>,
}

#[derive(Deserialize)]
struct ExtractedPoint {
    phrase: String,
    keywords: Vec<String>,
}

pub struct BRollExtractor {
    provider: Arc<dyn AIProvider>,
}

impl BRollExtractor {
    pub fn new(provider: Arc<dyn AIProvider>) -> Self {
        Self { provider }
    }

    pub async fn extract(&self, transcript_text: &str) -> AppResult<Vec<BRollPoint>> {
        let user_prompt = format!("Voiceover transcript:\n\n{transcript_text}\n\nReturn the JSON now.");
        let raw = self.provider.complete(SYSTEM_PROMPT, &user_prompt).await?;
        let cleaned = strip_markdown_fences(&raw);
        let parsed: ExtractionResponse = serde_json::from_str(&cleaned)
            .map_err(|e| AppError::AiResponseInvalid(format!("{e}; raw: {cleaned}")))?;

        Ok(parsed
            .points
            .into_iter()
            .enumerate()
            .map(|(i, p)| BRollPoint {
                id: format!("bp_{:02}", i + 1),
                phrase: p.phrase,
                t_start: None,
                t_end: None,
                active_keyword: p.keywords.first().cloned().unwrap_or_default(),
                keywords: p.keywords,
                status: BRollStatus::Pending,
                selected_video: None,
                output_clip: None,
            })
            .collect())
    }
}

fn strip_markdown_fences(s: &str) -> String {
    let trimmed = s.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        return rest.trim_end_matches("```").trim().to_string();
    }
    if let Some(rest) = trimmed.strip_prefix("```") {
        return rest.trim_end_matches("```").trim().to_string();
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;

    struct MockProvider {
        response: String,
    }

    #[async_trait]
    impl AIProvider for MockProvider {
        fn name(&self) -> &'static str { "mock" }
        async fn complete(&self, _s: &str, _u: &str) -> AppResult<String> {
            Ok(self.response.clone())
        }
    }

    #[tokio::test]
    async fn extract_parses_well_formed_json() {
        let provider = Arc::new(MockProvider {
            response: r#"{"points":[{"phrase":"trail running","keywords":["trail","mountain"]}]}"#.into(),
        });
        let extractor = BRollExtractor::new(provider);
        let points = extractor.extract("some transcript").await.unwrap();
        assert_eq!(points.len(), 1);
        assert_eq!(points[0].phrase, "trail running");
        assert_eq!(points[0].active_keyword, "trail");
        assert_eq!(points[0].id, "bp_01");
    }

    #[tokio::test]
    async fn extract_strips_markdown_fences() {
        let provider = Arc::new(MockProvider {
            response: "```json\n{\"points\":[{\"phrase\":\"x\",\"keywords\":[\"y\"]}]}\n```".into(),
        });
        let extractor = BRollExtractor::new(provider);
        let points = extractor.extract("t").await.unwrap();
        assert_eq!(points.len(), 1);
    }

    #[tokio::test]
    async fn extract_errors_on_malformed_json() {
        let provider = Arc::new(MockProvider {
            response: "not json".into(),
        });
        let extractor = BRollExtractor::new(provider);
        let err = extractor.extract("t").await.unwrap_err();
        assert!(matches!(err, AppError::AiResponseInvalid(_)));
    }
}
```

- [ ] **Step 2: Registra `mod extractor;` in `main.rs`**

- [ ] **Step 3: Esegui i test**

```bash
cd src-tauri && cargo test extractor && cd ..
```

Expected: 3 PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/extractor.rs src-tauri/src/main.rs
git commit -m "feat: BRollExtractor with structured JSON output parsing"
```

---

## Task 8: YouTubeSearch via yt-dlp subprocess

**Files:**
- Create: `src-tauri/src/youtube_search.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Crea `src-tauri/src/youtube_search.rs` con test integrazione**

```rust
use crate::domain::VideoCandidate;
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use tokio::process::Command;

pub struct YouTubeSearch {
    ytdlp_path: String,
}

#[derive(Deserialize)]
struct YtDlpEntry {
    id: String,
    title: String,
    #[serde(default)]
    channel: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    thumbnails: Vec<YtDlpThumb>,
    #[serde(default)]
    thumbnail: Option<String>,
}

#[derive(Deserialize)]
struct YtDlpThumb {
    url: String,
    #[serde(default)]
    height: Option<u32>,
}

impl YouTubeSearch {
    pub fn new(ytdlp_path: impl Into<String>) -> Self {
        Self { ytdlp_path: ytdlp_path.into() }
    }

    pub async fn search(&self, keyword: &str, count: u8) -> AppResult<Vec<VideoCandidate>> {
        let query = format!("ytsearch{count}:{keyword}");
        let output = Command::new(&self.ytdlp_path)
            .args([
                "--dump-json",
                "--flat-playlist",
                "--no-warnings",
                "--no-playlist",
                "--quiet",
                &query,
            ])
            .output()
            .await
            .map_err(|e| AppError::Subprocess(format!("yt-dlp spawn failed: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Subprocess(format!("yt-dlp failed: {stderr}")));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut results = Vec::new();
        for line in stdout.lines().filter(|l| !l.trim().is_empty()) {
            let entry: YtDlpEntry = serde_json::from_str(line)
                .map_err(|e| AppError::AiResponseInvalid(format!("yt-dlp json: {e}")))?;
            results.push(to_candidate(entry));
        }
        Ok(results)
    }
}

fn to_candidate(e: YtDlpEntry) -> VideoCandidate {
    let channel = e.channel.or(e.uploader).unwrap_or_else(|| "Unknown".into());
    let thumb_url = e
        .thumbnail
        .or_else(|| e.thumbnails.into_iter().max_by_key(|t| t.height.unwrap_or(0)).map(|t| t.url))
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", e.id));
    VideoCandidate {
        url: format!("https://www.youtube.com/watch?v={}", e.id),
        video_id: e.id,
        title: e.title,
        channel,
        duration_sec: e.duration.unwrap_or(0.0) as u32,
        thumb_url,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires yt-dlp installed and network access"]
    async fn search_returns_results_for_real_keyword() {
        let ytdlp = which::which("yt-dlp").expect("yt-dlp not found in PATH");
        let search = YouTubeSearch::new(ytdlp.to_string_lossy().into_owned());
        let results = search.search("rust programming language", 3).await.unwrap();
        assert!(!results.is_empty());
        assert!(results.len() <= 3);
        assert!(results[0].video_id.len() == 11, "video_id should be 11 chars");
    }
}
```

Aggiungi a `Cargo.toml` (sezione `[dev-dependencies]`):

```toml
which = "6"
```

- [ ] **Step 2: Registra `mod youtube_search;` in `main.rs`**

- [ ] **Step 3: Esegui i test (incluso ignored)**

```bash
cd src-tauri && cargo test youtube_search -- --include-ignored && cd ..
```

Expected: 1 PASS (richiede `yt-dlp` in PATH, cfr. setup pre-requisiti).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/youtube_search.rs src-tauri/src/main.rs
git commit -m "feat: YouTubeSearch via yt-dlp subprocess"
```

---

## Task 9: VideoProcessor — overlay copyright via ffmpeg

**Files:**
- Create: `src-tauri/src/video_processor.rs`, `src-tauri/resources/fonts/Inter-Regular.ttf`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`

- [ ] **Step 1: Scarica font Inter Regular**

```bash
curl -L -o src-tauri/resources/fonts/Inter-Regular.ttf \
  https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf
```

Verifica che il file sia >50KB.

- [ ] **Step 2: Crea `src-tauri/src/video_processor.rs`**

```rust
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use tokio::process::Command;

pub struct VideoProcessor {
    ffmpeg_path: String,
    font_path: PathBuf,
}

impl VideoProcessor {
    pub fn new(ffmpeg_path: impl Into<String>, font_path: PathBuf) -> Self {
        Self { ffmpeg_path: ffmpeg_path.into(), font_path }
    }

    pub async fn apply_copyright_overlay(
        &self,
        input: &Path,
        output: &Path,
        channel_name: &str,
    ) -> AppResult<()> {
        let escaped_channel = escape_drawtext(channel_name);
        let escaped_font = self.font_path.to_string_lossy().replace('\\', "/").replace(':', "\\:");
        let filter = format!(
            "drawtext=text='\u{00A9} {escaped_channel}':x=24:y=h-th-24:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=8:fontfile={escaped_font}"
        );

        let output_status = Command::new(&self.ffmpeg_path)
            .args([
                "-y",
                "-i", input.to_string_lossy().as_ref(),
                "-vf", &filter,
                "-codec:a", "copy",
                "-loglevel", "error",
                output.to_string_lossy().as_ref(),
            ])
            .output()
            .await
            .map_err(|e| AppError::Subprocess(format!("ffmpeg spawn: {e}")))?;

        if !output_status.status.success() {
            let stderr = String::from_utf8_lossy(&output_status.stderr);
            return Err(AppError::Subprocess(format!("ffmpeg failed: {stderr}")));
        }
        Ok(())
    }
}

fn escape_drawtext(s: &str) -> String {
    s.replace('\\', r"\\")
        .replace(':', r"\:")
        .replace('\'', r"\'")
        .replace('%', r"\%")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_drawtext_handles_special_chars() {
        assert_eq!(escape_drawtext("foo:bar"), r"foo\:bar");
        assert_eq!(escape_drawtext("it's"), r"it\'s");
    }
}
```

- [ ] **Step 3: Crea integration test in `src-tauri/tests/ffmpeg_overlay_test.rs`**

```rust
use std::path::PathBuf;
use std::process::Command;
use tempfile::TempDir;

#[tokio::test]
#[ignore = "requires ffmpeg installed; generates 2s test video"]
async fn ffmpeg_overlay_applies_drawtext() {
    let ffmpeg = which::which("ffmpeg").expect("ffmpeg in PATH");
    let tmp = TempDir::new().unwrap();
    let input = tmp.path().join("input.mp4");
    let output = tmp.path().join("output.mp4");

    // Genera 2s video di test
    let status = Command::new(&ffmpeg)
        .args([
            "-y",
            "-f", "lavfi",
            "-i", "testsrc=duration=2:size=320x240:rate=30",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            input.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(status.success(), "ffmpeg test video generation failed");

    let font = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/fonts/Inter-Regular.ttf");
    let processor = video_broll_app_lib::video_processor::VideoProcessor::new(
        ffmpeg.to_string_lossy().into_owned(),
        font,
    );
    processor.apply_copyright_overlay(&input, &output, "TestChannel").await.unwrap();
    assert!(output.exists());
    let metadata = std::fs::metadata(&output).unwrap();
    assert!(metadata.len() > 1000, "output should be a real video file");
}
```

NOTA: per usare `video_broll_app_lib::` bisogna esportare i moduli come libreria. Vedi step successivo.

- [ ] **Step 4: Trasforma il binary in lib + bin**

Modifica `src-tauri/Cargo.toml` aggiungendo:

```toml
[lib]
name = "video_broll_app_lib"
path = "src/lib.rs"

[[bin]]
name = "video-broll"
path = "src/main.rs"
```

Crea `src-tauri/src/lib.rs`:

```rust
pub mod ai;
pub mod domain;
pub mod error;
pub mod extractor;
pub mod project_store;
pub mod settings_store;
pub mod video_processor;
pub mod youtube_search;
```

Modifica `src-tauri/src/main.rs` per usare la lib:

```rust
fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Esegui unit test del modulo**

```bash
cd src-tauri && cargo test video_processor && cd ..
```

Expected: 1 PASS (escape_drawtext).

- [ ] **Step 6: Esegui integration test**

```bash
cd src-tauri && cargo test --test ffmpeg_overlay_test -- --include-ignored && cd ..
```

Expected: PASS, file output.mp4 generato e >1KB.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/src/video_processor.rs src-tauri/resources/fonts/Inter-Regular.ttf src-tauri/tests/ffmpeg_overlay_test.rs
git commit -m "feat: VideoProcessor with ffmpeg drawtext overlay + integration test"
```

---

## Task 10: DownloadManager — yt-dlp download con progresso

**Files:**
- Create: `src-tauri/src/download_manager.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Crea `src-tauri/src/download_manager.rs`**

```rust
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use std::process::Stdio;

pub struct DownloadManager {
    ytdlp_path: String,
}

#[derive(Debug, Clone)]
pub struct DownloadProgress {
    pub percent: f32,
    pub eta_sec: Option<u32>,
}

impl DownloadManager {
    pub fn new(ytdlp_path: impl Into<String>) -> Self {
        Self { ytdlp_path: ytdlp_path.into() }
    }

    pub async fn download<F>(&self, url: &str, output_dir: &Path, mut on_progress: F) -> AppResult<PathBuf>
    where
        F: FnMut(DownloadProgress) + Send,
    {
        tokio::fs::create_dir_all(output_dir).await?;
        let output_template = output_dir.join("%(id)s.%(ext)s");

        let mut child = Command::new(&self.ytdlp_path)
            .args([
                "--newline",
                "--no-warnings",
                "-f", "best[ext=mp4][height<=720]/best[ext=mp4]/best",
                "-o", output_template.to_string_lossy().as_ref(),
                "--print", "after_move:filepath",
                url,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| AppError::Subprocess(format!("yt-dlp spawn: {e}")))?;

        let stdout = child.stdout.take().unwrap();
        let mut reader = BufReader::new(stdout).lines();
        let mut filepath: Option<PathBuf> = None;

        while let Some(line) = reader.next_line().await? {
            if let Some(p) = parse_progress(&line) {
                on_progress(p);
            } else if line.trim().ends_with(".mp4") || line.trim().ends_with(".mkv") || line.trim().ends_with(".webm") {
                filepath = Some(PathBuf::from(line.trim()));
            }
        }

        let status = child.wait().await?;
        if !status.success() {
            return Err(AppError::Subprocess(format!("yt-dlp exited with {status}")));
        }

        filepath.ok_or_else(|| AppError::Subprocess("yt-dlp did not print filepath".into()))
    }
}

fn parse_progress(line: &str) -> Option<DownloadProgress> {
    let l = line.trim();
    if !l.starts_with("[download]") { return None; }
    let after = l.strip_prefix("[download]")?.trim();
    let pct_token = after.split_whitespace().next()?;
    let pct = pct_token.trim_end_matches('%').parse::<f32>().ok()?;
    let eta = after.split("ETA").nth(1).and_then(|e| {
        let t = e.trim();
        let parts: Vec<&str> = t.splitn(2, |c: char| c.is_whitespace()).collect();
        let token = parts[0];
        let mut secs = 0u32;
        for part in token.split(':') {
            secs = secs * 60 + part.parse::<u32>().ok()?;
        }
        Some(secs)
    });
    Some(DownloadProgress { percent: pct, eta_sec: eta })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_progress_basic() {
        let p = parse_progress("[download]  42.3% of 10.5MiB at 1.2MiB/s ETA 00:05").unwrap();
        assert!((p.percent - 42.3).abs() < 0.01);
        assert_eq!(p.eta_sec, Some(5));
    }

    #[test]
    fn parse_progress_ignores_non_progress_line() {
        assert!(parse_progress("[youtube] abc: Downloading").is_none());
    }
}
```

- [ ] **Step 2: Registra `pub mod download_manager;` in `lib.rs`**

- [ ] **Step 3: Esegui test**

```bash
cd src-tauri && cargo test download_manager && cd ..
```

Expected: 2 PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/download_manager.rs src-tauri/src/lib.rs
git commit -m "feat: DownloadManager with yt-dlp progress parsing"
```

---

## Task 11: Tauri commands layer

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`

- [ ] **Step 1: Crea `src-tauri/src/commands.rs`**

```rust
use crate::ai::anthropic::AnthropicProvider;
use crate::ai::AIProvider;
use crate::domain::*;
use crate::download_manager::DownloadManager;
use crate::error::{AppError, AppResult};
use crate::extractor::BRollExtractor;
use crate::project_store::ProjectStore;
use crate::settings_store::SettingsStore;
use crate::video_processor::VideoProcessor;
use crate::youtube_search::YouTubeSearch;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::RwLock;

pub struct AppState {
    pub current_project: RwLock<Option<Arc<ProjectStore>>>,
    pub projects_root: PathBuf,
    pub bin_paths: BinPaths,
}

#[derive(Clone)]
pub struct BinPaths {
    pub ytdlp: String,
    pub ffmpeg: String,
    pub font: PathBuf,
}

fn projects_root() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join("B-Roll Projects")
}

#[tauri::command]
pub async fn project_create(
    state: State<'_, AppState>,
    name: String,
    text_voiceover: String,
) -> AppResult<Project> {
    if name.trim().is_empty() {
        return Err(AppError::InvalidInput("name is empty".into()));
    }
    let voiceover = VoiceoverInput {
        kind: VoiceoverKind::Text,
        path: "voiceover.txt".into(),
        duration_sec: None,
    };
    tokio::fs::create_dir_all(&state.projects_root).await?;
    let store = ProjectStore::create(&state.projects_root, &name, voiceover).await?;
    let project_dir = state.projects_root.join(slug::slugify(&name));
    tokio::fs::write(project_dir.join("voiceover.txt"), &text_voiceover).await?;
    let project = store.project().await;
    *state.current_project.write().await = Some(Arc::new(store));
    Ok(project)
}

#[tauri::command]
pub async fn project_load(
    state: State<'_, AppState>,
    slug: String,
) -> AppResult<Project> {
    let dir = state.projects_root.join(&slug);
    if !dir.exists() {
        return Err(AppError::ProjectNotFound(slug));
    }
    let store = ProjectStore::load(&dir).await?;
    let project = store.project().await;
    *state.current_project.write().await = Some(Arc::new(store));
    Ok(project)
}

#[tauri::command]
pub async fn project_list(state: State<'_, AppState>) -> AppResult<Vec<Project>> {
    let mut out = Vec::new();
    if !state.projects_root.exists() {
        return Ok(out);
    }
    let mut entries = tokio::fs::read_dir(&state.projects_root).await?;
    while let Some(entry) = entries.next_entry().await? {
        if !entry.file_type().await?.is_dir() { continue; }
        let pj = entry.path().join("project.json");
        if pj.exists() {
            if let Ok(bytes) = tokio::fs::read(&pj).await {
                if let Ok(p) = serde_json::from_slice::<Project>(&bytes) { out.push(p); }
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

#[tauri::command]
pub async fn settings_set_anthropic_key(key: String) -> AppResult<()> {
    SettingsStore::set_anthropic_key(&key)
}

#[tauri::command]
pub async fn settings_test_anthropic() -> AppResult<bool> {
    let key = SettingsStore::get_anthropic_key()?
        .ok_or_else(|| AppError::InvalidInput("no anthropic key set".into()))?;
    let provider = AnthropicProvider::new(key);
    let result = provider.complete("Reply with just OK", "ping").await?;
    Ok(result.to_lowercase().contains("ok"))
}

#[tauri::command]
pub async fn extraction_run(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<BRollPoint>> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone().ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    let project = store.project().await;
    let voiceover_path = state.projects_root.join(&project.slug).join(&project.voiceover.path);
    let transcript = tokio::fs::read_to_string(&voiceover_path).await?;

    let key = SettingsStore::get_anthropic_key()?
        .ok_or_else(|| AppError::InvalidInput("anthropic api key not set".into()))?;
    let provider: Arc<dyn AIProvider> = Arc::new(AnthropicProvider::new(key));
    let extractor = BRollExtractor::new(provider);
    app.emit("extraction.progress", serde_json::json!({"step":"calling_ai","message":"Calling Anthropic API"})).ok();
    let points = extractor.extract(&transcript).await?;

    for p in &points {
        store.add_broll_point(p.clone()).await?;
    }
    let project_after = store.project().await;
    app.emit("project.updated", &project_after).ok();
    Ok(points)
}

#[tauri::command]
pub async fn search_run(
    state: State<'_, AppState>,
    keyword: String,
) -> AppResult<Vec<VideoCandidate>> {
    let search = YouTubeSearch::new(state.bin_paths.ytdlp.clone());
    search.search(&keyword, 9).await
}

#[tauri::command]
pub async fn pick_video(
    app: AppHandle,
    state: State<'_, AppState>,
    point_id: String,
    candidate: VideoCandidate,
) -> AppResult<String> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone().ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    let project = store.project().await;
    let project_dir = state.projects_root.join(&project.slug);
    let clips_dir = project_dir.join("clips");
    let raw_dir = project_dir.join("cache").join("downloads");

    store.update_broll_point(&point_id, |bp| {
        bp.status = BRollStatus::Downloading;
        bp.selected_video = Some(candidate.clone());
    }).await?;
    app.emit("project.updated", &store.project().await).ok();

    let dl = DownloadManager::new(state.bin_paths.ytdlp.clone());
    let pid = point_id.clone();
    let app_clone = app.clone();
    let raw_path = dl.download(&candidate.url, &raw_dir, move |p| {
        app_clone.emit("download.progress", serde_json::json!({
            "point_id": pid,
            "percent": p.percent,
            "eta_sec": p.eta_sec,
        })).ok();
    }).await?;

    let idx = project.broll_points.iter().position(|b| b.id == point_id).unwrap_or(0);
    let safe_kw = slug::slugify(&candidate.title);
    let final_name = format!("{:04}_{safe_kw}.mp4", idx + 1);
    let final_path = clips_dir.join(&final_name);

    let vp = VideoProcessor::new(state.bin_paths.ffmpeg.clone(), state.bin_paths.font.clone());
    vp.apply_copyright_overlay(&raw_path, &final_path, &candidate.channel).await?;

    let final_rel = format!("clips/{final_name}");
    store.update_broll_point(&point_id, |bp| {
        bp.status = BRollStatus::Done;
        bp.output_clip = Some(final_rel.clone());
    }).await?;
    app.emit("project.updated", &store.project().await).ok();
    app.emit("download.complete", serde_json::json!({"point_id": point_id, "output": final_rel})).ok();
    Ok(final_rel)
}

#[tauri::command]
pub async fn skip_point(
    app: AppHandle,
    state: State<'_, AppState>,
    point_id: String,
) -> AppResult<()> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone().ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    store.update_broll_point(&point_id, |bp| {
        bp.status = BRollStatus::Skipped;
    }).await?;
    app.emit("project.updated", &store.project().await).ok();
    Ok(())
}

#[tauri::command]
pub async fn open_project_folder(state: State<'_, AppState>) -> AppResult<()> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone().ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    let project = store.project().await;
    let dir = state.projects_root.join(&project.slug);
    #[cfg(target_os = "macos")]
    tokio::process::Command::new("open").arg(&dir).status().await
        .map_err(|e| AppError::Subprocess(e.to_string()))?;
    Ok(())
}

pub fn build_state() -> AppState {
    AppState {
        current_project: RwLock::new(None),
        projects_root: projects_root(),
        bin_paths: BinPaths {
            ytdlp: which::which("yt-dlp").map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| "yt-dlp".into()),
            ffmpeg: which::which("ffmpeg").map(|p| p.to_string_lossy().into_owned()).unwrap_or_else(|_| "ffmpeg".into()),
            font: PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/fonts/Inter-Regular.ttf"),
        },
    }
}
```

Sposta `which` da `[dev-dependencies]` a `[dependencies]` in `Cargo.toml`.

- [ ] **Step 2: Registra `pub mod commands;` in `lib.rs`**

- [ ] **Step 3: Aggiorna `src-tauri/src/main.rs`**

```rust
use video_broll_app_lib::commands::*;

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(build_state())
        .invoke_handler(tauri::generate_handler![
            project_create,
            project_load,
            project_list,
            settings_set_anthropic_key,
            settings_test_anthropic,
            extraction_run,
            search_run,
            pick_video,
            skip_point,
            open_project_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Verifica compilazione**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: build success.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/commands.rs src-tauri/src/lib.rs src-tauri/src/main.rs
git commit -m "feat: Tauri commands layer wiring all backend modules"
```

---

## Task 12: Frontend — Zustand store + IPC wrapper

**Files:**
- Create: `src/store.ts`, `src/ipc.ts`, `src/types.ts`
- Modify: `package.json`

- [ ] **Step 1: Installa Zustand**

```bash
npm install zustand
```

- [ ] **Step 2: Crea `src/types.ts`**

```ts
export type BRollStatus =
  | "pending" | "searching" | "picking" | "downloading" | "done" | "skipped" | "error";

export interface VideoCandidate {
  video_id: string;
  title: string;
  channel: string;
  duration_sec: number;
  thumb_url: string;
  url: string;
}

export interface BRollPoint {
  id: string;
  phrase: string;
  t_start: number | null;
  t_end: number | null;
  keywords: string[];
  active_keyword: string;
  status: BRollStatus;
  selected_video: VideoCandidate | null;
  output_clip: string | null;
}

export interface Project {
  version: number;
  slug: string;
  name: string;
  created_at: string;
  voiceover: { kind: "audio" | "text"; path: string; duration_sec: number | null };
  transcript: { start: number; end: number; text: string }[];
  broll_points: BRollPoint[];
}

export interface DownloadProgressEvent {
  point_id: string;
  percent: number;
  eta_sec: number | null;
}
```

- [ ] **Step 3: Crea `src/ipc.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BRollPoint, DownloadProgressEvent, Project, VideoCandidate } from "./types";

export const ipc = {
  projectCreate: (name: string, text_voiceover: string) =>
    invoke<Project>("project_create", { name, textVoiceover: text_voiceover }),
  projectLoad: (slug: string) => invoke<Project>("project_load", { slug }),
  projectList: () => invoke<Project[]>("project_list"),
  settingsSetAnthropicKey: (key: string) =>
    invoke<void>("settings_set_anthropic_key", { key }),
  settingsTestAnthropic: () => invoke<boolean>("settings_test_anthropic"),
  extractionRun: () => invoke<BRollPoint[]>("extraction_run"),
  searchRun: (keyword: string) => invoke<VideoCandidate[]>("search_run", { keyword }),
  pickVideo: (point_id: string, candidate: VideoCandidate) =>
    invoke<string>("pick_video", { pointId: point_id, candidate }),
  skipPoint: (point_id: string) => invoke<void>("skip_point", { pointId: point_id }),
  openProjectFolder: () => invoke<void>("open_project_folder"),
};

export const events = {
  onProjectUpdated: (cb: (p: Project) => void): Promise<UnlistenFn> =>
    listen<Project>("project.updated", (e) => cb(e.payload)),
  onDownloadProgress: (cb: (e: DownloadProgressEvent) => void): Promise<UnlistenFn> =>
    listen<DownloadProgressEvent>("download.progress", (e) => cb(e.payload)),
  onDownloadComplete: (cb: (e: { point_id: string; output: string }) => void): Promise<UnlistenFn> =>
    listen<{ point_id: string; output: string }>("download.complete", (e) => cb(e.payload)),
};
```

- [ ] **Step 4: Crea `src/store.ts`**

```ts
import { create } from "zustand";
import type { BRollPoint, Project, VideoCandidate, DownloadProgressEvent } from "./types";

interface State {
  project: Project | null;
  currentIndex: number;
  searchResults: Record<string, VideoCandidate[]>;
  downloads: Record<string, DownloadProgressEvent>;
  setProject: (p: Project | null) => void;
  setCurrentIndex: (i: number) => void;
  setSearchResults: (point_id: string, results: VideoCandidate[]) => void;
  setDownloadProgress: (e: DownloadProgressEvent) => void;
}

export const useStore = create<State>((set) => ({
  project: null,
  currentIndex: 0,
  searchResults: {},
  downloads: {},
  setProject: (project) => set({ project }),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setSearchResults: (point_id, results) =>
    set((s) => ({ searchResults: { ...s.searchResults, [point_id]: results } })),
  setDownloadProgress: (e) =>
    set((s) => ({ downloads: { ...s.downloads, [e.point_id]: e } })),
}));
```

- [ ] **Step 5: Verifica TS compila**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/store.ts src/ipc.ts src/types.ts
git commit -m "feat: frontend Zustand store + Tauri IPC wrapper"
```

---

## Task 13: Frontend — Router e App shell

**Files:**
- Create: `src/App.tsx` (sostituisci esistente)
- Modify: `package.json`

- [ ] **Step 1: Installa react-router-dom**

```bash
npm install react-router-dom@6
```

- [ ] **Step 2: Sostituisci `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { events } from "./ipc";
import { useStore } from "./store";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ImportPage } from "./pages/ImportPage";
import { ReviewPage } from "./pages/ReviewPage";
import { PickerPage } from "./pages/PickerPage";
import { SummaryPage } from "./pages/SummaryPage";

export default function App() {
  const setProject = useStore((s) => s.setProject);
  const setDownloadProgress = useStore((s) => s.setDownloadProgress);

  useEffect(() => {
    let off1: (() => void) | undefined;
    let off2: (() => void) | undefined;
    events.onProjectUpdated(setProject).then((u) => { off1 = u; });
    events.onDownloadProgress(setDownloadProgress).then((u) => { off2 = u; });
    return () => { off1?.(); off2?.(); };
  }, [setProject, setDownloadProgress]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/picker" element={<PickerPage />} />
        <Route path="/summary" element={<SummaryPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Crea placeholder pages (stub minimi)**

Per ognuno di `ProjectsPage.tsx`, `SettingsPage.tsx`, `ImportPage.tsx`, `ReviewPage.tsx`, `PickerPage.tsx`, `SummaryPage.tsx` crea in `src/pages/` con:

```tsx
// src/pages/ProjectsPage.tsx (esempio, ripeti per ogni page con il nome corretto)
export function ProjectsPage() {
  return <div className="p-8"><h1 className="text-2xl">Projects (stub)</h1></div>;
}
```

- [ ] **Step 4: Verifica build dev**

```bash
npm run tauri dev
```

Expected: app si apre su `/projects` con "Projects (stub)".

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/App.tsx src/pages/
git commit -m "feat: app shell with router + page stubs"
```

---

## Task 14: ProjectsPage — lista + nuovo progetto

**Files:**
- Modify: `src/pages/ProjectsPage.tsx`

- [ ] **Step 1: Implementa `src/pages/ProjectsPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";
import type { Project } from "../types";

export function ProjectsPage() {
  const nav = useNavigate();
  const setProject = useStore((s) => s.setProject);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ipc.projectList().then((p) => { setProjects(p); setLoading(false); });
  }, []);

  const open = async (slug: string) => {
    const p = await ipc.projectLoad(slug);
    setProject(p);
    nav("/picker");
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">B-Roll Projects</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav("/settings")}>Settings</Button>
          <Button onClick={() => nav("/import")}>+ New project</Button>
        </div>
      </header>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-lg mb-2">No projects yet</p>
          <p className="text-muted-foreground mb-6">Create your first project to start picking B-Roll.</p>
          <Button onClick={() => nav("/import")}>Create project</Button>
        </div>
      ) : (
        <ul className="grid gap-4">
          {projects.map((p) => (
            <li key={p.slug} className="border border-border rounded-lg p-4 cursor-pointer hover:bg-muted transition" onClick={() => open(p.slug)}>
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted-foreground">{new Date(p.created_at).toLocaleString()} • {p.broll_points.length} B-Roll points</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verifica visivamente**

```bash
npm run tauri dev
```

Expected: vedi pagina con "No projects yet" all'inizio, bottoni "+ New project" e "Settings".

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProjectsPage.tsx
git commit -m "feat: ProjectsPage with list + create flow"
```

---

## Task 15: SettingsPage — API key Anthropic

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Implementa `src/pages/SettingsPage.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SettingsPage() {
  const nav = useNavigate();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<"idle"|"saving"|"testing"|"ok"|"error">("idle");
  const [err, setErr] = useState<string>("");

  const save = async () => {
    if (!key.startsWith("sk-ant-")) {
      setStatus("error"); setErr("API key should start with sk-ant-");
      return;
    }
    setStatus("saving");
    try {
      await ipc.settingsSetAnthropicKey(key);
      setStatus("testing");
      const ok = await ipc.settingsTestAnthropic();
      if (ok) { setStatus("ok"); setErr(""); }
      else { setStatus("error"); setErr("API key set but test ping did not succeed."); }
    } catch (e) {
      setStatus("error"); setErr(String(e));
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <header className="mb-8">
        <Button variant="ghost" onClick={() => nav("/projects")}>← Back</Button>
        <h1 className="text-3xl font-bold mt-4">Settings</h1>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Anthropic API key</h2>
        <p className="text-muted-foreground text-sm">
          Get one at <span className="underline">console.anthropic.com</span>. Stored in your system keychain, never on disk.
        </p>
        <Input
          type="password"
          placeholder="sk-ant-..."
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button onClick={save} disabled={status === "saving" || status === "testing"}>
          {status === "saving" ? "Saving…" : status === "testing" ? "Testing…" : "Save & test"}
        </Button>
        {status === "ok" && <p className="text-green-600 text-sm">Key saved and verified ✓</p>}
        {status === "error" && <p className="text-red-600 text-sm">{err}</p>}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Test manuale**

```bash
npm run tauri dev
```

Vai su Settings, inserisci la tua API key Anthropic reale, click "Save & test". Expected: "Key saved and verified ✓".

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: SettingsPage with API key save + test"
```

---

## Task 16: ImportPage — textarea voiceover + crea progetto

**Files:**
- Modify: `src/pages/ImportPage.tsx`

- [ ] **Step 1: Implementa `src/pages/ImportPage.tsx`**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ImportPage() {
  const nav = useNavigate();
  const setProject = useStore((s) => s.setProject);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!name.trim() || !text.trim()) {
      setErr("Name and voiceover are required.");
      return;
    }
    setBusy(true); setErr("");
    try {
      const project = await ipc.projectCreate(name.trim(), text.trim());
      setProject(project);
      nav("/review");
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <header className="mb-8">
        <Button variant="ghost" onClick={() => nav("/projects")}>← Back</Button>
        <h1 className="text-3xl font-bold mt-4">New project</h1>
      </header>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Project name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Episode 12" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Voiceover transcript</label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your voiceover transcript here…"
            rows={16}
            className="font-mono text-sm"
          />
        </div>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <Button onClick={submit} disabled={busy}>
          {busy ? "Creating…" : "Create & extract B-Roll points"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test manuale**

```bash
npm run tauri dev
```

Crea un progetto con un transcript di esempio (es. 3-4 frasi). Expected: si naviga a Review, anche se Review è ancora stub.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ImportPage.tsx
git commit -m "feat: ImportPage with project creation form"
```

---

## Task 17: ReviewPage — mostra punti estratti dall'AI

**Files:**
- Modify: `src/pages/ReviewPage.tsx`

- [ ] **Step 1: Implementa `src/pages/ReviewPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";

export function ReviewPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (project && project.broll_points.length === 0) {
      run();
    } else if (project && project.broll_points.length > 0) {
      setDone(true);
    }
  }, [project?.slug]);

  const run = async () => {
    setBusy(true); setErr("");
    try {
      await ipc.extractionRun();
      setDone(true);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!project) return <div className="p-8">No project loaded.</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <Button variant="ghost" onClick={() => nav("/projects")}>← Projects</Button>
        <h1 className="text-3xl font-bold mt-4">{project.name}</h1>
      </header>

      {busy && <p className="text-muted-foreground">Calling AI to extract B-Roll points…</p>}
      {err && <p className="text-red-600">{err}</p>}

      {done && (
        <>
          <h2 className="text-xl font-semibold mb-4">{project.broll_points.length} B-Roll points found</h2>
          <ul className="space-y-3 mb-8">
            {project.broll_points.map((p, i) => (
              <li key={p.id} className="border border-border rounded-lg p-4">
                <div className="flex justify-between mb-2">
                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  <span className="text-xs text-muted-foreground capitalize">{p.status}</span>
                </div>
                <p className="font-medium mb-2">"{p.phrase}"</p>
                <div className="flex gap-2 flex-wrap">
                  {p.keywords.map((kw) => (
                    <span key={kw} className={`text-xs px-2 py-1 rounded ${kw === p.active_keyword ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{kw}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <Button size="lg" onClick={() => nav("/picker")}>Start picking videos →</Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Test end-to-end (richiede API key)**

Crea un progetto con un transcript reale (es. 5-6 frasi su un tema chiaro). Expected: dopo qualche secondo vedi i punti estratti con keyword.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ReviewPage.tsx
git commit -m "feat: ReviewPage with AI extraction trigger + results display"
```

---

## Task 18: Component KeywordHeader

**Files:**
- Create: `src/components/KeywordHeader.tsx`

- [ ] **Step 1: Crea `src/components/KeywordHeader.tsx`**

```tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  keyword: string;
  current: number;
  total: number;
  onPrev: () => void;
  onSkip: () => void;
  onChange: (next: string) => void;
}

export function KeywordHeader({ keyword, current, total, onPrev, onSkip, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(keyword);

  useEffect(() => { setDraft(keyword); }, [keyword]);

  const commit = () => {
    if (draft.trim() && draft.trim() !== keyword) onChange(draft.trim());
    setEditing(false);
  };

  return (
    <header className="flex items-center gap-4 px-6 py-4 border-b border-border">
      <Button variant="ghost" size="sm" onClick={onPrev}>←</Button>
      <span className="text-xs text-muted-foreground">{current + 1}/{total}</span>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(keyword); setEditing(false); } }}
          className="text-2xl font-bold flex-1"
        />
      ) : (
        <h1 className="text-2xl font-bold flex-1 truncate" onDoubleClick={() => setEditing(true)}>{keyword}</h1>
      )}
      <Button variant="outline" size="sm" onClick={() => setEditing(true)} title="Edit keyword (e)">✎</Button>
      <Button variant="outline" size="sm" onClick={onSkip} title="Skip (→)">Skip</Button>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/KeywordHeader.tsx
git commit -m "feat: KeywordHeader component"
```

---

## Task 19: Component VideoGrid + HoverStoryboard

**Files:**
- Create: `src/components/VideoGrid.tsx`, `src/components/HoverStoryboard.tsx`

- [ ] **Step 1: Crea `src/components/HoverStoryboard.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";

interface Props {
  videoId: string;
  durationSec: number;
}

export function HoverStoryboard({ videoId, durationSec }: Props) {
  const [hovered, setHovered] = useState(false);
  const [frame, setFrame] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hovered) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % 100), 80);
    return () => clearInterval(id);
  }, [hovered]);

  const url = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const sbUrl = durationSec > 30
    ? `https://i.ytimg.com/sb/${videoId}/storyboard3_L1/M0.jpg`
    : url;

  const col = frame % 10;
  const row = Math.floor(frame / 10);

  return (
    <div
      ref={ref}
      className="relative aspect-video bg-muted rounded-md overflow-hidden cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setFrame(0); }}
      style={
        hovered
          ? {
              backgroundImage: `url(${sbUrl})`,
              backgroundSize: "1000% 1000%",
              backgroundPosition: `${col * 11.11}% ${row * 11.11}%`,
            }
          : { backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center" }
      }
    />
  );
}
```

- [ ] **Step 2: Crea `src/components/VideoGrid.tsx`**

```tsx
import type { VideoCandidate } from "../types";
import { HoverStoryboard } from "./HoverStoryboard";

interface Props {
  results: VideoCandidate[];
  selectedId: string | null;
  onSelect: (c: VideoCandidate) => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoGrid({ results, selectedId, onSelect }: Props) {
  if (results.length === 0) {
    return <p className="text-muted-foreground p-8">No results. Try a different keyword.</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-3 p-4 overflow-y-auto">
      {results.map((r, i) => {
        const selected = selectedId === r.video_id;
        return (
          <button
            key={r.video_id}
            onClick={() => onSelect(r)}
            className={`text-left rounded-lg border-2 transition ${selected ? "border-primary" : "border-transparent hover:border-border"}`}
          >
            <div className="relative">
              <HoverStoryboard videoId={r.video_id} durationSec={r.duration_sec} />
              <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                {formatDuration(r.duration_sec)}
              </span>
              <span className="absolute top-1 left-1 bg-black/80 text-white text-xs w-6 h-6 rounded flex items-center justify-center">
                {i + 1}
              </span>
            </div>
            <div className="p-2">
              <p className="text-sm font-medium line-clamp-2">{r.title}</p>
              <p className="text-xs text-muted-foreground truncate">{r.channel}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/HoverStoryboard.tsx src/components/VideoGrid.tsx
git commit -m "feat: VideoGrid + HoverStoryboard components"
```

---

## Task 20: Component PreviewPane (iframe YouTube)

**Files:**
- Create: `src/components/PreviewPane.tsx`
- Modify: `src-tauri/tauri.conf.json` (CSP)

- [ ] **Step 1: Configura CSP per consentire YouTube embed**

Modifica `src-tauri/tauri.conf.json`, sezione `app.security`:

```json
"security": {
  "csp": "default-src 'self' tauri: ipc: http://ipc.localhost; img-src 'self' data: https://i.ytimg.com https://*.ytimg.com asset: http://asset.localhost; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; media-src 'self' https://*.googlevideo.com; connect-src 'self' ipc: http://ipc.localhost https://api.anthropic.com; style-src 'self' 'unsafe-inline'"
}
```

- [ ] **Step 2: Crea `src/components/PreviewPane.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import type { VideoCandidate } from "../types";
import { Button } from "@/components/ui/button";

interface Props {
  candidate: VideoCandidate | null;
  onCommit: () => void;
  busy: boolean;
}

export function PreviewPane({ candidate, onCommit, busy }: Props) {
  const [muted, setMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setMuted(true);
  }, [candidate?.video_id]);

  if (!candidate) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
        <p className="text-lg mb-2">Select a video to preview</p>
        <p className="text-sm">Click any thumbnail or press 1–9</p>
      </div>
    );
  }

  const src = `https://www.youtube-nocookie.com/embed/${candidate.video_id}?autoplay=1&mute=${muted ? 1 : 0}&modestbranding=1&rel=0`;

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        <iframe
          ref={iframeRef}
          key={candidate.video_id + (muted ? "-m" : "-u")}
          src={src}
          title={candidate.title}
          allow="autoplay; encrypted-media"
          className="w-full h-full"
        />
      </div>
      <div>
        <h3 className="font-semibold leading-tight">{candidate.title}</h3>
        <p className="text-sm text-muted-foreground">by © {candidate.channel}</p>
      </div>
      <div className="flex gap-2 mt-auto">
        <Button onClick={onCommit} disabled={busy} className="flex-1">
          {busy ? "Downloading…" : "Download & use ✓"}
        </Button>
        <Button variant="outline" onClick={() => setMuted(!muted)} title="Toggle audio (m)">
          {muted ? "🔇" : "🔊"}
        </Button>
        <Button variant="outline" onClick={() => window.open(candidate.url, "_blank")} title="Open on YouTube">↗</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/PreviewPane.tsx src-tauri/tauri.conf.json
git commit -m "feat: PreviewPane with YouTube iframe + CSP whitelist"
```

---

## Task 21: Component TimelineStrip + test vitest

**Files:**
- Create: `src/components/TimelineStrip.tsx`, `src/components/TimelineStrip.test.tsx`
- Modify: `package.json`, `vite.config.ts`

- [ ] **Step 1: Installa Vitest + testing-library**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/ui
```

- [ ] **Step 2: Aggiorna `vite.config.ts` per testing**

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 3: Crea `src/test-setup.ts`**

```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 4: Crea il test prima del componente in `src/components/TimelineStrip.test.tsx`**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { TimelineStrip } from "./TimelineStrip";
import type { BRollPoint } from "../types";

const point = (id: string, status: BRollPoint["status"]): BRollPoint => ({
  id, phrase: `phrase ${id}`, t_start: null, t_end: null,
  keywords: [], active_keyword: "", status,
  selected_video: null, output_clip: null,
});

test("renders one cell per point", () => {
  render(
    <TimelineStrip
      points={[point("a", "pending"), point("b", "done")]}
      currentIndex={0}
      onJump={() => {}}
    />
  );
  expect(screen.getAllByRole("button")).toHaveLength(2);
});

test("clicking a cell calls onJump with the index", () => {
  const onJump = vi.fn();
  render(
    <TimelineStrip
      points={[point("a", "pending"), point("b", "done"), point("c", "skipped")]}
      currentIndex={0}
      onJump={onJump}
    />
  );
  fireEvent.click(screen.getAllByRole("button")[2]);
  expect(onJump).toHaveBeenCalledWith(2);
});
```

- [ ] **Step 5: Esegui test → deve fallire**

```bash
npx vitest run TimelineStrip
```

Expected: FAIL (componente non esiste).

- [ ] **Step 6: Crea `src/components/TimelineStrip.tsx`**

```tsx
import type { BRollPoint } from "../types";

interface Props {
  points: BRollPoint[];
  currentIndex: number;
  onJump: (i: number) => void;
}

const STATUS_CLASS: Record<BRollPoint["status"], string> = {
  pending: "bg-muted",
  searching: "bg-muted",
  picking: "bg-muted",
  downloading: "bg-yellow-500 animate-pulse",
  done: "bg-green-500",
  skipped: "bg-gray-400",
  error: "bg-red-500",
};

export function TimelineStrip({ points, currentIndex, onJump }: Props) {
  return (
    <div className="flex items-center gap-1 px-6 py-3 border-t border-border overflow-x-auto">
      {points.map((p, i) => {
        const isCurrent = i === currentIndex;
        return (
          <button
            key={p.id}
            onClick={() => onJump(i)}
            title={`#${i + 1}: ${p.phrase}`}
            className={`h-6 w-6 rounded-sm transition ${STATUS_CLASS[p.status]} ${isCurrent ? "ring-2 ring-primary ring-offset-2" : ""}`}
          />
        );
      })}
      <span className="ml-3 text-xs text-muted-foreground whitespace-nowrap">
        {currentIndex + 1}/{points.length} points
      </span>
    </div>
  );
}
```

- [ ] **Step 7: Esegui test → deve passare**

```bash
npx vitest run TimelineStrip
```

Expected: 2 PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/test-setup.ts src/components/TimelineStrip.tsx src/components/TimelineStrip.test.tsx
git commit -m "feat: TimelineStrip component + vitest setup"
```

---

## Task 22: PickerPage — orchestratore principale

**Files:**
- Modify: `src/pages/PickerPage.tsx`

- [ ] **Step 1: Implementa `src/pages/PickerPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ipc, events } from "../ipc";
import { useStore } from "../store";
import { KeywordHeader } from "../components/KeywordHeader";
import { VideoGrid } from "../components/VideoGrid";
import { PreviewPane } from "../components/PreviewPane";
import { TimelineStrip } from "../components/TimelineStrip";
import type { VideoCandidate } from "../types";

export function PickerPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  const currentIndex = useStore((s) => s.currentIndex);
  const setCurrentIndex = useStore((s) => s.setCurrentIndex);
  const searchResults = useStore((s) => s.searchResults);
  const setSearchResults = useStore((s) => s.setSearchResults);

  const [selected, setSelected] = useState<VideoCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [editedKeywords, setEditedKeywords] = useState<Record<string, string>>({});

  const point = project?.broll_points[currentIndex];
  const activeKeyword = point ? (editedKeywords[point.id] ?? point.active_keyword) : "";

  useEffect(() => {
    if (!project) return;
    const next = project.broll_points.findIndex((p) => p.status !== "done" && p.status !== "skipped");
    if (next >= 0) setCurrentIndex(next);
  }, [project?.slug]);

  useEffect(() => {
    if (!point) return;
    setSelected(null);
    if (searchResults[point.id]) return;
    runSearch(activeKeyword, point.id);
  }, [point?.id, activeKeyword]);

  useEffect(() => {
    const off = events.onDownloadComplete(() => {
      goNext();
    });
    return () => { off.then((f) => f()); };
  }, [currentIndex]);

  const runSearch = async (kw: string, pointId: string) => {
    setSearchErr("");
    try {
      const results = await ipc.searchRun(kw);
      setSearchResults(pointId, results);
    } catch (e) {
      setSearchErr(String(e));
    }
  };

  const onChangeKeyword = async (kw: string) => {
    if (!point || !project) return;
    setEditedKeywords((m) => ({ ...m, [point.id]: kw }));
    setSearchResults(point.id, []);
    runSearch(kw, point.id);
  };

  const goPrev = () => setCurrentIndex(Math.max(0, currentIndex - 1));
  const goNext = () => {
    if (!project) return;
    if (currentIndex + 1 >= project.broll_points.length) nav("/summary");
    else setCurrentIndex(currentIndex + 1);
  };

  const skipCurrent = async () => {
    if (!point) return;
    await ipc.skipPoint(point.id);
    goNext();
  };

  const commitSelected = async () => {
    if (!point || !selected) return;
    setBusy(true);
    try {
      await ipc.pickVideo(point.id, selected);
    } catch (e) {
      console.error(e);
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!project || !point) return;
      const results = searchResults[point.id] || [];
      if (e.key >= "1" && e.key <= "9") {
        const i = parseInt(e.key) - 1;
        if (results[i]) setSelected(results[i]);
      } else if (e.key === "Enter") commitSelected();
      else if (e.key === "ArrowRight") skipCurrent();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [point?.id, selected, searchResults, currentIndex]);

  if (!project) return <div className="p-8">No project loaded.</div>;
  if (!point) return <div className="p-8">No B-Roll point at index {currentIndex}.</div>;

  const results = searchResults[point.id] || [];

  return (
    <div className="flex flex-col h-screen">
      <KeywordHeader
        keyword={activeKeyword}
        current={currentIndex}
        total={project.broll_points.length}
        onPrev={goPrev}
        onSkip={skipCurrent}
        onChange={onChangeKeyword}
      />
      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {searchErr ? <p className="p-8 text-red-600">{searchErr}</p> : null}
          {!searchResults[point.id] && !searchErr ? <p className="p-8 text-muted-foreground">Searching YouTube…</p> : null}
          {results.length > 0 && (
            <VideoGrid
              results={results}
              selectedId={selected?.video_id ?? null}
              onSelect={setSelected}
            />
          )}
        </div>
        <aside className="w-[420px] border-l border-border">
          <PreviewPane candidate={selected} onCommit={commitSelected} busy={busy} />
        </aside>
      </main>
      <TimelineStrip
        points={project.broll_points}
        currentIndex={currentIndex}
        onJump={(i) => setCurrentIndex(i)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Test manuale end-to-end**

```bash
npm run tauri dev
```

Crea progetto → vedi extraction → click "Start picking videos" → dovresti vedere keyword in alto, grid 3x3, preview pane vuoto. Click su un thumbnail → iframe YouTube parte. Click "Download & use" → dovrebbe scaricare e overlay (controlla `~/B-Roll Projects/<slug>/clips/`).

- [ ] **Step 3: Commit**

```bash
git add src/pages/PickerPage.tsx
git commit -m "feat: PickerPage orchestrator with keyboard nav + auto-advance"
```

---

## Task 23: SummaryPage — clip generati + apri cartella

**Files:**
- Modify: `src/pages/SummaryPage.tsx`

- [ ] **Step 1: Implementa `src/pages/SummaryPage.tsx`**

```tsx
import { useNavigate } from "react-router-dom";
import { ipc } from "../ipc";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";

export function SummaryPage() {
  const nav = useNavigate();
  const project = useStore((s) => s.project);
  if (!project) return <div className="p-8">No project loaded.</div>;

  const done = project.broll_points.filter((p) => p.status === "done");
  const skipped = project.broll_points.filter((p) => p.status === "skipped");

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
      <p className="text-muted-foreground mb-8">
        {done.length} clip generated · {skipped.length} skipped · {project.broll_points.length} total points
      </p>

      <div className="flex gap-3 mb-8">
        <Button onClick={() => ipc.openProjectFolder()}>Open folder</Button>
        <Button variant="outline" onClick={() => nav("/projects")}>Back to projects</Button>
      </div>

      <h2 className="text-xl font-semibold mb-4">Generated clips</h2>
      <ul className="space-y-2">
        {done.map((p, i) => (
          <li key={p.id} className="flex items-center justify-between border border-border rounded-lg p-3">
            <div>
              <p className="text-sm font-medium">{i + 1}. {p.phrase}</p>
              <p className="text-xs text-muted-foreground">{p.output_clip} · © {p.selected_video?.channel}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Test manuale**

Completa un picker run, alla fine arrivi a Summary, click "Open folder" → si apre Finder sulla cartella progetto.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SummaryPage.tsx
git commit -m "feat: SummaryPage with generated clips list"
```

---

## Task 24: ToolchainManager — verifica yt-dlp/ffmpeg al boot

**Files:**
- Create: `src-tauri/src/toolchain_manager.rs`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`, `src-tauri/src/main.rs`

- [ ] **Step 1: Crea `src-tauri/src/toolchain_manager.rs`**

```rust
use crate::error::{AppError, AppResult};

#[derive(Debug, serde::Serialize, Clone)]
pub struct ToolchainStatus {
    pub ytdlp: ToolStatus,
    pub ffmpeg: ToolStatus,
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct ToolStatus {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

pub async fn detect_toolchain() -> ToolchainStatus {
    ToolchainStatus {
        ytdlp: detect_one("yt-dlp", &["--version"]).await,
        ffmpeg: detect_one("ffmpeg", &["-version"]).await,
    }
}

async fn detect_one(name: &str, args: &[&str]) -> ToolStatus {
    let path = match which::which(name) {
        Ok(p) => p,
        Err(_) => return ToolStatus { found: false, path: None, version: None },
    };
    let path_str = path.to_string_lossy().into_owned();
    let output = tokio::process::Command::new(&path).args(args).output().await;
    match output {
        Ok(o) if o.status.success() => {
            let version = String::from_utf8_lossy(&o.stdout).lines().next().map(|l| l.to_string());
            ToolStatus { found: true, path: Some(path_str), version }
        }
        _ => ToolStatus { found: true, path: Some(path_str), version: None },
    }
}
```

Aggiungi `which = "6"` in `[dependencies]` se non già fatto in Task 11.

- [ ] **Step 2: Aggiungi command in `commands.rs`**

```rust
use crate::toolchain_manager;

#[tauri::command]
pub async fn toolchain_status() -> AppResult<toolchain_manager::ToolchainStatus> {
    Ok(toolchain_manager::detect_toolchain().await)
}
```

E aggiungilo a `invoke_handler![]` in `main.rs`. Aggiungi `pub mod toolchain_manager;` in `lib.rs`.

- [ ] **Step 3: Mostra warning in UI se mancante**

Modifica `src/pages/ProjectsPage.tsx` per chiamare `invoke<ToolchainStatus>("toolchain_status")` al mount; se `ytdlp.found===false` o `ffmpeg.found===false`, mostra banner rosso con istruzioni:

```tsx
import { invoke } from "@tauri-apps/api/core";
// ...
const [tc, setTc] = useState<{ytdlp:{found:boolean};ffmpeg:{found:boolean}} | null>(null);
useEffect(() => { invoke<typeof tc>("toolchain_status").then(setTc); }, []);
// In render, sopra header:
{tc && (!tc.ytdlp.found || !tc.ffmpeg.found) && (
  <div className="bg-red-100 text-red-900 p-4 rounded mb-4">
    Missing tools: {!tc.ytdlp.found && "yt-dlp"} {!tc.ffmpeg.found && "ffmpeg"}.
    Install with <code>brew install yt-dlp ffmpeg</code> on macOS.
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/toolchain_manager.rs src-tauri/src/lib.rs src-tauri/src/commands.rs src-tauri/src/main.rs src/pages/ProjectsPage.tsx
git commit -m "feat: toolchain detection + UI warning when yt-dlp/ffmpeg missing"
```

---

## Task 25: Test E2E manuale + smoke checklist

**Files:**
- Create: `docs/superpowers/QA-checklist-mvp.md`

- [ ] **Step 1: Crea `docs/superpowers/QA-checklist-mvp.md`**

```markdown
# MVP QA Checklist

## Prerequisiti
- [ ] yt-dlp e ffmpeg installati (`brew install yt-dlp ffmpeg`)
- [ ] API key Anthropic salvata via Settings
- [ ] Cartella `~/B-Roll Projects/` non esiste o è vuota

## Happy path
- [ ] App si apre su `/projects` e mostra "No projects yet"
- [ ] Click "+ New project" → form con campi name + textarea voiceover
- [ ] Inserisci nome "QA Test" e ~5 frasi di transcript di esempio
- [ ] Submit → loader → ReviewPage mostra ≥3 punti B-Roll con keyword
- [ ] Click "Start picking videos →" → PickerPage carica
- [ ] Vedi keyword grande in alto, grid 3x3 con thumbnails caricati
- [ ] Hover su thumbnail → vedi storyboards animati (su video >30s)
- [ ] Click su thumbnail → iframe carica e parte autoplay (muted)
- [ ] Click pulsante 🔇 → audio attivo
- [ ] Click "Download & use" → bottone diventa "Downloading…" → automaticamente passi al prossimo punto
- [ ] Verifica file in `~/B-Roll Projects/qa-test/clips/0001_<title>.mp4`
- [ ] Apri il file: ha overlay "© <channel>" in basso a sinistra
- [ ] Premi → durante un punto → si salta al successivo, marker timeline diventa grigio
- [ ] Premi ← → torni indietro
- [ ] Premi 1-9 → seleziona N-esimo video
- [ ] Premi Invio → conferma il selezionato (= "Download & use")
- [ ] Doppio click sulla keyword o ✎ → diventa editabile, modifica e Invio → ri-cerca
- [ ] Completa tutti i punti → arrivi a Summary
- [ ] "Open folder" → si apre Finder sulla cartella progetto

## Errori
- [ ] Settings: API key invalida → "Save & test" mostra errore rosso
- [ ] Picker: keyword senza risultati → "No results. Try a different keyword."
- [ ] Picker: yt-dlp non in PATH → banner rosso in ProjectsPage

## Persistenza
- [ ] Crea progetto, scarica 2 clip, chiudi app
- [ ] Riapri app → progetto compare in lista
- [ ] Click su progetto → torna al primo punto non-done
```

- [ ] **Step 2: Esegui la checklist manualmente**

Apri il documento e spunta tutti i punti. Annota nel file eventuali fallimenti.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/QA-checklist-mvp.md
git commit -m "docs: MVP QA checklist for manual smoke testing"
```

---

## Task 26: README operativo

**Files:**
- Create: `README.md`

- [ ] **Step 1: Crea `README.md`**

```markdown
# Video B-Roll Tool

Desktop tool per generare B-Roll YouTube guidato da AI. Carichi il voiceover, l'AI individua i punti, tu scegli i video, il tool li scarica con overlay copyright.

## Stack
Tauri 2 + React + TypeScript + Rust backend.

## Sviluppo (macOS)

### Prerequisiti
\`\`\`bash
brew install rustup-init && rustup-init -y
brew install node@20
cargo install tauri-cli --version "^2.0"
brew install yt-dlp ffmpeg
\`\`\`

### Setup
\`\`\`bash
git clone <repo>
cd video-broll
npm install
\`\`\`

### Run dev
\`\`\`bash
npm run tauri dev
\`\`\`

### Test
\`\`\`bash
# Rust
cd src-tauri && cargo test
cd src-tauri && cargo test -- --include-ignored  # con yt-dlp/ffmpeg in PATH

# Frontend
npx vitest run
\`\`\`

## Struttura
- \`src-tauri/\` — backend Rust
- \`src/\` — frontend React
- \`docs/superpowers/specs/\` — design specs
- \`docs/superpowers/plans/\` — implementation plans

## Configurazione utente
- API key Anthropic → Settings (salvata in Keychain)
- Progetti → \`~/B-Roll Projects/\`
\`\`\`

- [ ] **Step 2: Commit**

\`\`\`bash
git add README.md
git commit -m "docs: README with dev setup instructions"
\`\`\`

---

## Conclusione MVP

Al termine di questo plan il tool funziona end-to-end su macOS dev:
1. Crea progetto da testo
2. AI (Anthropic) estrae punti + keyword
3. Search yt-dlp 9 risultati
4. Picker con grid + iframe preview + storyboards hover
5. Download + overlay copyright
6. Summary + apri cartella

**Prossimi plan (in ordine consigliato):**
- Plan 2: input audio + whisper.cpp bundlato
- Plan 3: multi-provider AI (OpenAI, Ollama, Claude CLI, Codex CLI)
- Plan 4: export EDL/FCPXML
- Plan 5: build cross-platform firmati + auto-update + onboarding modale
