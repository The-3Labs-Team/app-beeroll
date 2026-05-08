# Multi-source Video Search (Pixabay + Pexels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estendere la search con Pixabay + Pexels come sorgenti opzionali. Quando l'utente inserisce le API key in Settings, i risultati appaiono mischiati con YouTube nella stessa grid del Picker. I clip stock vengono scaricati via HTTP diretto e processati con overlay copyright.

**Architecture:** Trait `VideoSource` con 3 implementazioni (`YouTubeSource`, `PixabaySource`, `PexelsSource`); aggregator `MultiSourceSearch` esegue le sources in parallelo via `futures::future::join_all`, poi interleave round-robin. Download stock via `StockDownloader` (reqwest streaming) parallelo al `DownloadManager` yt-dlp esistente. Settings keyring nuovo per Pixabay/Pexels API key. Frontend: badge sorgente nelle card, player `<video>` nativo per stock.

**Tech Stack:** Rust (tokio, reqwest, async-trait, futures, serde, mockito), TypeScript/React, Tauri 2 IPC.

---

## File Structure

### New files

```
src-tauri/src/
├── search/
│   ├── mod.rs                    # trait VideoSource + MultiSourceSearch + interleave
│   ├── youtube.rs                # YouTubeSource (was youtube_search.rs, refactored)
│   ├── pixabay.rs                # PixabaySource (HTTP API + 2 mocked tests)
│   └── pexels.rs                 # PexelsSource (HTTP API + 2 mocked tests)
└── stock_downloader.rs           # HTTP streaming download (reqwest)
```

### Modified files

- `src-tauri/Cargo.toml` — `futures = "0.3"` aggiunto
- `src-tauri/src/lib.rs` — registra `pub mod search; pub mod stock_downloader;`, rimuove `pub mod youtube_search;`
- `src-tauri/src/domain.rs` — aggiunge `VideoSourceId` enum + estende `VideoCandidate`
- `src-tauri/src/settings_store.rs` — keyring helpers per pixabay/pexels keys
- `src-tauri/src/commands.rs` — comandi nuovi (test/set keys), refactor `search_run` e `pick_video`
- `src/types.ts` — `VideoSourceId` + estensione `VideoCandidate`
- `src/ipc.ts` — 4 metodi nuovi
- `src/components/VideoGrid.tsx` — badge sorgente, channel con prefisso source
- `src/components/PreviewPane.tsx` — player condizionale (iframe vs `<video>`)
- `src/pages/SettingsPage.tsx` — nuova sezione "Sorgenti video aggiuntive"

### Deleted files

- `src-tauri/src/youtube_search.rs` — sostituito da `src-tauri/src/search/youtube.rs`
- `src-tauri/tests/ffmpeg_overlay_test.rs` — IMMUTATO (no changes)

---

## Setup pre-requisiti (manuali, una volta)

