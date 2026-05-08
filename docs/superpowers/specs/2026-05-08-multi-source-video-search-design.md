# Multi-source Video Search (Pixabay + Pexels) — Design Spec

**Date:** 2026-05-08
**Status:** Draft for review

## Goal

Estendere la search dei B-Roll con due sorgenti stock footage gratuite (Pixabay, Pexels) accanto a YouTube. L'utente inserisce le API key in Settings; appena presenti, i risultati delle nuove sorgenti compaiono nella stessa grid del picker, mischiati con YouTube via round-robin.

## Stack

Tauri 2 + React + Rust backend (esistente). Nessuna nuova dipendenza Rust eccetto `futures` (potrebbe esserci già; altrimenti `tokio::join!` è nativo). Lato frontend nessuna nuova dipendenza.

---

## 1. Domain types

`src-tauri/src/domain.rs`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum VideoSourceId {
    Youtube,
    Pixabay,
    Pexels,
}

impl Default for VideoSourceId {
    fn default() -> Self { Self::Youtube }
}

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

`#[serde(default)]` su `source` e `stream_url` garantisce che progetti già su disco (con vecchi `selected_video` senza questi campi) si deserializzino correttamente.

Frontend `src/types.ts` corrispondente:
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

---

## 2. Trait `VideoSource` + 3 impl

Riorganizzo `src-tauri/src/youtube_search.rs` in `src-tauri/src/search/`:

```
src-tauri/src/search/
├── mod.rs        # trait + MultiSourceSearch aggregator
├── youtube.rs    # codice yt-dlp esistente, refactored as impl VideoSource
├── pixabay.rs    # PixabaySource HTTP API
└── pexels.rs     # PexelsSource HTTP API
```

`mod.rs`:
```rust
use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::AppResult;
use async_trait::async_trait;
use std::sync::Arc;

#[async_trait]
pub trait VideoSource: Send + Sync {
    fn id(&self) -> VideoSourceId;
    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>>;
}

pub struct MultiSourceSearch {
    sources: Vec<Arc<dyn VideoSource>>,
}

impl MultiSourceSearch {
    pub fn new(sources: Vec<Arc<dyn VideoSource>>) -> Self { Self { sources } }

    pub async fn search(&self, keyword: &str, per_source: u8) -> Vec<VideoCandidate> {
        let kw = keyword.to_string();
        let futs: Vec<_> = self.sources.iter().map(|s| {
            let s = s.clone();
            let kw = kw.clone();
            async move { (s.id(), s.search(&kw, per_source).await) }
        }).collect();
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
            if i < list.len() { out.push(list[i].clone()); }
        }
    }
    out
}
```

### `pixabay.rs`
- Endpoint: `GET https://pixabay.com/api/videos/?key=<KEY>&q=<keyword>&per_page=<limit>&video_type=film&safesearch=true`
- Response: `{ hits: [{ id, duration, picture_id, user, videos: { medium: { url } }, pageURL, tags }] }`
- Mapping:
  - `video_id = hits[i].id.to_string()`
  - `title = hits[i].tags` (Pixabay non ha title field; uso tags ~80 char)
  - `channel = hits[i].user`
  - `duration_sec = hits[i].duration`
  - `thumb_url = format!("https://i.vimeocdn.com/video/{}_640x360.jpg", picture_id)`
  - `stream_url = Some(hits[i].videos.medium.url)`
  - `url = hits[i].pageURL`
- Tests: 2 mocked (success + 4xx).

### `pexels.rs`
- Endpoint: `GET https://api.pexels.com/videos/search?query=<keyword>&per_page=<limit>` con header `Authorization: <KEY>`
- Response: `{ videos: [{ id, duration, image, user: { name, url }, video_files: [{ link, quality, width, height }], url }] }`
- Mapping:
  - `video_id = videos[i].id.to_string()`
  - `title = videos[i].url.split('/').last()` (Pexels non ha title; uso lo slug della pageURL)
  - `channel = videos[i].user.name`
  - `duration_sec = videos[i].duration`
  - `thumb_url = videos[i].image`
  - `stream_url`: cerca `video_files` con `quality == "hd"` AND `height <= 720`; fallback al primo file disponibile
  - `url = videos[i].url`
- Tests: 2 mocked (success + 401).

### `youtube.rs`
Codice attuale di `youtube_search.rs` riorganizzato come `impl VideoSource for YouTubeSource`. Popola `source: Youtube`, `stream_url: None` (YouTube usa iframe; lo stream effettivo lo gestisce yt-dlp al pick).

