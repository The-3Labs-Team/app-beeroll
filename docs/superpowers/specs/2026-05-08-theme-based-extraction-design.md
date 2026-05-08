# Theme-based B-Roll Extraction — Design Spec

**Date:** 2026-05-08
**Status:** Draft for review

## Goal

Cambiare la granularità di estrazione dei punti B-Roll da "una keyword ogni frase" a "una keyword per blocco tematico", con cap di 30 secondi. Le keyword diventano larghe e visuali (ottimizzate per stock footage), non letterali al testo. Per voiceover audio l'AI riceve i timestamp Whisper e li riusa per popolare `t_start`/`t_end`.

## Stack

Cambio circoscritto a `src-tauri/src/extractor.rs` + `commands.rs::extraction_run` + `domain.rs` (campo `theme`) + frontend per visualizzare il theme. Nessuna nuova dipendenza.

---

## 1. Prompt redesign

### System prompt
Sostituisce l'attuale one-liner. Istruisce esplicitamente:
1. Segmenta per **cambio di tema**, non per frase. Stessa B-Roll per più frasi se condividono argomento.
2. Cap **30 secondi**: blocchi che superano si splittano in più punti consecutivi.
3. Ogni punto ha un campo `theme` (2-4 parole inglesi descrittive).
4. Genera **2-3 keyword larghe e visuali** (inglese), evitando nomi propri e citazioni letterali. Ottimizzate per YouTube/Pixabay/Pexels.
5. Se l'input ha timestamp, popola `t_start`/`t_end` (secondi). Altrimenti omettili.

Testo completo (in `src-tauri/src/extractor.rs`):

```
You are an expert video editor identifying B-Roll opportunities in a voiceover transcript.

Your goal: segment the transcript into THEMATIC BLOCKS, not sentences. A new B-Roll point starts only when the topic genuinely changes — keep the same B-Roll across multiple sentences if they share the same subject.

Rules:
1. Split the transcript by THEME CHANGE (e.g. shifting from "Putin's decisions" to "Ukrainian frontline" = new point). Stay on the same point if the speaker keeps elaborating on the same subject.
2. Cap each block at 30 seconds. If a single theme exceeds 30s of voiceover, split it into multiple consecutive points sharing the same theme.
3. For each point, write a short `theme` tag (2-4 words, English) describing what visually we want to show.
4. Generate 2-3 BROAD VISUAL keywords (English) optimized for stock footage search. Avoid proper names and literal quotes; prefer visual concepts.
   - "Putin gave a speech about Ukraine" → keywords: ["world leader podium", "kremlin press conference", "political speech crowd"]
   - "I started running in the mountains" → keywords: ["trail running mountains", "alpine running scenic", "mountain runner sunrise"]
5. If timestamps are provided, include `t_start` and `t_end` (seconds) for each point matching the voiceover timing exactly. Otherwise omit them.

Return ONLY valid JSON:
{
  "points": [
    {
      "theme": "<short visual tag>",
      "phrase": "<excerpt from transcript covering this block>",
      "keywords": ["broad keyword 1", "broad keyword 2", "broad keyword 3"],
      "t_start": <number, optional>,
      "t_end": <number, optional>
    }
  ]
}
```

### User prompt — due varianti

**Plain text** (voiceover testuale):
```
Voiceover transcript (no timestamps):

<full text>

Return the JSON now.
```

**Timestamped** (voiceover audio con `project.transcript` popolato):
```
Voiceover transcript with timestamps:

[0.0s-4.2s] Oggi parliamo di trail running.
[4.2s-9.8s] Ho iniziato a correre in montagna...
[9.8s-15.1s] Le scarpe migliori sono...

Return the JSON now.
```

---

## 2. Domain model

### `BRollPoint` extension

`src-tauri/src/domain.rs`:
```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BRollPoint {
    pub id: String,
    #[serde(default)]
    pub theme: String,             // NEW
    pub phrase: String,
    pub t_start: Option<f64>,
    pub t_end: Option<f64>,
    pub keywords: Vec<String>,
    pub active_keyword: String,
    pub status: BRollStatus,
    pub selected_video: Option<VideoCandidate>,
    pub output_clip: Option<String>,
}
```

`#[serde(default)]` su `theme` = `""` per project file esistenti su disco (nessuna migration).

Frontend `src/types.ts`:
```ts
export interface BRollPoint {
  id: string;
  theme: string;
  phrase: string;
  // ... resto invariato
}
```

---

## 3. Extractor refactor

### Nuovo `ExtractionInput` enum

`src-tauri/src/extractor.rs`:
```rust
use crate::domain::TranscriptSegment;

pub enum ExtractionInput<'a> {
    PlainText(&'a str),
    Timestamped(&'a [TranscriptSegment]),
}
```

### `BRollExtractor::extract` cambia signature
Prima: `extract(transcript_text: &str)`.
Dopo: `extract(input: ExtractionInput<'_>)`.

Build user prompt in funzione del variant:
```rust
let user_prompt = match input {
    ExtractionInput::PlainText(t) => format!(
        "Voiceover transcript (no timestamps):\n\n{t}\n\nReturn the JSON now."
    ),
    ExtractionInput::Timestamped(segs) => {
        let lines: Vec<String> = segs.iter()
            .map(|s| format!("[{:.1}s-{:.1}s] {}", s.start, s.end, s.text.trim()))
            .collect();
        format!(
            "Voiceover transcript with timestamps:\n\n{}\n\nReturn the JSON now.",
            lines.join("\n")
        )
    }
};
```

