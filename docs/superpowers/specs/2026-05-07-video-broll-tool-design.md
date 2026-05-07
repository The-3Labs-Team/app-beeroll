# Video B-Roll Tool — Design Spec

**Data:** 2026-05-07
**Stato:** Bozza per revisione
**Autore:** Brainstorming session con utente

## 1. Obiettivo

Tool desktop multipiattaforma "click & run" che, dato il voiceover di un video, individua i punti dove servono B-Roll, propone candidati YouTube per ogni punto, li lascia anteprimare all'utente con player reale e li scarica già con overlay di copyright pronto per il montaggio.

**Utente target:** content creator, editor video, podcaster — utenti senza competenze tecniche che oggi cercano i B-Roll a mano spendendoci ore.

**Successo del progetto:**
- Un utente non tecnico installa il tool con un doppio click e produce un set di B-Roll completo per un voiceover di 5 minuti in meno di 15 minuti totali (di cui ~2 minuti di lavoro attivo).
- Zero configurazione richiesta per partire (tranne, opzionalmente, una API key per l'AI).
- Output utilizzabile direttamente in Premiere/DaVinci/CapCut/Final Cut.

## 2. Stack tecnologico

| Strato | Scelta | Motivazione |
|---|---|---|
| **Shell desktop** | Tauri 2 | Bundle leggero (~20MB vs ~150MB Electron), webview nativo, installer firmabili via tauri-action |
| **Backend** | Rust | Orchestrazione di processi esterni (ffmpeg, yt-dlp), IPC fortemente tipizzato verso il frontend, performance e sicurezza native |
| **Frontend** | React + TypeScript + Vite | Maturità ecosystem, rapidità di sviluppo per UI con grid + player + timeline |
| **Stato UI** | Zustand | Store leggero, niente boilerplate Redux, replica naturale dello stato backend |
| **Stile** | Tailwind CSS + shadcn/ui | Componenti già pronti, design coerente |
| **Video processing** | ffmpeg (bundlato static) | De facto standard, overlay testo via filtro `drawtext` |
| **YouTube** | yt-dlp (auto-aggiornato) + opzionale Google Data API v3 | yt-dlp out-of-the-box, API per chi vuole stabilità |
| **Trascrizione** | whisper.cpp (bundlato, modello `small`) + opzionale OpenAI/Groq Whisper API | Default offline, opzione API per chi vuole velocità |
| **AI** | Multi-provider: Anthropic API, OpenAI API, Ollama, Claude CLI, Codex CLI | Massima flessibilità, sfrutta abbonamenti esistenti dell'utente |

## 3. Flusso utente

### 3.1 Schermate (single-page wizard)

1. **Splash / progetti** — elenco progetti recenti, "Nuovo progetto" o "Riprendi"
2. **Import voiceover** — drag&drop di file audio (mp3/wav/m4a) **oppure** testo (.txt/.srt)
3. **Estrazione punti B-Roll** — loader + risultato AI (lista frasi + keyword proposte), modificabile
4. **Picker** (loop, una pagina per punto B-Roll) — *cuore dell'app*
5. **Riepilogo finale** — clip prodotti, "Apri cartella", "Esporta EDL/FCPXML"

### 3.2 Layout schermata Picker

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [←]   sneakers running mountain trail              [✎]  [Skip]          │
│  ────────────────────────────────────────────────────────────────────── │
│  ┌──────────────────────────────────┐  ┌────────────────────────────┐  │
│  │ ┌─────┐  ┌─────┐  ┌─────┐        │  │                              │  │
│  │ │ thb │  │▓thb▓│  │ thb │        │  │   ▶  YouTube IFrame Player  │  │
│  │ │1m23 │  │2m05 │  │0m48 │        │  │     (video selezionato)      │  │
│  │ └─────┘  └─────┘  └─────┘        │  │                              │  │
│  │ ┌─────┐  ┌─────┐  ┌─────┐        │  │                              │  │
│  │ │ thb │  │ thb │  │ thb │        │  │  ────────────────────────    │  │
│  │ └─────┘  └─────┘  └─────┘        │  │  Trail Running 4K Stunning   │  │
│  │ ┌─────┐  ┌─────┐  ┌─────┐        │  │  by © MountainCine • 2:05    │  │
│  │ │ thb │  │ thb │  │ thb │        │  │                              │  │
│  │ └─────┘  └─────┘  └─────┘        │  │  [   Scarica e usa  ✓   ]   │  │
│  │                                    │  │  [   Apri su YouTube ↗  ]   │  │
│  └──────────────────────────────────┘  └────────────────────────────┘  │
│  ────────────────────────────────────────────────────────────────────── │
│  ▓▓▓▓▓░░░◉░░░░░░░░░░░░░░░░░░░░░░  3/24 punti                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Tre livelli di anteprima

| Azione | Cosa vede l'utente | Tech | Costo |
|---|---|---|---|
| **Hover** thumbnail | Storyboards YouTube `.webp` animati (~100 frame, scrubbing rapido) | CSS background-position su immagine pubblica `https://i.ytimg.com/sb/<id>/storyboard3_L1/...` | ~50KB, istantaneo |
| **Click** thumbnail | Player YouTube embed nel pannello destro (riproduzione, audio, controlli) | YouTube IFrame Player API (`<iframe src="youtube.com/embed/ID?autoplay=1&mute=1">`) | Streaming standard YouTube |
| **"Scarica e usa"** | Download in background, salta al punto successivo | yt-dlp + ffmpeg overlay | Banda + storage locale |

### 3.4 Keyboard shortcuts

- `1-9` → seleziona N-esimo video (carica iframe a destra)
- `Invio` → "Scarica e usa" sul video in preview
- `→` skip al prossimo punto, `←` torna al precedente
- `r` ri-cerca con keyword corrente, `e` edita keyword
- `m` toggle audio del player, `Spazio` play/pausa player
- `Esc` chiude preview

### 3.5 Timeline punti B-Roll

Striscia orizzontale in fondo. Ogni punto è un quadratino. Mappa stati persistenti (vedi 4.3) → indicatore visuale:

| Stato persistente | Indicatore | Note |
|---|---|---|
| `pending`, `searching`, `picking` | `░` | Stati pre-download collassati visivamente |
| `downloading` | `▒` | In download / overlay in corso |
| `done` | `▓` | Scaricato + overlay applicato |
| `skipped` | `╳` | Saltato dall'utente |
| `error` | `✗` (rosso) | Fallimento permanente |
| (corrente, qualunque stato) | `◉` lampeggiante | Sovrasta gli altri |

Click su quadratino → naviga a quel punto. Tooltip su hover con la frase originale.

## 4. Architettura

### 4.1 Diagramma componenti

```
┌─────────────────────────────────────────────────┐
│  Frontend (React + TS, dentro WebView Tauri)    │
│  ────────────────────────────────────────────   │
│  Pagine: Projects | Import | Review | Picker    │
│  Stato: Zustand | UI: Tailwind + shadcn         │
└──────────────┬──────────────────────────────────┘
               │  Tauri IPC (commands + events)
┌──────────────▼──────────────────────────────────┐
│  Backend Rust                                    │
│  ────────────────────────────────────────────   │
│  • ProjectStore         (JSON su disco)         │
│  • TranscriptionService (whisper)               │
│  • BRollExtractor       (AI provider)           │
│  • YouTubeSearch        (yt-dlp / Data API)     │
│  • DownloadManager      (queue parallela)       │
│  • VideoProcessor       (ffmpeg overlay)        │
│  • AIProviderRegistry   (Claude/OpenAI/Ollama   │
│                          /Claude CLI/Codex CLI) │
│  • ToolchainManager     (yt-dlp updater)        │
│  • ExportService        (EDL/FCPXML)            │
└──────────────┬──────────────────────────────────┘
               │  spawn / HTTP
┌──────────────▼──────────────────────────────────┐
│  Tool esterni                                    │
│  ffmpeg (bundled)  yt-dlp (auto-updated)        │
│  whisper.cpp (bundled)  AI APIs / CLI utente    │
└─────────────────────────────────────────────────┘
```

**Principio guida:** il backend Rust **non implementa** ffmpeg, yt-dlp, whisper o AI — li orchestra. Ogni modulo del backend ha una sola responsabilità, comunica via IPC con il frontend tramite eventi nominati (`project.updated`, `download.progress`, `transcription.progress`, ecc.).

### 4.2 Moduli backend

| Modulo | Input | Output | Note |
|---|---|---|---|
| **TranscriptionService** | path audio | `[{start, end, text}]` | Default `whisper.cpp` bundled (~466MB modello small). Opzione API. |
| **BRollExtractor** | trascrizione | `[{phrase, t_start?, t_end?, suggested_keywords[]}]` | Prompt structured output JSON. Validazione schema in Rust con `serde`. |
| **AIProviderRegistry** | prompt | risposta testuale | Astrazione su 5 provider. Auto-detect dei CLI installati al boot. |
| **YouTubeSearch** | keyword | `[{video_id, title, channel, duration, thumb_url}]` | Default `yt-dlp --flat-playlist "ytsearch9:keyword"`. Cache 24h. |
| **DownloadManager** | video_id | path mp4 + progresso | Coda max 2 paralleli. Eventi `download.progress`. Cancellabile. |
| **VideoProcessor** | mp4 + nome canale | mp4 con overlay | Filtro ffmpeg `drawtext` (vedi 4.4). |
| **ProjectStore** | mutazioni | JSON su disco | Save debounced 500ms. Versionato (campo `version`). |
| **ToolchainManager** | — | stato runtime | Boot: scarica yt-dlp se mancante, controlla update (max 1/giorno). |
| **ExportService** | progetto | file `.edl` o `.fcpxml` | Genera lista clip con timing dal voiceover. |

### 4.3 Schema progetto su disco

`~/B-Roll Projects/<slug>/project.json`:

```json
{
  "version": 1,
  "name": "Episodio 12",
  "created_at": "2026-05-07T10:30:00Z",
  "voiceover": {
    "type": "audio",
    "path": "audio/source.mp3",
    "duration_sec": 312.4
  },
  "transcript": [
    { "start": 0.0, "end": 4.2, "text": "Oggi parliamo di trail running..." }
  ],
  "broll_points": [
    {
      "id": "bp_01",
      "phrase": "ho iniziato a correre in montagna",
      "t_start": 12.4,
      "t_end": 17.1,
      "keywords": ["mountain trail running", "alpine running"],
      "active_keyword": "mountain trail running",
      "status": "done",
      "_note": "Stati validi: pending | searching | picking | downloading | done | skipped | error",
      "selected_video": {
        "id": "abc123",
        "title": "Trail Running 4K Stunning",
        "channel": "MountainCine",
        "url": "https://www.youtube.com/watch?v=abc123",
        "duration_sec": 125
      },
      "output_clip": "clips/0003_mountain-trail-running.mp4"
    }
  ],
  "settings_snapshot": {
    "ai_provider": "anthropic_api",
    "transcription_provider": "local_whisper"
  }
}
```

Sub-cartelle del progetto:
- `audio/` — voiceover originale
- `clips/` — output con overlay applicato (numerati)
- `cache/` — risultati search YouTube (TTL 24h)

### 4.4 Overlay copyright (ffmpeg)

```bash
ffmpeg -i input.mp4 -vf "drawtext=text='© MountainCine':\
  x=24:y=h-th-24:\
  fontsize=24:fontcolor=white:\
  box=1:boxcolor=black@0.5:boxborderw=8:\
  fontfile=/path/to/Inter-Regular.ttf" \
  -codec:a copy output.mp4
```

- Posizione: bottom-left, padding 24px
- Sfondo nero semi-trasparente per leggibilità su qualunque clip
- Font Inter Regular bundlato nel binary (licenza OFL, redistribuibile)
- Audio copiato senza re-encoding
- Caratteri speciali nel nome canale escapati (apostrofi, due punti) prima di passare a ffmpeg

### 4.5 Eventi IPC backend → frontend

| Evento | Payload | Quando |
|---|---|---|
| `project.updated` | `Project` | Ogni mutazione persistente |
| `transcription.progress` | `{percent, current_text}` | Durante whisper |
| `extraction.progress` | `{step, message}` | Durante chiamata AI |
| `search.results` | `{point_id, results[]}` | Risultati search per un punto |
| `download.progress` | `{point_id, percent, eta_sec}` | Durante yt-dlp |
| `download.complete` | `{point_id, output_path}` | Download + overlay finiti |
| `download.error` | `{point_id, error}` | Errore qualunque step |
| `toolchain.update` | `{component, message}` | Update yt-dlp in corso |

## 5. Provider AI

### 5.1 Configurazione (Settings UI)

```
┌────────────────────────────────────────────────────────┐
│  Provider AI                                            │
│  ────────────────────────────────────────────────────  │
│  ◉ Claude API           [API Key: sk-ant-...]   [Test] │
│  ○ OpenAI API           [API Key: sk-...]       [Test] │
│  ○ Claude CLI           ✓ Rilevato                     │
│  ○ Codex CLI            ✗ Non installato              │
│  ○ Ollama (locale)      ✓ Rilevato, llama3.1          │
│                                                          │
│  Modello:   [Claude Sonnet 4.6 ▾]                       │
└────────────────────────────────────────────────────────┘
```

### 5.2 Auto-detection CLI

Al boot:
- macOS/Linux: `which claude` / `which codex` / `which ollama`
- Windows: `where.exe claude` / etc.
- Se trovato, badge "Rilevato" nelle settings, l'utente può selezionare il provider senza configurare nulla.

### 5.3 Invocazione provider

| Provider | Meccanismo |
|---|---|
| Anthropic API | HTTP POST a `https://api.anthropic.com/v1/messages` con prompt caching abilitato |
| OpenAI API | HTTP POST a `https://api.openai.com/v1/chat/completions` |
| Ollama | HTTP POST a `http://localhost:11434/api/generate` |
| Claude CLI | `claude -p "<prompt>" --output-format json` (subprocess) |
| Codex CLI | `codex exec --json "<prompt>"` (subprocess) |

Tutti i provider implementano un trait Rust comune `AIProvider` con `async fn complete(prompt) -> Result<String>`.

### 5.4 Storage API key

Mai in plain JSON. Uso del keyring di sistema:
- macOS: Keychain Services
- Windows: Credential Manager
- Linux: Secret Service / libsecret

Wrapper: crate `keyring-rs`.

### 5.5 Stima costi (5 min voiceover ≈ 750 parole, 10 punti B-Roll)

| Step | Claude API (Sonnet 4.6) | OpenAI API (GPT-4o) | Locale |
|---|---|---|---|
| Trascrizione (~5 min audio) | $0.03 (Whisper API) | $0.03 (Whisper API) | $0 (whisper.cpp bundled) |
| Estrazione punti + keyword (~1.8K token in / ~0.8K out) | ~$0.02 | ~$0.03 | $0 (Ollama) |
| **Totale per video** | **~$0.05** | **~$0.06** | **$0** |

Note: con prompt caching abilitato (Anthropic), riusare lo stesso system prompt su più video abbatte ulteriormente il costo dell'estrazione (~50% in meno dopo il primo).

## 6. Distribuzione

### 6.1 Build matrix (CI: GitHub Actions)

| Piattaforma | Artefatto | Firma | Note |
|---|---|---|---|
| macOS arm64 + x64 | `.dmg` universal | Apple Developer ID + notarization | $99/anno Apple Developer Program |
| Windows x64 | `.msi` (NSIS) | Authenticode (opzionale) | Senza firma → SmartScreen warning superabile |
| Linux x64 | `.AppImage` + `.deb` | — | AppImage = click & run puro |

### 6.2 Auto-update dell'app

Plugin `tauri-plugin-updater`:
- Controllo settimanale verso GitHub Releases
- Delta updates dove possibile
- L'utente vede toast "Update disponibile, riavvia"

### 6.3 Primo avvio (bootstrap)

1. Splash con stato setup
2. Verifica binari bundled (ffmpeg, whisper.cpp model) — installati con l'app
3. ToolchainManager controlla yt-dlp:
   - Non presente → scarica latest in `app_data_dir` (~12MB)
   - Presente → controlla update (max 1 volta/giorno per non fastidiare)
4. AIProviderRegistry rileva CLI installati
5. Se nessun provider AI configurato → onboarding modale:
   - "Ho un account Claude" → input API key (link `console.anthropic.com`)
   - "Uso già Claude Code da terminale" → auto-detect, ok
   - "Voglio offline" → guida installa Ollama (link, 1 click su Mac via brew)
6. Salva preferenze, mostra schermata progetti

### 6.4 Layout filesystem utente

```
~/B-Roll Projects/                                ← progetti utente
  └── episodio-12/
      ├── project.json
      ├── audio/source.mp3
      ├── clips/
      └── cache/

~/Library/Application Support/video-broll/        ← (macOS) app data
~/AppData/Roaming/video-broll/                    ← (Windows) app data
~/.config/video-broll/                            ← (Linux) app data
  ├── bin/yt-dlp                                  ← auto-aggiornato
  ├── cache/youtube-search/                       ← TTL 24h
  ├── cache/storyboards/                          ← preview hover
  └── settings.json                               ← (no api key qui)
```

### 6.5 Permessi WebView (Tauri config)

`tauri.conf.json`:
- CSP: consente `https://www.youtube.com`, `https://i.ytimg.com`, `https://*.googlevideo.com` per iframe + storyboards
- `allowlist.http.scope`: API endpoint dei provider configurati
- `allowlist.shell.scope`: solo i binari sidecar (`ffmpeg`, `yt-dlp`, `whisper`)

## 7. Gestione errori (casi principali)

| Caso | Comportamento |
|---|---|
| AI provider non risponde | Toast errore con bottone "Riprova". Stato del punto B-Roll resta `searching`, l'utente può cambiare provider. |
| yt-dlp ban temporaneo (rate limit) | Backoff esponenziale, suggerimento "Aggiungi una API key Google nelle impostazioni per più stabilità". |
| Download fallisce | Marker timeline diventa rosso, click → riprova o seleziona altro video. |
| Video age-restricted o privato | Filtrato dai risultati di search lato backend, non mostrato nella grid. |
| Whisper locale lento | Mostra ETA, suggerisce in modale "Vuoi provare Groq Whisper API? È ~10× più veloce". |
| ffmpeg crash su clip corrotto | Salva clip senza overlay come fallback, segna warning sul punto B-Roll. |
| Nessun risultato YouTube | Mostra "Nessun risultato per <keyword>", l'utente edita la keyword e ri-cerca. |

## 8. Testing

| Tipo | Scope | Tool |
|---|---|---|
| Unit (Rust) | Moduli backend isolati (parsing JSON AI, validazione schema, slug generation) | `cargo test` |
| Integration (Rust) | Spawn ffmpeg/yt-dlp con fixture file | `cargo test --features integration` |
| E2E (frontend) | Wizard flow completo con backend mockato | Playwright |
| Manual smoke | 1 voiceover reale 5min, 3 provider AI diversi, 3 OS | Checklist pre-release |

I provider AI sono testati con un set di trascrizioni di riferimento, verificando che l'output JSON sia parsabile e ragionevole. Non si testa il "merito" dei B-Roll (soggettivo).

## 9. Scope esplicito

### 9.1 Dentro lo scope

- Tool desktop macOS/Windows/Linux click & run
- Input audio o testo
- Estrazione punti B-Roll via AI (multi-provider)
- Search + preview + download YouTube
- Overlay copyright automatico
- Output: cartella clip + opzionale EDL/FCPXML
- Onboarding zero-config con auto-detect CLI
- Auto-update yt-dlp e dell'app stessa

### 9.2 Fuori scope (esplicitamente)

- Editing video integrato (montaggio, taglio fine, transizioni)
- Stock footage da fonti diverse da YouTube (Pexels, Pixabay, ecc.)
- Riconoscimento volti / scene matching automatico
- Pubblicazione diretta su social
- Account/sync cloud (il tool è 100% locale)
- Mobile (iOS/Android)
- Web app

### 9.3 Possibili estensioni future (non ora)

- Plugin per Pexels/Pixabay/Unsplash
- Auto-edit con sincronizzazione ai timestamp del voiceover
- Suggerimenti AI di musica di sottofondo
- Caching condiviso B-Roll tra progetti

## 10. Open questions

Nessuna bloccante. Decisioni minori da prendere durante implementazione:
- Numero esatto risultati per keyword (default 9, da validare con utente)
- Soglia minima durata video (default 30s, configurabile)
- Lingua default UI (italiano; AI risponde nella lingua dell'input)