Devi avere account su:
- `pixabay.com` — registrati, vai a [Documentazione API](https://pixabay.com/api/docs/), prendi la tua key
- `pexels.com/api/` — registrati, sezione "Get Started", prendi la API key

Senza key i provider sono saltati silenziosamente (test passano comunque grazie ai mock).

---

## Task 1: Aggiungi `futures` a Cargo + estendi domain types

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/domain.rs`
- Modify: `src/types.ts`

- [ ] **Step 1: Aggiungi `futures` a Cargo.toml**

In `src-tauri/Cargo.toml`, sezione `[dependencies]`, aggiungi:
```toml
futures = "0.3"
```

- [ ] **Step 2: Estendi `domain.rs` con `VideoSourceId`**

In `src-tauri/src/domain.rs`, prima di `VideoCandidate`, aggiungi:

```rust
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum VideoSourceId {
    Youtube,
    Pixabay,
    Pexels,
}

impl Default for VideoSourceId {
    fn default() -> Self {
        Self::Youtube
    }
}
```

E modifica `VideoCandidate` aggiungendo `source` e `stream_url`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoCandidate {
    #[serde(default)]
    pub source: VideoSourceId,
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub duration_sec: u32,
    pub thumb_url: String,
    pub url: String,
    #[serde(default)]
    pub stream_url: Option<String>,
}
```

- [ ] **Step 3: Aggiorna `src/types.ts`**

Sostituisci `VideoCandidate` aggiungendo i due campi:

```ts
export type VideoSourceId = "youtube" | "pixabay" | "pexels";

export interface VideoCandidate {
  source: VideoSourceId;
  video_id: string;
  title: string;
  channel: string;
  duration_sec: number;
  thumb_url: string;
  url: string;
  stream_url: string | null;
}
```

- [ ] **Step 4: Verifica compilazione**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo check 2>&1 | tail -10
cd .. && npx tsc --noEmit
```

Expected: entrambi clean. Se cargo fallisce su `VideoCandidate` mancante di `source` nei call site (commands.rs, video_processor.rs, ecc.), questo è atteso — verrà sistemato nei task successivi. Per ora `cargo check` può fallire; **non è bloccante**.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/domain.rs src/types.ts
git commit -m "feat: VideoSourceId enum + extend VideoCandidate with source/stream_url"
```

---

## Task 2: Crea il modulo `search/` con trait + sposta YouTubeSource

**Files:**
- Create: `src-tauri/src/search/mod.rs`
- Create: `src-tauri/src/search/youtube.rs`
- Delete: `src-tauri/src/youtube_search.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Crea `src-tauri/src/search/mod.rs` con trait + aggregator**

```rust
use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::AppResult;
use async_trait::async_trait;
use std::sync::Arc;

pub mod youtube;
pub mod pixabay;
pub mod pexels;

pub use youtube::YouTubeSource;
pub use pixabay::PixabaySource;
pub use pexels::PexelsSource;

#[async_trait]
pub trait VideoSource: Send + Sync {
    fn id(&self) -> VideoSourceId;
    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>>;
}

pub struct MultiSourceSearch {
    sources: Vec<Arc<dyn VideoSource>>,
}

impl MultiSourceSearch {
    pub fn new(sources: Vec<Arc<dyn VideoSource>>) -> Self {
        Self { sources }
    }

    pub async fn search(&self, keyword: &str, per_source: u8) -> Vec<VideoCandidate> {
        let kw = keyword.to_string();
        let futs: Vec<_> = self
            .sources
            .iter()
            .map(|s| {
                let s = s.clone();
                let kw = kw.clone();
                async move { (s.id(), s.search(&kw, per_source).await) }
            })
            .collect();
        let results = futures::future::join_all(futs).await;

        let mut per_source_lists: Vec<Vec<VideoCandidate>> = Vec::new();
        for (id, r) in results {
            match r {
                Ok(v) => per_source_lists.push(v),
                Err(e) => tracing::warn!(source = ?id, error = %e, "source search failed, skipped"),
            }
        }
        interleave(per_source_lists)
    }
}

/// Round-robin: prima i [0] di ogni source, poi i [1], etc.
fn interleave(mut lists: Vec<Vec<VideoCandidate>>) -> Vec<VideoCandidate> {
    let mut out = Vec::new();
    let max = lists.iter().map(|l| l.len()).max().unwrap_or(0);
    for i in 0..max {
        for list in lists.iter_mut() {
            if i < list.len() {
                out.push(list[i].clone());
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::VideoCandidate;

    fn cand(source: VideoSourceId, id: &str) -> VideoCandidate {
        VideoCandidate {
            source,
            video_id: id.into(),
            title: id.into(),
            channel: "ch".into(),
            duration_sec: 0,
            thumb_url: "".into(),
            url: "".into(),
            stream_url: None,
        }
    }

    struct StaticSource(VideoSourceId, Vec<VideoCandidate>, bool /* fail */);

    #[async_trait]
    impl VideoSource for StaticSource {
        fn id(&self) -> VideoSourceId {
            self.0.clone()
        }
        async fn search(&self, _kw: &str, _l: u8) -> AppResult<Vec<VideoCandidate>> {
            if self.2 {
                Err(crate::error::AppError::AiProvider("forced".into()))
            } else {
                Ok(self.1.clone())
            }
        }
    }

    #[tokio::test]
    async fn interleave_round_robin_three_sources() {
        let yt = vec![
            cand(VideoSourceId::Youtube, "yt1"),
            cand(VideoSourceId::Youtube, "yt2"),
            cand(VideoSourceId::Youtube, "yt3"),
        ];
        let px = vec![cand(VideoSourceId::Pixabay, "px1"), cand(VideoSourceId::Pixabay, "px2")];
        let pe = vec![cand(VideoSourceId::Pexels, "pe1")];
        let agg = MultiSourceSearch::new(vec![
            Arc::new(StaticSource(VideoSourceId::Youtube, yt, false)),
            Arc::new(StaticSource(VideoSourceId::Pixabay, px, false)),
            Arc::new(StaticSource(VideoSourceId::Pexels, pe, false)),
        ]);
        let result = agg.search("k", 9).await;
        let ids: Vec<&str> = result.iter().map(|c| c.video_id.as_str()).collect();
        assert_eq!(ids, vec!["yt1", "px1", "pe1", "yt2", "px2", "yt3"]);
    }

    #[tokio::test]
    async fn skips_failed_source() {
        let yt = vec![cand(VideoSourceId::Youtube, "yt1")];
        let pe = vec![cand(VideoSourceId::Pexels, "pe1")];
        let agg = MultiSourceSearch::new(vec![
            Arc::new(StaticSource(VideoSourceId::Youtube, yt, false)),
            Arc::new(StaticSource(VideoSourceId::Pixabay, vec![], true)),
            Arc::new(StaticSource(VideoSourceId::Pexels, pe, false)),
        ]);
        let result = agg.search("k", 9).await;
        let ids: Vec<&str> = result.iter().map(|c| c.video_id.as_str()).collect();
        assert_eq!(ids, vec!["yt1", "pe1"]);
    }
}
```

- [ ] **Step 2: Crea `src-tauri/src/search/youtube.rs` (sposta + adatta da `youtube_search.rs`)**

```rust
use super::VideoSource;
use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;
use tokio::process::Command;

pub struct YouTubeSource {
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

impl YouTubeSource {
    pub fn new(ytdlp_path: impl Into<String>) -> Self {
        Self { ytdlp_path: ytdlp_path.into() }
    }
}

#[async_trait]
impl VideoSource for YouTubeSource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Youtube
    }

    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>> {
        let query = format!("ytsearch{limit}:{keyword}");
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
        .or_else(|| {
            e.thumbnails
                .into_iter()
                .max_by_key(|t| t.height.unwrap_or(0))
                .map(|t| t.url)
        })
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", e.id));
    VideoCandidate {
        source: VideoSourceId::Youtube,
        url: format!("https://www.youtube.com/watch?v={}", e.id),
        video_id: e.id,
        title: e.title,
        channel,
        duration_sec: e.duration.unwrap_or(0.0) as u32,
        thumb_url,
        stream_url: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires yt-dlp installed and network access"]
    async fn search_returns_results_for_real_keyword() {
        let ytdlp = which::which("yt-dlp").expect("yt-dlp not found in PATH");
        let s = YouTubeSource::new(ytdlp.to_string_lossy().into_owned());
        let results = s.search("rust programming language", 3).await.unwrap();
        assert!(!results.is_empty());
        assert!(results.len() <= 3);
        assert!(results[0].video_id.len() == 11);
        assert_eq!(results[0].source, VideoSourceId::Youtube);
    }
}
```

- [ ] **Step 3: Crea stub `src-tauri/src/search/pixabay.rs` (full impl arriva nel Task 3)**

```rust
use super::VideoSource;
use crate::domain::VideoSourceId;
use crate::error::AppResult;
use async_trait::async_trait;

pub struct PixabaySource {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl PixabaySource {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://pixabay.com/api/videos/".into(),
            client: reqwest::Client::new(),
        }
    }

    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
}

#[async_trait]
impl VideoSource for PixabaySource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Pixabay
    }
    async fn search(&self, _kw: &str, _l: u8) -> AppResult<Vec<crate::domain::VideoCandidate>> {
        // Implemented in Task 3
        Ok(Vec::new())
    }
}
```

- [ ] **Step 4: Crea stub `src-tauri/src/search/pexels.rs` (full impl arriva nel Task 4)**

```rust
use super::VideoSource;
use crate::domain::VideoSourceId;
use crate::error::AppResult;
use async_trait::async_trait;

pub struct PexelsSource {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl PexelsSource {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.pexels.com".into(),
            client: reqwest::Client::new(),
        }
    }

    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
}

#[async_trait]
impl VideoSource for PexelsSource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Pexels
    }
    async fn search(&self, _kw: &str, _l: u8) -> AppResult<Vec<crate::domain::VideoCandidate>> {
        // Implemented in Task 4
        Ok(Vec::new())
    }
}
```

- [ ] **Step 5: Aggiorna `src-tauri/src/lib.rs`**

Sostituisci `pub mod youtube_search;` con `pub mod search;`. Aggiungi anche `pub mod stock_downloader;` (creato nel Task 6) — per ora solo il primo.

Verifica che la riga `pub mod youtube_search;` venga rimossa.

- [ ] **Step 6: Cancella il vecchio file**

```bash
rm src-tauri/src/youtube_search.rs
```

- [ ] **Step 7: Aggiorna i call site di `YouTubeSearch` in `commands.rs`**

In `src-tauri/src/commands.rs`, sostituisci ogni `use crate::youtube_search::YouTubeSearch;` con `use crate::search::YouTubeSource;` e ogni `YouTubeSearch::new(ytdlp)` con `YouTubeSource::new(ytdlp)`. Sostituisci `.search(...)` chiamato come metodo concreto: la chiamata `search.search(&keyword, 9).await` resta uguale (il trait ha lo stesso nome metodo).

Cerca con: `grep -n "YouTubeSearch\|youtube_search" src-tauri/src/commands.rs`. Aggiorna ogni occorrenza.

- [ ] **Step 8: Verifica build**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo build 2>&1 | tail -10
```