### Cargo.toml
Aggiungo `futures = "0.3"` come dipendenza esplicita di `[dependencies]` (anche se transitive via tokio). Serve per `futures::future::join_all` (aggregator) e `futures::StreamExt::next` (stock downloader). Niente altre nuove deps.

---

## 3. Settings & keyring

`settings_store.rs`:
```rust
const KEYRING_USER_PIXABAY: &str = "pixabay_api_key";
const KEYRING_USER_PEXELS: &str = "pexels_api_key";

pub fn set_pixabay_key(key: &str) -> AppResult<()> { ... }
pub fn get_pixabay_key() -> AppResult<Option<String>> { ... }
pub fn delete_pixabay_key() -> AppResult<()> { ... }
// stesso per pexels (3 funzioni)
```

`AppSettings` immutato.

Nuovi comandi Tauri:
- `settings_set_pixabay_key(key: String)`
- `settings_set_pexels_key(key: String)`
- `settings_test_pixabay()` — esegue una search "nature" via PixabaySource, ritorna `true` se >= 1 hit
- `settings_test_pexels()` — idem

`search_run` rifatto:
```rust
#[tauri::command]
pub async fn search_run(state: State<'_, AppState>, keyword: String) -> AppResult<Vec<VideoCandidate>> {
    let ytdlp = await_ytdlp(&state).await?;
    let mut sources: Vec<Arc<dyn VideoSource>> = vec![Arc::new(YouTubeSource::new(ytdlp))];
    if let Some(k) = SettingsStore::get_pixabay_key()? { sources.push(Arc::new(PixabaySource::new(k))); }
    if let Some(k) = SettingsStore::get_pexels_key()?  { sources.push(Arc::new(PexelsSource::new(k))); }
    let agg = MultiSourceSearch::new(sources);
    Ok(agg.search(&keyword, 9).await)
}
```

---

## 4. Frontend

### SettingsPage
Nuova sezione "Sorgenti video aggiuntive" dopo Trascrizione, in stile BeeRoll:
- Etichetta "YouTube (sempre attivo)"
- Pixabay: input password + bottone "Salva e testa" + link `pixabay.com/api/`
- Pexels: idem + link `pexels.com/api/`
- Stato per-source: idle / saving / testing / ok / error.

Estensioni `src/ipc.ts`:
```ts
settingsSetPixabayKey: (key: string) => invoke<void>("settings_set_pixabay_key", { key }),
settingsTestPixabay:   () => invoke<boolean>("settings_test_pixabay"),
settingsSetPexelsKey:  (key: string) => invoke<void>("settings_set_pexels_key", { key }),
settingsTestPexels:    () => invoke<boolean>("settings_test_pexels"),
```

### VideoGrid (card thumbnail)
Aggiungo badge sorgente in alto a destra (sopra duration):
```tsx
<span className={`absolute top-1 right-1 font-mono text-[10px] font-bold px-1.5 py-0.5 ${badgeClass(r.source)}`}>
  {sourceShortLabel(r.source)}
</span>
```
- `youtube` → `YT`, sfondo rosso `#FF0000`, testo bianco
- `pixabay` → `PX`, sfondo verde `#2EC56C`, testo bianco
- `pexels`  → `PE`, sfondo nero, testo bianco

Sotto il titolo: `<source>: <channel>` invece di solo channel.

`thumb_url` viene letto dal candidate (non più hardcoded `i.ytimg.com`). Per YouTube il backend continua a popolare `https://i.ytimg.com/vi/<id>/mqdefault.jpg`.

### PreviewPane
Player condizionale:
```tsx
if (candidate.source === "youtube") {
  return <iframe src={`https://www.youtube-nocookie.com/embed/${candidate.video_id}?autoplay=1&mute=${muted ? 1 : 0}`} ... />;
}
if (candidate.stream_url) {
  return <video src={candidate.stream_url} controls autoPlay muted={muted} className="w-full h-full" />;
}
return <div>Anteprima non disponibile · <a href={candidate.url} target="_blank">Apri su {sourceLabel(candidate.source)}</a></div>;
```

---

## 5. Download stock (HTTP diretto)

Nuovo modulo `src-tauri/src/stock_downloader.rs`:

```rust
pub struct StockDownloader {
    client: reqwest::Client,
}

impl StockDownloader {
    pub fn new() -> Self { Self { client: reqwest::Client::new() } }