### Schema response esteso
```rust
#[derive(Deserialize)]
struct ExtractedPoint {
    #[serde(default)]
    theme: String,
    phrase: String,
    keywords: Vec<String>,
    #[serde(default)]
    t_start: Option<f64>,
    #[serde(default)]
    t_end: Option<f64>,
}
```

Mapping a `BRollPoint`:
```rust
BRollPoint {
    id: format!("bp_{:02}", i + 1),
    theme: p.theme,
    phrase: p.phrase,
    t_start: p.t_start,
    t_end: p.t_end,
    active_keyword: p.keywords.first().cloned().unwrap_or_default(),
    keywords: p.keywords,
    status: BRollStatus::Pending,
    selected_video: None,
    output_clip: None,
}
```

---

## 4. `commands.rs::extraction_run`

```rust
let store = /* current_project unwrap */;
let project = store.project().await;

let txt: String;  // owned per lifetime
let input = match project.voiceover.kind {
    VoiceoverKind::Text => {
        let path = state.projects_root.join(&project.slug).join(&project.voiceover.path);
        txt = tokio::fs::read_to_string(&path).await?;
        ExtractionInput::PlainText(&txt)
    }
    VoiceoverKind::Audio => {
        if project.transcript.is_empty() {
            return Err(AppError::InvalidInput("transcript missing — run transcription first".into()));
        }
        ExtractionInput::Timestamped(&project.transcript)
    }
};

let provider = create_provider_from_settings()?;
let extractor = BRollExtractor::new(provider);
app.emit("extraction.progress", json!({"step":"calling_ai","message":"Identifying themes…"})).ok();
let points = extractor.extract(input).await?;

for p in &points {
    store.add_broll_point(p.clone()).await?;
}
app.emit("project.updated", &store.project().await).ok();
Ok(points)
```

(La struttura dei branch può essere semplificata; il cuore è il match su `voiceover.kind`.)

---

## 5. Frontend

### `KeywordHeader.tsx`
Aggiunge prop `theme?: string`. Sopra la `<h1>` con keyword highlighted, mostra il theme come label mono uppercase tono mute (solo se non vuoto):

```tsx
{theme && (
  <div className="flex items-center gap-2 mb-1">
    <span className="inline-block w-1 h-3 bg-bee-yellow" />
    <span className="font-mono text-[10px] font-bold tracking-[0.6px] uppercase text-bee-mute">
      {theme}
    </span>
  </div>
)}
```

### `PickerPage.tsx`
Passa `theme={point.theme}` a `KeywordHeader`.

### `ReviewPage.tsx`
Nella card di ogni punto B-Roll, mostra `theme` come pill mono accanto al numero `01/14`:
```tsx
<div className="flex items-center gap-2 mb-2">
  <span className="font-mono text-[11px] font-bold bg-bee-ink text-bee-yellow px-1.5 py-0.5">{padded(i+1)}</span>
  {p.theme && <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-bee-mute">▶ {p.theme}</span>}
  <span className="font-mono text-[11px] text-bee-mute capitalize ml-auto">{p.status}</span>
</div>
```

---

## 6. Test

### Rust (`extractor.rs`)
- `extract_parses_themes_keywords_and_timestamps`: mock con 2 punti completi (theme + keywords + t_start/t_end), verifica mapping
- `extract_with_timestamped_input_formats_user_prompt`: cattura il prompt inviato al provider, verifica che contenga `[0.0s-4.2s] ...`
- `extract_parses_well_formed_json`: aggiornato per nuovo schema (`theme` presente)
- `extract_strips_markdown_fences`: invariato
- `extract_errors_on_malformed_json`: invariato

### Vitest
`PickerPage.test.tsx`: i mock candidate non cambiano, ma i mock `BRollPoint` devono includere `theme: "trail running"` (o `""`) per il nuovo schema TS.

### Playwright
Lo store mock in `e2e-pw/timeline.spec.ts` deve aggiungere `theme` ai punti B-Roll. Asserisco che il theme appare nel header.

---

## 7. Errori

| Caso | UX |
|---|---|
| AI omette `theme` | `theme = ""`, header non lo mostra. Nessun blocco. |
| AI omette `t_start`/`t_end` su voiceover audio | Il punto compare in lista, ma timeline EDL/FCPXML cade su placement sequenziale (comportamento attuale) |
| AI ignora cap 30s | Lasciamo passare. Il modello è probabilistico; il cap è soft. Se diventa un problema, follow-up: validate output → re-prompt. |
| AI restituisce keyword troppo specifiche | Lasciamo passare per ora. L'utente può comunque editare la keyword nel Picker. |
| Provider audio senza transcript | Errore "transcript missing — run transcription first". Già coperto. |

---

## 8. Scope

### Dentro
- Prompt redesign (system + user variant)
- `theme` aggiunto a `BRollPoint`
- `ExtractionInput` enum + extract refactor
- `extraction_run` formatter audio/text discriminato
- Frontend: theme nell'header + Review
- Test rust aggiornati + 2 nuovi

### Fuori (futuro)
- Validazione automatica del cap 30s lato Rust (se il modello non rispetta, splittare automaticamente)
- Re-extraction su progetti esistenti (oggi: nuovo progetto)
- Multi-pass extraction (Approccio B se A non basta)
- Embeddings locali per detecting cambio tematico (Approccio C)
- Suggerimenti keyword alternative se la prima search non dà risultati

### Migration
Project file esistenti: `theme = ""` via serde default. Niente da fare.