Expected: success. Eventuali warning su unused fields in PixabaySource/PexelsSource sono OK (verranno usati nei task seguenti).

- [ ] **Step 9: Esegui i test**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test search 2>&1 | tail -20
```

Expected: 2 PASS (interleave_round_robin_three_sources, skips_failed_source). Il test ignored `search_returns_results_for_real_keyword` resta ignored.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/search/ src-tauri/src/lib.rs src-tauri/src/commands.rs
git rm src-tauri/src/youtube_search.rs
git commit -m "feat: search module with VideoSource trait + MultiSourceSearch aggregator"
```

---

## Task 3: PixabaySource HTTP API + 2 mocked tests

**Files:**
- Modify: `src-tauri/src/search/pixabay.rs`

- [ ] **Step 1: Sostituisci `pixabay.rs` con impl completa**

```rust
use super::VideoSource;
use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;

pub struct PixabaySource {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl PixabaySource {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://pixabay.com/api/videos/".into(),
            client: reqwest::Client::new(),
        }
    }

    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
}

#[derive(Deserialize)]
struct RespBody {
    hits: Vec<Hit>,
}

#[derive(Deserialize)]
struct Hit {
    id: u64,
    #[serde(default)]
    duration: u32,
    #[serde(default)]
    picture_id: String,
    #[serde(default)]
    user: String,
    videos: VideoFiles,
    #[serde(rename = "pageURL", default)]
    page_url: String,
    #[serde(default)]
    tags: String,
}

#[derive(Deserialize)]
struct VideoFiles {
    #[serde(default)]
    medium: Option<VideoFile>,
    #[serde(default)]
    small: Option<VideoFile>,
    #[serde(default)]
    tiny: Option<VideoFile>,
}

#[derive(Deserialize)]
struct VideoFile {
    url: String,
}

#[async_trait]
impl VideoSource for PixabaySource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Pixabay
    }

    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>> {
        let limit = limit.clamp(3, 200);
        let resp = self
            .client
            .get(&self.base_url)
            .query(&[
                ("key", self.api_key.as_str()),
                ("q", keyword),
                ("per_page", &limit.to_string()),
                ("video_type", "film"),
                ("safesearch", "true"),
            ])
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::AiProvider(format!("pixabay status {status}: {body}")));
        }

        let parsed: RespBody = resp.json().await?;
        Ok(parsed.hits.into_iter().map(to_candidate).collect())
    }
}

fn to_candidate(h: Hit) -> VideoCandidate {
    let stream_url = h
        .videos
        .medium
        .or(h.videos.small)
        .or(h.videos.tiny)
        .map(|f| f.url);
    let thumb_url = if h.picture_id.is_empty() {
        format!("https://i.vimeocdn.com/video/default_640x360.jpg")
    } else {
        format!("https://i.vimeocdn.com/video/{}_640x360.jpg", h.picture_id)
    };
    let title = if h.tags.is_empty() {
        format!("Pixabay #{}", h.id)
    } else {
        h.tags.chars().take(80).collect::<String>()
    };
    VideoCandidate {
        source: VideoSourceId::Pixabay,
        video_id: h.id.to_string(),
        title,
        channel: if h.user.is_empty() { "unknown".into() } else { h.user },
        duration_sec: h.duration,
        thumb_url,
        url: h.page_url,
        stream_url,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn search_returns_first_hit() {
        let mut server = mockito::Server::new_async().await;
        let body = r#"{
            "hits": [{
                "id": 12345,
                "duration": 30,
                "picture_id": "abcd1234",
                "user": "john_doe",
                "tags": "nature, water, ocean",
                "pageURL": "https://pixabay.com/videos/12345/",
                "videos": { "medium": { "url": "https://cdn.pixabay.com/video/12345/medium.mp4" } }
            }]
        }"#;
        let _m = server
            .mock("GET", mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(body)
            .create_async()
            .await;

        let s = PixabaySource::new("test-key".into()).with_base_url(server.url());
        let result = s.search("nature", 9).await.unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].source, VideoSourceId::Pixabay);
        assert_eq!(result[0].video_id, "12345");
        assert_eq!(result[0].channel, "john_doe");
        assert_eq!(result[0].duration_sec, 30);
        assert_eq!(
            result[0].stream_url.as_deref(),
            Some("https://cdn.pixabay.com/video/12345/medium.mp4")
        );
        assert!(result[0].title.starts_with("nature"));
    }

    #[tokio::test]
    async fn search_propagates_4xx_as_error() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", mockito::Matcher::Any)
            .with_status(400)
            .with_body("{\"error\":\"bad key\"}")
            .create_async()
            .await;

        let s = PixabaySource::new("bad".into()).with_base_url(server.url());
        let err = s.search("k", 9).await.unwrap_err();
        assert!(matches!(err, AppError::AiProvider(_)));
    }
}
```

- [ ] **Step 2: Esegui i test**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test pixabay 2>&1 | tail -10
```

Expected: 2 PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/search/pixabay.rs
git commit -m "feat: PixabaySource HTTP API with mocked tests"
```

---

## Task 4: PexelsSource HTTP API + 2 mocked tests

**Files:**
- Modify: `src-tauri/src/search/pexels.rs`

- [ ] **Step 1: Sostituisci `pexels.rs` con impl completa**