    pub async fn download<F>(&self, url: &str, output: &Path, mut on_progress: F) -> AppResult<PathBuf>
    where F: FnMut(DownloadProgress) + Send,
    {
        use tokio::io::AsyncWriteExt;
        let resp = self.client.get(url).send().await?;
        let total = resp.content_length();
        let mut downloaded: u64 = 0;
        let mut file = tokio::fs::File::create(output).await?;
        let mut stream = resp.bytes_stream();
        let mut last_emit = std::time::Instant::now();
        while let Some(chunk) = futures::StreamExt::next(&mut stream).await {
            let chunk = chunk?;
            file.write_all(&chunk).await?;
            downloaded += chunk.len() as u64;
            // Throttle progress events to ~5/s
            if last_emit.elapsed() > std::time::Duration::from_millis(200) {
                let percent = total.map(|t| downloaded as f32 / t as f32 * 100.0).unwrap_or(0.0);
                on_progress(DownloadProgress { percent, eta_sec: None });
                last_emit = std::time::Instant::now();
            }
        }
        file.flush().await?;
        Ok(output.to_path_buf())
    }
}
```

`pick_video` in `commands.rs` discrimina per `candidate.source`:
- `Youtube` → `DownloadManager` esistente
- `Pixabay | Pexels` → `StockDownloader` su `candidate.stream_url`

Output filename: `<id>.mp4` (Pixabay/Pexels servono mp4 puri).

### Overlay copyright
In `pick_video`, costruisco la stringa overlay:
```rust
let overlay = match candidate.source {
    VideoSourceId::Youtube => format!("© {}", candidate.channel),
    VideoSourceId::Pixabay => format!("© {} · Pixabay", candidate.channel),
    VideoSourceId::Pexels  => format!("© {} · Pexels",  candidate.channel),
};
vp.apply_copyright_overlay(&raw_path, &final_path, &overlay).await?;
```

La signature di `apply_copyright_overlay` (`channel_name: &str`) **non cambia**: il parametro viene già escaped via `escape_drawtext` e usato come testo overlay. Passandogli direttamente la stringa formattata `"© user · Pixabay"` (che già contiene `©`), ffmpeg renderizza correttamente. Solo il call site cambia. Il test integration esistente passa `"TestChannel"` letterale e continua a funzionare.

---

## 6. Test

| Test | Cosa verifica |
|---|---|
| `pixabay::tests::search_returns_first_hit` | Mocked 200, parsing JSON Pixabay, candidate ben formato |
| `pixabay::tests::search_propagates_4xx_as_error` | Mocked 400, ritorna `AppError::AiProvider` |
| `pexels::tests::search_returns_first_hit` | Mocked 200, parsing JSON Pexels |
| `pexels::tests::search_propagates_401_as_error` | Mocked 401 |
| `multi::interleave_round_robin` | 3 sources con 3,2,1 risultati → ordine corretto |
| `multi::skips_failed_source` | 1 source Err, 2 Ok → solo gli Ok finiscono in output |
| `youtube::tests::*` | esistenti, invariati |

Frontend:
- `PickerPage.test.tsx`: aggiornato per usare `source: "youtube"` su mock candidate (backwards compat tramite default)
- Playwright `e2e-pw/timeline.spec.ts`: aggiungo un test screenshot della grid con source mix

---

## 7. Errori

| Caso | UX |
|---|---|
| API key Pixabay invalida (400) | Toast "Pixabay: chiave non valida" durante search; source skippato per il resto della session |
| API key Pexels invalida (401) | Idem |
| Rate limit Pexels (429) | Toast "Pexels rate-limited, riprova fra un'ora"; source disabilitato per N minuti |
| `stream_url` mancante | PreviewPane mostra placeholder + link "Apri su Pixabay/Pexels" |
| StockDownloader HTTP fail | Status `error`, toast "Download fallito: <message>" |

---

## 8. Scope

### Dentro
- Pixabay e Pexels
- Settings con due API key indipendenti
- Aggregator parallelo + interleave
- Player video nativo per stock
- Download HTTP diretto via reqwest streaming
- Overlay con attribution (`© user · source`)
- Test mocked + integration esistenti

### Fuori (futuro)
- Storyblocks/Vimeo/Mixkit
- Toggle on/off per provider (oltre a "no key = off")
- Cache search 24h per stock results
- Filtri (durata, orientation, qualità) per source
- Account-level rate limit tracking
- Whisper locale offline (separato)

---

## 9. Migration

Project file esistenti (`project.json`) hanno già `selected_video: VideoCandidate` senza `source`/`stream_url`. Il `#[serde(default)]` li deserializza con `source: Youtube, stream_url: None`. Nessuno script di migrazione necessario.