```rust
use super::VideoSource;
use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;

pub struct PexelsSource {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl PexelsSource {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.pexels.com".into(),
            client: reqwest::Client::new(),
        }
    }

    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
}

#[derive(Deserialize)]
struct RespBody {
    videos: Vec<Video>,
}

#[derive(Deserialize)]
struct Video {
    id: u64,
    #[serde(default)]
    duration: u32,
    image: String,
    user: User,
    video_files: Vec<VideoFile>,
    url: String,
}

#[derive(Deserialize)]
struct User {
    name: String,
}

#[derive(Deserialize)]
struct VideoFile {
    link: String,
    #[serde(default)]
    quality: String,
    #[serde(default)]
    height: Option<u32>,
}

#[async_trait]
impl VideoSource for PexelsSource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Pexels
    }

    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>> {
        let limit = limit.clamp(1, 80);
        let url = format!("{}/videos/search", self.base_url);
        let resp = self
            .client
            .get(&url)
            .header("Authorization", &self.api_key)
            .query(&[("query", keyword), ("per_page", &limit.to_string())])
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::AiProvider(format!("pexels status {status}: {body}")));
        }

        let parsed: RespBody = resp.json().await?;
        Ok(parsed.videos.into_iter().map(to_candidate).collect())
    }
}

fn to_candidate(v: Video) -> VideoCandidate {
    // Pick HD quality at 720p or smaller; fallback to first file.
    let stream_url = v
        .video_files
        .iter()
        .find(|f| f.quality == "hd" && f.height.unwrap_or(2000) <= 720)
        .or_else(|| v.video_files.first())
        .map(|f| f.link.clone());
    let title = v
        .url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(&v.url)
        .replace('-', " ");
    let title = if title.is_empty() {
        format!("Pexels #{}", v.id)
    } else {
        title
    };
    VideoCandidate {
        source: VideoSourceId::Pexels,
        video_id: v.id.to_string(),
        title,
        channel: v.user.name,
        duration_sec: v.duration,
        thumb_url: v.image,
        url: v.url,
        stream_url,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn search_returns_first_hit() {
        let mut server = mockito::Server::new_async().await;
        let body = r#"{
            "videos": [{
                "id": 9999,
                "duration": 17,
                "image": "https://images.pexels.com/videos/9999/thumb.jpg",
                "user": { "name": "Jane Photo" },
                "url": "https://www.pexels.com/video/sunset-over-the-sea-9999/",
                "video_files": [
                    { "link": "https://videos.pexels.com/9999_hd.mp4", "quality": "hd", "height": 720 },
                    { "link": "https://videos.pexels.com/9999_sd.mp4", "quality": "sd", "height": 360 }
                ]
            }]
        }"#;
        let _m = server
            .mock("GET", mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(body)
            .create_async()
            .await;

        let s = PexelsSource::new("test-key".into()).with_base_url(server.url());
        let result = s.search("sunset", 9).await.unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].source, VideoSourceId::Pexels);
        assert_eq!(result[0].video_id, "9999");
        assert_eq!(result[0].channel, "Jane Photo");
        assert_eq!(result[0].duration_sec, 17);
        assert_eq!(
            result[0].stream_url.as_deref(),
            Some("https://videos.pexels.com/9999_hd.mp4")
        );
        assert!(result[0].title.contains("sunset"));
    }

    #[tokio::test]
    async fn search_propagates_401_as_error() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", mockito::Matcher::Any)
            .with_status(401)
            .with_body("{\"error\":\"unauthorized\"}")
            .create_async()
            .await;

        let s = PexelsSource::new("bad".into()).with_base_url(server.url());
        let err = s.search("k", 9).await.unwrap_err();
        assert!(matches!(err, AppError::AiProvider(_)));
    }
}
```

- [ ] **Step 2: Esegui i test**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test pexels 2>&1 | tail -10
```

Expected: 2 PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/search/pexels.rs
git commit -m "feat: PexelsSource HTTP API with mocked tests"
```

---

## Task 5: SettingsStore — keyring per Pixabay/Pexels keys

**Files:**
- Modify: `src-tauri/src/settings_store.rs`

- [ ] **Step 1: Aggiungi const + funzioni in `settings_store.rs`**

In `src-tauri/src/settings_store.rs`, dopo le const esistenti per `KEYRING_USER_GROQ`, aggiungi:

```rust
const KEYRING_USER_PIXABAY: &str = "pixabay_api_key";
const KEYRING_USER_PEXELS: &str = "pexels_api_key";
```

E nei `impl SettingsStore`, dopo le funzioni groq, aggiungi:

```rust
pub fn set_pixabay_key(key: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PIXABAY)?;
    entry.set_password(key)?;
    Ok(())
}

pub fn get_pixabay_key() -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PIXABAY)?;
    match entry.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn delete_pixabay_key() -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PIXABAY)?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

pub fn set_pexels_key(key: &str) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PEXELS)?;
    entry.set_password(key)?;
    Ok(())
}

pub fn get_pexels_key() -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PEXELS)?;
    match entry.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

pub fn delete_pexels_key() -> AppResult<()> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER_PEXELS)?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}
```

- [ ] **Step 2: Aggiungi test roundtrip nel modulo `tests`**

Nel `#[cfg(test)] mod tests` esistente, aggiungi:

```rust
#[test]
fn set_get_delete_pixabay_key_roundtrip() {
    let _ = SettingsStore::delete_pixabay_key();
    assert_eq!(SettingsStore::get_pixabay_key().unwrap(), None);
    SettingsStore::set_pixabay_key("px-test-12345").unwrap();
    assert_eq!(
        SettingsStore::get_pixabay_key().unwrap(),
        Some("px-test-12345".to_string())
    );
    SettingsStore::delete_pixabay_key().unwrap();
    assert_eq!(SettingsStore::get_pixabay_key().unwrap(), None);
}

#[test]
fn set_get_delete_pexels_key_roundtrip() {
    let _ = SettingsStore::delete_pexels_key();
    assert_eq!(SettingsStore::get_pexels_key().unwrap(), None);
    SettingsStore::set_pexels_key("pe-test-12345").unwrap();
    assert_eq!(
        SettingsStore::get_pexels_key().unwrap(),
        Some("pe-test-12345".to_string())
    );
    SettingsStore::delete_pexels_key().unwrap();
    assert_eq!(SettingsStore::get_pexels_key().unwrap(), None);
}
```

- [ ] **Step 3: Esegui i test**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test settings_store 2>&1 | tail -15
```

Expected: tutti i test settings (esistenti + 2 nuovi) PASS. Su macOS la prima esecuzione potrebbe chiedere conferma Keychain — accetta.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/settings_store.rs
git commit -m "feat: keyring helpers for Pixabay + Pexels API keys"
```

---

## Task 6: StockDownloader — HTTP streaming via reqwest

**Files:**
- Create: `src-tauri/src/stock_downloader.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Crea `src-tauri/src/stock_downloader.rs`**

```rust
use crate::download_manager::DownloadProgress;
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

pub struct StockDownloader {
    client: reqwest::Client,
}

impl Default for StockDownloader {
    fn default() -> Self {
        Self::new()
    }
}

impl StockDownloader {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    pub async fn download<F>(
        &self,
        url: &str,
        output_dir: &Path,
        filename: &str,
        mut on_progress: F,
    ) -> AppResult<PathBuf>
    where
        F: FnMut(DownloadProgress) + Send,
    {
        use futures::StreamExt;

        tokio::fs::create_dir_all(output_dir).await?;
        let dest = output_dir.join(filename);

        let resp = self.client.get(url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Subprocess(format!(
                "stock download {} HTTP {}",
                url,
                resp.status()
            )));
        }
        let total = resp.content_length();
        let mut file = tokio::fs::File::create(&dest).await?;
        let mut stream = resp.bytes_stream();
        let mut downloaded: u64 = 0;
        let mut last_emit = std::time::Instant::now();
        let started = std::time::Instant::now();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|e| AppError::Subprocess(format!("stock download stream: {e}")))?;
            file.write_all(&chunk).await?;
            downloaded += chunk.len() as u64;

            if last_emit.elapsed() > std::time::Duration::from_millis(200) {
                let percent = total
                    .map(|t| (downloaded as f32 / t as f32) * 100.0)
                    .unwrap_or(0.0);
                let elapsed = started.elapsed().as_secs_f32().max(0.001);
                let bps = (downloaded as f32) / elapsed;
                let eta_sec = total.and_then(|t| {
                    if bps > 0.0 {
                        Some(((t - downloaded) as f32 / bps) as u32)
                    } else {
                        None
                    }
                });
                on_progress(DownloadProgress { percent, eta_sec });
                last_emit = std::time::Instant::now();
            }
        }
        file.flush().await?;
        Ok(dest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn download_writes_file_from_mock() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", "/file.mp4")
            .with_status(200)
            .with_header("content-length", "11")
            .with_body("hello world")
            .create_async()
            .await;

        let url = format!("{}/file.mp4", server.url());
        let tmp = TempDir::new().unwrap();
        let dl = StockDownloader::new();
        let mut last = 0.0;
        let path = dl
            .download(&url, tmp.path(), "out.mp4", |p| {
                last = p.percent;
            })
            .await
            .unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        assert_eq!(content, "hello world");
        // Note: progress emission is throttled at 200ms; small mock may not emit. OK.
        let _ = last;
    }

    #[tokio::test]
    async fn download_propagates_4xx() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", "/x")
            .with_status(404)
            .create_async()
            .await;
        let url = format!("{}/x", server.url());
        let tmp = TempDir::new().unwrap();
        let err = StockDownloader::new()
            .download(&url, tmp.path(), "out.mp4", |_| {})
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Subprocess(_)));
    }
}
```

- [ ] **Step 2: Aggiungi `pub mod stock_downloader;` in `src-tauri/src/lib.rs`**

- [ ] **Step 3: Esegui i test**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test stock_downloader 2>&1 | tail -10
```

Expected: 2 PASS.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/stock_downloader.rs src-tauri/src/lib.rs
git commit -m "feat: StockDownloader for HTTP streaming downloads"
```

---

## Task 7: Tauri commands per Pixabay/Pexels keys + test

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Aggiungi 4 comandi in `commands.rs`**

In `src-tauri/src/commands.rs`, dopo `settings_set_groq_key`, aggiungi:

```rust
#[tauri::command]
pub async fn settings_set_pixabay_key(key: String) -> AppResult<()> {
    SettingsStore::set_pixabay_key(&key)
}

#[tauri::command]
pub async fn settings_set_pexels_key(key: String) -> AppResult<()> {
    SettingsStore::set_pexels_key(&key)
}

#[tauri::command]
pub async fn settings_test_pixabay() -> AppResult<bool> {
    let key = SettingsStore::get_pixabay_key()?
        .ok_or_else(|| AppError::InvalidInput("no pixabay key set".into()))?;
    let source = crate::search::PixabaySource::new(key);
    let results = source.search("nature", 3).await?;
    Ok(!results.is_empty())
}

#[tauri::command]
pub async fn settings_test_pexels() -> AppResult<bool> {
    let key = SettingsStore::get_pexels_key()?
        .ok_or_else(|| AppError::InvalidInput("no pexels key set".into()))?;
    let source = crate::search::PexelsSource::new(key);
    let results = source.search("nature", 3).await?;
    Ok(!results.is_empty())
}
```

E aggiorna l'`use` statement in cima al file aggiungendo `crate::search::{PixabaySource, PexelsSource, YouTubeSource, MultiSourceSearch, VideoSource};` se non già presente.

- [ ] **Step 2: Aggiungi i 4 comandi al `invoke_handler!` in `lib.rs`**

In `src-tauri/src/lib.rs`, nel `tauri::generate_handler![...]`, aggiungi:

```rust
settings_set_pixabay_key,
settings_set_pexels_key,
settings_test_pixabay,
settings_test_pexels,
```

(I primi due nomi sono nuovi; gli altri due sono i test online.)

- [ ] **Step 3: Verifica build**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo build 2>&1 | tail -10
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: Tauri commands for Pixabay/Pexels key management + test ping"
```

---

## Task 8: Refactor `search_run` per usare MultiSourceSearch

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Sostituisci la funzione `search_run`**

In `src-tauri/src/commands.rs`, trova la funzione `search_run` e sostituiscila con:

```rust
#[tauri::command]
pub async fn search_run(
    state: State<'_, AppState>,
    keyword: String,
) -> AppResult<Vec<VideoCandidate>> {
    use std::sync::Arc;
    let ytdlp = await_ytdlp(&state).await?;
    let mut sources: Vec<Arc<dyn crate::search::VideoSource>> =
        vec![Arc::new(crate::search::YouTubeSource::new(ytdlp))];
    if let Some(k) = SettingsStore::get_pixabay_key()? {
        sources.push(Arc::new(crate::search::PixabaySource::new(k)));
    }
    if let Some(k) = SettingsStore::get_pexels_key()? {
        sources.push(Arc::new(crate::search::PexelsSource::new(k)));
    }
    let agg = crate::search::MultiSourceSearch::new(sources);
    Ok(agg.search(&keyword, 9).await)
}
```

- [ ] **Step 2: Verifica build**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo build 2>&1 | tail -10
```

Expected: success.

- [ ] **Step 3: Esegui tutti i test**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test 2>&1 | tail -15
```

Expected: tutti i test PASS, eccetto i 2 ignored (yt-dlp network + ffmpeg integration).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: search_run uses MultiSourceSearch with optional Pixabay/Pexels"
```

---

## Task 9: Refactor `pick_video` per discriminare YouTube vs Stock

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Sostituisci la sezione del download in `pick_video`**

In `src-tauri/src/commands.rs`, trova la funzione `pick_video`. Cerca la riga che inizia con `let dl = DownloadManager::new(ytdlp);` e sostituisci tutto il blocco di download (dalla creazione del DownloadManager fino a `let raw_path = ...` incluso) con questo:

```rust
    let pid = point_id.clone();
    let app_clone = app.clone();
    let progress_cb = move |p: crate::download_manager::DownloadProgress| {
        app_clone
            .emit(
                "download.progress",
                serde_json::json!({
                    "point_id": pid,
                    "percent": p.percent,
                    "eta_sec": p.eta_sec,
                }),
            )
            .ok();
    };
    let raw_path = match candidate.source {
        VideoSourceId::Youtube => {
            tracing::info!(url = %candidate.url, dest = ?raw_dir, "pick_video: yt-dlp download");
            let dl = DownloadManager::new(ytdlp.clone());
            match dl.download(&candidate.url, &raw_dir, progress_cb).await {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!(error = %e, "pick_video: yt-dlp failed");
                    store
                        .update_broll_point(&point_id, |bp| {
                            bp.status = BRollStatus::Error;
                        })
                        .await
                        .ok();
                    app.emit("project.updated", &store.project().await).ok();
                    app.emit(
                        "download.error",
                        serde_json::json!({"point_id": point_id, "error": e.to_string()}),
                    )
                    .ok();
                    return Err(e);
                }
            }
        }
        VideoSourceId::Pixabay | VideoSourceId::Pexels => {
            let stream = candidate.stream_url.as_deref().ok_or_else(|| {
                AppError::InvalidInput(format!(
                    "stock candidate {} has no stream_url",
                    candidate.video_id
                ))
            })?;
            tracing::info!(url = %stream, dest = ?raw_dir, "pick_video: stock HTTP download");
            let downloader = crate::stock_downloader::StockDownloader::new();
            let filename = format!("{}.mp4", candidate.video_id);
            match downloader.download(stream, &raw_dir, &filename, progress_cb).await {
                Ok(p) => p,
                Err(e) => {
                    tracing::error!(error = %e, "pick_video: stock download failed");
                    store
                        .update_broll_point(&point_id, |bp| {
                            bp.status = BRollStatus::Error;
                        })
                        .await
                        .ok();
                    app.emit("project.updated", &store.project().await).ok();
                    app.emit(
                        "download.error",
                        serde_json::json!({"point_id": point_id, "error": e.to_string()}),
                    )
                    .ok();
                    return Err(e);
                }
            }
        }
    };
```

- [ ] **Step 2: Sostituisci la chiamata `apply_copyright_overlay`**

Sempre dentro `pick_video`, la chiamata che usa `&candidate.channel`:

```rust
    let vp = VideoProcessor::with_app(&app, font);
```

Sostituisci la riga successiva da:

```rust
    if let Err(e) = vp.apply_copyright_overlay(&raw_path, &final_path, &candidate.channel).await {
```

a:

```rust
    let overlay_text = match candidate.source {
        VideoSourceId::Youtube => format!("\u{00A9} {}", candidate.channel),
        VideoSourceId::Pixabay => format!("\u{00A9} {} \u{00B7} Pixabay", candidate.channel),
        VideoSourceId::Pexels => format!("\u{00A9} {} \u{00B7} Pexels", candidate.channel),
    };
    if let Err(e) = vp.apply_copyright_overlay(&raw_path, &final_path, &overlay_text).await {
```

NOTE: `apply_copyright_overlay` già fa l'escape dei caratteri speciali via `escape_drawtext`, quindi `©` e `·` Unicode passano lisci. Però la funzione attualmente prepende `©` automaticamente; **leggi `src-tauri/src/video_processor.rs` per confermare**: se la funzione costruisce `text='© {channel}'`, allora il nuovo overlay_text avrà `©` due volte. In tal caso modifica anche `video_processor.rs` per accettare la stringa già completa.

Per ora se la funzione attuale prepende `©` automaticamente, sostituisci `format!("\u{00A9} ...")` con solo `format!("{}", candidate.channel)` per YouTube e `format!("{} \u{00B7} Pixabay", candidate.channel)` per stock, lasciando il `©` al video_processor.

- [ ] **Step 3: Verifica build**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo build 2>&1 | tail -10
```

Expected: success. Se ci sono errori sull'escape `\u{...}` in stringa, usa l'equivalente char letterale: `format!("© {} · Pixabay", candidate.channel)`.

- [ ] **Step 4: Esegui tutti i test**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test 2>&1 | tail -15
```

Expected: tutti PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: pick_video discriminates YouTube vs Pixabay/Pexels download paths"
```

---

## Task 10: Frontend — `ipc.ts` + `types.ts` (già fatto in T1) + commands

**Files:**
- Modify: `src/ipc.ts`

- [ ] **Step 1: Aggiungi 4 metodi a `ipc.ts`**

In `src/ipc.ts`, dentro l'oggetto `ipc`, aggiungi:

```ts
settingsSetPixabayKey: (key: string) =>
  invoke<void>("settings_set_pixabay_key", { key }),
settingsTestPixabay: () => invoke<boolean>("settings_test_pixabay"),
settingsSetPexelsKey: (key: string) =>
  invoke<void>("settings_set_pexels_key", { key }),
settingsTestPexels: () => invoke<boolean>("settings_test_pexels"),
```

- [ ] **Step 2: Verifica TS**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/ipc.ts
git commit -m "feat: ipc bindings for Pixabay/Pexels settings"
```

---

## Task 11: VideoGrid — badge sorgente + thumb_url dal candidate

**Files:**
- Modify: `src/components/VideoGrid.tsx`

- [ ] **Step 1: Riscrivi `VideoGrid.tsx` con badge sorgente**

Apri `src/components/VideoGrid.tsx`. Trova il rendering della card e:

1. Sostituisci l'uso hardcoded di `https://i.ytimg.com/vi/<id>/mqdefault.jpg` (se presente) con `r.thumb_url` (il candidate ora porta direttamente il thumb).
2. Sotto il badge numero (top-left), aggiungi un badge sorgente top-right con classe colore basata su `r.source`.
3. Nella riga channel, prependi `[YT|PX|PE]: `.

Edit specifici:

Trova:
```tsx
const url = `https://i.ytimg.com/vi/${r.video_id}/mqdefault.jpg`;
```
o l'uso equivalente, e sostituisci con `r.thumb_url` direttamente nel `style.backgroundImage`.

Aggiungi questo helper in cima al file (fuori dalla function component):

```tsx
const SOURCE_BADGE: Record<string, { label: string; bg: string }> = {
  youtube: { label: "YT", bg: "bg-[#FF0000] text-white" },
  pixabay: { label: "PX", bg: "bg-[#2EC56C] text-white" },
  pexels: { label: "PE", bg: "bg-bee-ink text-white" },
};

const SOURCE_NAME: Record<string, string> = {
  youtube: "YouTube",
  pixabay: "Pixabay",
  pexels: "Pexels",
};
```

E nel JSX della singola card, dentro `<div className="thumb">` (o equivalente), aggiungi accanto al badge numero esistente:

```tsx
<span
  className={`absolute top-1 right-1 font-mono text-[10px] font-bold px-1.5 py-0.5 ${SOURCE_BADGE[r.source]?.bg ?? "bg-bee-ink text-white"}`}
>
  {SOURCE_BADGE[r.source]?.label ?? "??"}
</span>
```

E nella sezione `.meta` (channel sotto il titolo), modifica la riga del channel da:

```tsx
<p className="text-xs text-muted-foreground truncate">{r.channel}</p>
```

a:

```tsx
<p className="text-xs text-muted-foreground truncate">
  <span className="font-mono font-bold uppercase">{SOURCE_BADGE[r.source]?.label ?? "?"}</span>
  {" · "}
  {r.channel}
</p>
```

(Adatta i nomi di classe ai tuoi attuali — se la card usa `m-ch` o simili, mantieni le classi esistenti.)

- [ ] **Step 2: Aggiorna mock test in `src/pages/PickerPage.test.tsx`**

In `src/pages/PickerPage.test.tsx`, ogni candidate deve avere `source: "youtube"` e `stream_url: null`. Cerca le definizioni di `VideoCandidate` (es. `mockCandidate(...)` o oggetti letterali) e aggiungi i campi mancanti. Esempio:

```tsx
const sampleCandidate = (id: string): VideoCandidate => ({
  source: "youtube",
  video_id: id,
  title: `Title ${id}`,
  channel: "ChannelX",
  duration_sec: 120,
  thumb_url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  url: `https://www.youtube.com/watch?v=${id}`,
  stream_url: null,
});
```

Sostituisci ogni occorrenza di candidate hard-coded con questo helper o aggiungi i campi inline.

- [ ] **Step 3: Verifica vitest + TS**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -10
```

Expected: 5/5 PASS, TS clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/VideoGrid.tsx src/pages/PickerPage.test.tsx
git commit -m "feat: VideoGrid shows source badge + uses candidate thumb_url"
```

---

## Task 12: PreviewPane — player condizionale (iframe vs `<video>`)

**Files:**
- Modify: `src/components/PreviewPane.tsx`

- [ ] **Step 1: Aggiorna `PreviewPane.tsx` con player switch**

Apri `src/components/PreviewPane.tsx`. Trova il rendering dell'iframe YouTube e sostituiscilo con un blocco condizionale.

Cerca la riga che crea `src` con `youtube-nocookie.com/embed/...`. Sostituisci tutto il blocco del player (il `<div className="aspect-video bg-black ...">` con dentro `<iframe>`) con:

```tsx
<div className="aspect-video bg-black border-bee border-bee-ink shadow-bee-y overflow-hidden relative">
  {candidate.source === "youtube" ? (
    <iframe
      ref={iframeRef}
      key={candidate.video_id + (muted ? "-m" : "-u")}
      src={`https://www.youtube-nocookie.com/embed/${candidate.video_id}?autoplay=1&mute=${muted ? 1 : 0}&modestbranding=1&rel=0`}
      title={candidate.title}
      allow="autoplay; encrypted-media"
      className="w-full h-full"
    />
  ) : candidate.stream_url ? (
    <video
      key={candidate.video_id + (muted ? "-m" : "-u")}
      src={candidate.stream_url}
      controls
      autoPlay
      muted={muted}
      className="w-full h-full object-contain bg-black"
    />
  ) : (
    <div className="w-full h-full flex flex-col items-center justify-center text-white p-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.4px] text-bee-yellow mb-2">
        Anteprima non disponibile
      </p>
      <a
        href={candidate.url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-bee-yellow underline font-bold text-sm"
      >
        ↗ Apri sulla sorgente
      </a>
    </div>
  )}
</div>
```

(Mantieni le classi esistenti del wrapper; quelle sopra sono indicative — usa quelle del tuo file attuale.)

Il resto del componente (titolo, channel, action buttons Pause/Stop/Resume/Download) resta invariato.

- [ ] **Step 2: Verifica TS + build**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/PreviewPane.tsx
git commit -m "feat: PreviewPane shows native <video> player for stock sources"
```

---

## Task 13: SettingsPage — sezione "Sorgenti video aggiuntive"

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Aggiungi sezione Pixabay/Pexels in SettingsPage**

Apri `src/pages/SettingsPage.tsx`. Dopo la sezione "Trascrizione" (cerca la `<section>` dove l'utente sceglie Groq/OpenAI), aggiungi una nuova `<section>` con:

```tsx
{/* Sorgenti video */}
<section className="mb-8">
  <h2 className="text-[20px] font-bold mb-3">
    <BeeHL className="bee-hl-sm">Sorgenti video</BeeHL>
  </h2>
  <BeeMonoLabel as="p" className="mb-4 text-bee-mute">
    YouTube è sempre attivo. Aggiungi Pixabay/Pexels per stock footage.
  </BeeMonoLabel>

  {/* Pixabay */}
  <div className="border-bee border-bee-ink p-4 mb-3 bg-white">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-bold text-[15px]">Pixabay</h3>
      <a
        href="https://pixabay.com/api/docs/"
        target="_blank"
        rel="noreferrer noopener"
        className="font-mono text-[11px] text-bee-mute hover:text-bee-ink underline"
      >
        pixabay.com/api/
      </a>
    </div>
    <div className="flex gap-2">
      <input
        type="password"
        placeholder="API key Pixabay"
        value={pixabayKey}
        onChange={(e) => setPixabayKey(e.target.value)}
        className="flex-1 h-[40px] border-bee border-bee-ink px-3 font-mono text-[13px]"
      />
      <BeeButton variant="primary" onClick={savePixabay} disabled={pixabayBusy}>
        {pixabayBusy === "saving" ? "Salvo…" : pixabayBusy === "testing" ? "Testo…" : "Salva e testa"}
      </BeeButton>
    </div>
    {pixabayMsg.kind === "ok" && (
      <p className="mt-2 font-mono text-[11px] text-green-700">✓ {pixabayMsg.text}</p>
    )}
    {pixabayMsg.kind === "err" && (
      <p className="mt-2 font-mono text-[11px] text-red-700">! {pixabayMsg.text}</p>
    )}
  </div>

  {/* Pexels */}
  <div className="border-bee border-bee-ink p-4 bg-white">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-bold text-[15px]">Pexels</h3>
      <a
        href="https://www.pexels.com/api/"
        target="_blank"
        rel="noreferrer noopener"
        className="font-mono text-[11px] text-bee-mute hover:text-bee-ink underline"
      >
        pexels.com/api/
      </a>
    </div>
    <div className="flex gap-2">
      <input
        type="password"
        placeholder="API key Pexels"
        value={pexelsKey}
        onChange={(e) => setPexelsKey(e.target.value)}
        className="flex-1 h-[40px] border-bee border-bee-ink px-3 font-mono text-[13px]"
      />
      <BeeButton variant="primary" onClick={savePexels} disabled={pexelsBusy}>
        {pexelsBusy === "saving" ? "Salvo…" : pexelsBusy === "testing" ? "Testo…" : "Salva e testa"}
      </BeeButton>
    </div>
    {pexelsMsg.kind === "ok" && (
      <p className="mt-2 font-mono text-[11px] text-green-700">✓ {pexelsMsg.text}</p>
    )}
    {pexelsMsg.kind === "err" && (
      <p className="mt-2 font-mono text-[11px] text-red-700">! {pexelsMsg.text}</p>
    )}
  </div>
</section>
```

E in cima al component, aggiungi gli state hook:

```tsx
const [pixabayKey, setPixabayKey] = useState("");
const [pixabayBusy, setPixabayBusy] = useState<null | "saving" | "testing">(null);
const [pixabayMsg, setPixabayMsg] = useState<{ kind: "idle" | "ok" | "err"; text: string }>({ kind: "idle", text: "" });
const [pexelsKey, setPexelsKey] = useState("");
const [pexelsBusy, setPexelsBusy] = useState<null | "saving" | "testing">(null);
const [pexelsMsg, setPexelsMsg] = useState<{ kind: "idle" | "ok" | "err"; text: string }>({ kind: "idle", text: "" });

const savePixabay = async () => {
  if (!pixabayKey.trim()) {
    setPixabayMsg({ kind: "err", text: "Inserisci la chiave" });
    return;
  }
  setPixabayBusy("saving");
  try {
    await ipc.settingsSetPixabayKey(pixabayKey.trim());
    setPixabayBusy("testing");
    const ok = await ipc.settingsTestPixabay();
    setPixabayBusy(null);
    setPixabayMsg(
      ok
        ? { kind: "ok", text: "Chiave salvata e verificata" }
        : { kind: "err", text: "Test fallito (nessun risultato)" },
    );
  } catch (e) {
    setPixabayBusy(null);
    setPixabayMsg({ kind: "err", text: String(e) });
  }
};

const savePexels = async () => {
  if (!pexelsKey.trim()) {
    setPexelsMsg({ kind: "err", text: "Inserisci la chiave" });
    return;
  }
  setPexelsBusy("saving");
  try {
    await ipc.settingsSetPexelsKey(pexelsKey.trim());
    setPexelsBusy("testing");
    const ok = await ipc.settingsTestPexels();
    setPexelsBusy(null);
    setPexelsMsg(
      ok
        ? { kind: "ok", text: "Chiave salvata e verificata" }
        : { kind: "err", text: "Test fallito (nessun risultato)" },
    );
  } catch (e) {
    setPexelsBusy(null);
    setPexelsMsg({ kind: "err", text: String(e) });
  }
};
```

Verifica anche di aver importato `useState`, `BeeHL`, `BeeMonoLabel`, `BeeButton`, `ipc` se non già fatto.

- [ ] **Step 2: Verifica TS + build**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: SettingsPage section for Pixabay/Pexels API keys"
```

---

## Task 14: Smoke test finale + Playwright

**Files:**
- Modify: `e2e-pw/timeline.spec.ts`

- [ ] **Step 1: Aggiorna lo store mock in Playwright per testare la grid mista**

In `e2e-pw/timeline.spec.ts`, nel `useStore.setState` mock, modifica `searchResults` per includere candidate da fonti diverse:

```ts
searchResults: {
  bp_01: [
    { source: "youtube", video_id: "vidyt", title: "YouTube clip", channel: "YT Ch", duration_sec: 120, thumb_url: "https://i.ytimg.com/vi/vidyt/mqdefault.jpg", url: "https://www.youtube.com/watch?v=vidyt", stream_url: null },
    { source: "pixabay", video_id: "12345",  title: "Pixabay clip", channel: "px_user", duration_sec: 30, thumb_url: "https://i.vimeocdn.com/video/abc_640x360.jpg", url: "https://pixabay.com/videos/12345/", stream_url: "https://cdn.pixabay.com/video/12345/medium.mp4" },
    { source: "pexels", video_id: "67890", title: "Pexels clip", channel: "pe_user", duration_sec: 17, thumb_url: "https://images.pexels.com/videos/67890/thumb.jpg", url: "https://www.pexels.com/video/67890/", stream_url: "https://videos.pexels.com/67890_hd.mp4" },
  ],
},
```

E aggiungi un'asserzione che verifica i 3 badge sorgente:

```ts
// Verify each source badge appears in the grid
await expect(page.locator('text=YT').first()).toBeVisible();
await expect(page.locator('text=PX').first()).toBeVisible();
await expect(page.locator('text=PE').first()).toBeVisible();
```

- [ ] **Step 2: Esegui Playwright**

```bash
npm run test:pw 2>&1 | tail -10
```

Expected: 1/1 PASS. Lo screenshot rigenerato in `e2e-pw/screenshots/timeline-downloading.png` mostrerà la grid con badge YT/PX/PE.

- [ ] **Step 3: Esegui tutti i test (Rust + JS + Playwright)**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test 2>&1 | grep "test result"
cd ..
npx vitest run 2>&1 | tail -5
npm run test:pw 2>&1 | tail -5
```

Expected:
- Cargo: ~70 PASS, 1-2 ignored
- Vitest: 5/5 PASS
- Playwright: 1/1 PASS

- [ ] **Step 4: Commit finale**

```bash
git add e2e-pw/timeline.spec.ts e2e-pw/screenshots/
git commit -m "test: Playwright covers multi-source video grid badges"
```

---

## Conclusione

L'implementazione finita aggiunge:
- 2 nuove sources (Pixabay, Pexels) abilitate inserendo le API key in Settings
- Risultati combinati nella grid del Picker via interleave round-robin (9+9+9 = max 27)
- Player nativo `<video>` per clip stock; iframe YouTube invariato
- Download HTTP diretto streaming per stock; yt-dlp invariato per YouTube
- Overlay copyright con attribution sorgente (`© user · Pixabay`)
- Backwards compatibile: project file esistenti continuano a funzionare (serde default → `Youtube`)

Test totali nuovi: 6 unit Rust (3 sources × 2) + 2 aggregator + 2 stock_downloader + 2 keyring = 12. Tutti i test esistenti continuano a passare.
