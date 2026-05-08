# Theme-based B-Roll Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambia la granularità di estrazione B-Roll da "una keyword per frase" a "una keyword per blocco tematico" con cap 30 secondi e keyword visuali larghe ottimizzate per stock footage. Per voiceover audio l'AI riceve i timestamp Whisper e popola `t_start`/`t_end`.

**Architecture:** Aggiunge campo `theme: String` a `BRollPoint` (con `#[serde(default)]` per backwards compat). Riscrive il system prompt di `BRollExtractor` con istruzioni esplicite su segmentazione tematica, cap 30s e keyword visuali. Introduce `ExtractionInput` enum (`PlainText` | `Timestamped`) per discriminare il formatter del user prompt. `extraction_run` switcha sul kind del voiceover. Frontend mostra il theme come label sopra la keyword nel Picker.

**Tech Stack:** Rust (serde, tokio, async-trait), TypeScript/React, Tauri 2 IPC.

---

## File Structure

### Modified files

- `src-tauri/src/domain.rs` — aggiunta `theme: String` con `#[serde(default)]`
- `src-tauri/src/extractor.rs` — nuovo prompt + `ExtractionInput` enum + extract refactor + 5 test
- `src-tauri/src/commands.rs::extraction_run` — formatter discriminato
- `src/types.ts` — `BRollPoint.theme: string`
- `src/components/KeywordHeader.tsx` — render `theme` se presente
- `src/pages/PickerPage.tsx` — passa `point.theme` a `KeywordHeader`
- `src/pages/ReviewPage.tsx` — pill mono `theme` accanto al numero
- `src/pages/PickerPage.test.tsx` — mock candidate con `theme` field
- `e2e-pw/timeline.spec.ts` — store mock con `theme` su tutti i punti

### No new files / no deletions.

---

## Task 1: Aggiungi `theme` a `BRollPoint` + types frontend

**Files:**
- Modify: `src-tauri/src/domain.rs`
- Modify: `src/types.ts`

- [ ] **Step 1: Estendi `BRollPoint` in `src-tauri/src/domain.rs`**

Trova la struct `BRollPoint`. Aggiungi `pub theme: String` con `#[serde(default)]` subito dopo `pub id: String`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BRollPoint {
    pub id: String,
    #[serde(default)]
    pub theme: String,
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

- [ ] **Step 2: Aggiorna `src/types.ts`**

Trova `interface BRollPoint`. Aggiungi `theme: string` subito dopo `id`:

```ts
export interface BRollPoint {
  id: string;
  theme: string;
  phrase: string;
  t_start: number | null;
  t_end: number | null;
  keywords: string[];
  active_keyword: string;
  status: BRollStatus;
  selected_video: VideoCandidate | null;
  output_clip: string | null;
}
```

- [ ] **Step 3: Verifica compilazione**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo check 2>&1 | tail -10
cd .. && npx tsc --noEmit 2>&1 | tail -10
```

Expected: cargo OK (le call site che istanziano `BRollPoint` lo prenderanno con `theme: ""` di default — ma se istanziano esplicitamente richiedono il campo). Se ci sono errori "missing field theme" in `extractor.rs`, `pixabay.rs`, ecc. è atteso e verrà sistemato nei task successivi.

TS può lamentare nei test mock — atteso, fixerà T6.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/domain.rs src/types.ts
git commit -m "feat: add theme field to BRollPoint"
```

---

## Task 2: Riscrivi `extractor.rs` con `ExtractionInput` enum + nuovo prompt

**Files:**
- Modify: `src-tauri/src/extractor.rs`

Questo task riscrive interamente il file `extractor.rs` (struttura + 5 test). Sostituisci tutto il contenuto con:

- [ ] **Step 1: Sostituisci il contenuto di `src-tauri/src/extractor.rs`**

```rust
use crate::ai::AIProvider;
use crate::domain::{BRollPoint, BRollStatus, TranscriptSegment};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::sync::Arc;

const SYSTEM_PROMPT: &str = "You are an expert video editor identifying B-Roll opportunities in a voiceover transcript.\n\nYour goal: segment the transcript into THEMATIC BLOCKS, not sentences. A new B-Roll point starts only when the topic genuinely changes — keep the same B-Roll across multiple sentences if they share the same subject.\n\nRules:\n1. Split the transcript by THEME CHANGE (e.g. shifting from 'Putin's decisions' to 'Ukrainian frontline' = new point). Stay on the same point if the speaker keeps elaborating on the same subject.\n2. Cap each block at 30 seconds. If a single theme exceeds 30s of voiceover, split it into multiple consecutive points sharing the same theme.\n3. For each point, write a short `theme` tag (2-4 words, English) describing what visually we want to show.\n4. Generate 2-3 BROAD VISUAL keywords (English) optimized for stock footage search. Avoid proper names and literal quotes; prefer visual concepts.\n   - 'Putin gave a speech about Ukraine' -> keywords: ['world leader podium', 'kremlin press conference', 'political speech crowd']\n   - 'I started running in the mountains' -> keywords: ['trail running mountains', 'alpine running scenic', 'mountain runner sunrise']\n5. If timestamps are provided, include `t_start` and `t_end` (seconds) for each point matching the voiceover timing exactly. Otherwise omit them.\n\nReturn ONLY valid JSON:\n{\n  \"points\": [\n    {\n      \"theme\": \"<short visual tag>\",\n      \"phrase\": \"<excerpt from transcript covering this block>\",\n      \"keywords\": [\"broad keyword 1\", \"broad keyword 2\", \"broad keyword 3\"],\n      \"t_start\": <number, optional>,\n      \"t_end\": <number, optional>\n    }\n  ]\n}";

/// Input for extraction. Plain text loses theme-cap precision; timestamped
/// gives the model real-time anchors so the 30s cap is enforceable.
pub enum ExtractionInput<'a> {
    PlainText(&'a str),
    Timestamped(&'a [TranscriptSegment]),
}

#[derive(Deserialize)]
struct ExtractionResponse {
    points: Vec<ExtractedPoint>,
}

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

pub struct BRollExtractor {
    provider: Arc<dyn AIProvider>,
}

impl BRollExtractor {
    pub fn new(provider: Arc<dyn AIProvider>) -> Self {
        Self { provider }
    }

    pub async fn extract(&self, input: ExtractionInput<'_>) -> AppResult<Vec<BRollPoint>> {
        let user_prompt = build_user_prompt(input);
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
                theme: p.theme,
                phrase: p.phrase,
                t_start: p.t_start,
                t_end: p.t_end,
                active_keyword: p.keywords.first().cloned().unwrap_or_default(),
                keywords: p.keywords,
                status: BRollStatus::Pending,
                selected_video: None,
                output_clip: None,
            })
            .collect())
    }
}

fn build_user_prompt(input: ExtractionInput<'_>) -> String {
    match input {
        ExtractionInput::PlainText(t) => format!(
            "Voiceover transcript (no timestamps):\n\n{t}\n\nReturn the JSON now."
        ),
        ExtractionInput::Timestamped(segs) => {
            let lines: Vec<String> = segs
                .iter()
                .map(|s| format!("[{:.1}s-{:.1}s] {}", s.start, s.end, s.text.trim()))
                .collect();
            format!(
                "Voiceover transcript with timestamps:\n\n{}\n\nReturn the JSON now.",
                lines.join("\n")
            )
        }
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
        fn name(&self) -> &'static str {
            "mock"
        }
        async fn complete(&self, _s: &str, _u: &str) -> AppResult<String> {
            Ok(self.response.clone())
        }
    }

    #[tokio::test]
    async fn extract_parses_well_formed_json() {
        let provider = Arc::new(MockProvider {
            response: r#"{"points":[{"theme":"trail running","phrase":"trail running","keywords":["trail","mountain"]}]}"#.into(),
        });
        let extractor = BRollExtractor::new(provider);
        let points = extractor
            .extract(ExtractionInput::PlainText("some transcript"))
            .await
            .unwrap();
        assert_eq!(points.len(), 1);
        assert_eq!(points[0].theme, "trail running");
        assert_eq!(points[0].phrase, "trail running");
        assert_eq!(points[0].active_keyword, "trail");
        assert_eq!(points[0].id, "bp_01");
    }

    #[tokio::test]
    async fn extract_strips_markdown_fences() {
        let provider = Arc::new(MockProvider {
            response: "```json\n{\"points\":[{\"theme\":\"x\",\"phrase\":\"x\",\"keywords\":[\"y\"]}]}\n```".into(),
        });
        let extractor = BRollExtractor::new(provider);
        let points = extractor
            .extract(ExtractionInput::PlainText("t"))
            .await
            .unwrap();
        assert_eq!(points.len(), 1);
    }

    #[tokio::test]
    async fn extract_errors_on_malformed_json() {
        let provider = Arc::new(MockProvider {
            response: "not json".into(),
        });
        let extractor = BRollExtractor::new(provider);
        let err = extractor
            .extract(ExtractionInput::PlainText("t"))
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::AiResponseInvalid(_)));
    }

    #[tokio::test]
    async fn extract_parses_themes_keywords_and_timestamps() {
        let provider = Arc::new(MockProvider {
            response: r#"{"points":[
                {"theme":"trail running","phrase":"corro in montagna","keywords":["mountain trail running","alpine scenery","runner sunrise"],"t_start":4.2,"t_end":12.5},
                {"theme":"gear","phrase":"le scarpe migliori","keywords":["running shoes closeup","trail shoe display"],"t_start":12.5,"t_end":22.0}
            ]}"#.into(),
        });
        let extractor = BRollExtractor::new(provider);
        let points = extractor
            .extract(ExtractionInput::PlainText("dummy"))
            .await
            .unwrap();
        assert_eq!(points.len(), 2);
        assert_eq!(points[0].theme, "trail running");
        assert_eq!(points[0].t_start, Some(4.2));
        assert_eq!(points[0].t_end, Some(12.5));
        assert_eq!(points[0].keywords.len(), 3);
        assert_eq!(points[1].theme, "gear");
        assert_eq!(points[1].t_start, Some(12.5));
    }

    #[tokio::test]
    async fn extract_with_timestamped_input_formats_user_prompt() {
        let captured = Arc::new(tokio::sync::Mutex::new(String::new()));
        let captured_c = captured.clone();
        struct Capture(Arc<tokio::sync::Mutex<String>>);
        #[async_trait]
        impl AIProvider for Capture {
            fn name(&self) -> &'static str {
                "cap"
            }
            async fn complete(&self, _s: &str, u: &str) -> AppResult<String> {
                *self.0.lock().await = u.to_string();
                Ok(r#"{"points":[]}"#.into())
            }
        }
        let extractor = BRollExtractor::new(Arc::new(Capture(captured_c)));
        let segs = vec![
            TranscriptSegment {
                start: 0.0,
                end: 4.2,
                text: "Oggi parliamo".into(),
            },
            TranscriptSegment {
                start: 4.2,
                end: 9.8,
                text: "di trail running".into(),
            },
        ];
        extractor
            .extract(ExtractionInput::Timestamped(&segs))
            .await
            .unwrap();
        let prompt = captured.lock().await.clone();
        assert!(prompt.contains("[0.0s-4.2s] Oggi parliamo"));
        assert!(prompt.contains("[4.2s-9.8s] di trail running"));
        assert!(prompt.contains("with timestamps"));
    }
}
```

- [ ] **Step 2: Esegui i test**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test extractor 2>&1 | tail -15
```

Expected: 5 PASS.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/extractor.rs
git commit -m "feat: theme-based extraction prompt + ExtractionInput enum + tests"
```

---

## Task 3: Aggiorna `extraction_run` per usare `ExtractionInput`

**Files:**
- Modify: `src-tauri/src/commands.rs`

- [ ] **Step 1: Trova la funzione `extraction_run`**

Apri `src-tauri/src/commands.rs` e cerca `pub async fn extraction_run`. La funzione attualmente legge il transcript come stringa concatenata indipendentemente dal tipo di voiceover.

- [ ] **Step 2: Sostituisci il body di `extraction_run`**

Sostituisci il contenuto della funzione (dalla firma `pub async fn extraction_run...` fino alla `}` di chiusura) con questa versione. Nota che `BRollExtractor::extract` ora richiede `ExtractionInput`.

```rust
#[tauri::command]
pub async fn extraction_run(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<BRollPoint>> {
    let store = {
        let cur = state.current_project.read().await;
        cur.clone()
            .ok_or_else(|| AppError::InvalidInput("no project loaded".into()))?
    };
    let project = store.project().await;

    let settings = SettingsStore::load_settings()?;
    let config = build_provider_config(&settings)?;
    let provider = ai::create_provider(&settings.selected_provider, &config)?;
    let extractor = BRollExtractor::new(provider);

    app.emit(
        "extraction.progress",
        serde_json::json!({"step":"calling_ai","message":"Identifying themes…"}),
    )
    .ok();

    // Audio: pass timestamped transcript (cap-30s precision).
    // Text: read voiceover.txt and pass as plain.
    let txt: String;
    let points = match project.voiceover.kind {
        VoiceoverKind::Audio => {
            if project.transcript.is_empty() {
                return Err(AppError::InvalidInput(
                    "transcript missing — run transcription first".into(),
                ));
            }
            extractor
                .extract(crate::extractor::ExtractionInput::Timestamped(
                    &project.transcript,
                ))
                .await?
        }
        VoiceoverKind::Text => {
            let voiceover_path = state
                .projects_root
                .join(&project.slug)
                .join(&project.voiceover.path);
            txt = tokio::fs::read_to_string(&voiceover_path).await?;
            extractor
                .extract(crate::extractor::ExtractionInput::PlainText(&txt))
                .await?
        }
    };

    for p in &points {
        store.add_broll_point(p.clone()).await?;
    }
    let project_after = store.project().await;
    app.emit("project.updated", &project_after).ok();
    Ok(points)
}
```

NOTA: la funzione attuale potrebbe avere logica leggermente diversa (es. provider construction già factored). Conserva eventuali parti specifiche del tuo codice esistente — l'unico cambio obbligatorio è:
1. Discriminare su `project.voiceover.kind`
2. Per `Audio`: passare `ExtractionInput::Timestamped(&project.transcript)` se `transcript` non è vuoto
3. Per `Text`: leggere voiceover.txt e passare `ExtractionInput::PlainText(&txt)`

Se il codice esistente di `extraction_run` legge sempre come testo, devi eliminare quella lettura e introdurre il match. Se costruisce il provider in modo diverso (es. via altra factory), preserva quella parte e cambia solo le chiamate a `extractor.extract(...)`.

- [ ] **Step 3: Verifica build**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo build 2>&1 | tail -10
```

Expected: success.

- [ ] **Step 4: Esegui tutti i test (regression check)**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test 2>&1 | grep "test result" | tail -5
```

Expected: tutti i test PASS, con eventuali ignored.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat: extraction_run uses timestamped input for audio voiceovers"
```

---

## Task 4: Frontend — KeywordHeader mostra `theme`

**Files:**
- Modify: `src/components/KeywordHeader.tsx`

- [ ] **Step 1: Estendi le props**

Apri `src/components/KeywordHeader.tsx`. Trova `interface Props { ... }`. Aggiungi `theme?: string;` (opzionale per backwards compat con call site che non lo passano):

```tsx
interface Props {
  keyword: string;
  theme?: string;
  phrase?: string;
  current: number;
  total: number;
  onPrev: () => void;
  onSkip: () => void;
  onChange: (next: string) => void;
  onHome?: () => void;
  disabled?: boolean;
}
```

E nella destrutturazione del component:
```tsx
export function KeywordHeader({
  keyword,
  theme,
  phrase,
  current,
  total,
  onPrev,
  onSkip,
  onChange,
  onHome,
  disabled,
}: Props) {
```

- [ ] **Step 2: Aggiungi rendering del theme**

Trova dove viene renderizzata la `<h1>` con la keyword highlighted. Subito SOPRA quella `<h1>`, dentro la stessa riga flex (o appena prima del flex container che contiene la H1), aggiungi un piccolo blocco mono che appare solo se `theme` è non-vuoto.

Una posizione naturale è inserirlo come figlio di un wrapper subito sotto il primo flex header (cerca dove sta il counter `{padded(current + 1)}/{padded(total)}` e/o la H1). Adatta la struttura attuale, ma il pattern è:

```tsx
{theme && (
  <div className="flex items-center gap-2 mt-1.5">
    <span className="inline-block w-1 h-3 bg-bee-yellow" />
    <span className="font-mono text-[10px] font-bold tracking-[0.6px] uppercase text-bee-mute">
      {theme}
    </span>
  </div>
)}
```

Mettilo come nuovo blocco dentro il wrapper `<header>` PRIMA del `{phrase && <div className="bee-quote ...">}` esistente, in modo che l'ordine visivo sia: top-row con counter+keyword+buttons, poi theme (se presente), poi phrase (se presente).

Esempio (adattando alla tua struttura attuale):
```tsx
return (
  <header className="flex-shrink-0 border-b-bee border-bee-ink px-[22px] py-[18px] pb-4 flex flex-col gap-2 bg-white">
    <div className="flex items-center gap-3.5 flex-wrap">
      {/* ... ◇ Progetti, ←, counter, H1 keyword, ✎, Skip ... */}
    </div>
    {theme && (
      <div className="flex items-center gap-2">
        <span className="inline-block w-1 h-3 bg-bee-yellow" />
        <span className="font-mono text-[10px] font-bold tracking-[0.6px] uppercase text-bee-mute">
          {theme}
        </span>
      </div>
    )}
    {phrase && <div className="bee-quote line-clamp-2">{phrase}</div>}
  </header>
);
```

- [ ] **Step 3: Verifica TS + build**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/KeywordHeader.tsx
git commit -m "feat: KeywordHeader displays theme label above keyword"
```

---

## Task 5: PickerPage passa `theme` + ReviewPage mostra theme pill

**Files:**
- Modify: `src/pages/PickerPage.tsx`
- Modify: `src/pages/ReviewPage.tsx`

- [ ] **Step 1: Passa `theme` in PickerPage**

Apri `src/pages/PickerPage.tsx`. Trova il rendering di `<KeywordHeader ... />`. Aggiungi `theme={point.theme}` tra le prop:

```tsx
<KeywordHeader
  keyword={activeKeyword}
  theme={point.theme}
  phrase={point.phrase}
  current={currentIndex}
  total={project.broll_points.length}
  onPrev={goPrev}
  onSkip={skipCurrent}
  onChange={onChangeKeyword}
  onHome={() => nav("/projects")}
  disabled={locked}
/>
```

- [ ] **Step 2: Aggiungi pill theme in ReviewPage**

Apri `src/pages/ReviewPage.tsx`. Trova il map dei `project.broll_points` (cerca `.map((p, i) =>` nella sezione `phase === "done"`). Modifica la riga del badge numero in modo da mostrare il theme accanto:

Localizza qualcosa di simile a:
```tsx
<div className="flex justify-between mb-2 gap-3">
  <span className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase bg-bee-ink text-bee-yellow px-1.5 py-0.5 leading-none">
    {padded(i + 1)}
  </span>
  <span className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-bee-mute">
    {p.status}
  </span>
</div>
```

Sostituiscilo con:
```tsx
<div className="flex items-center mb-2 gap-2 flex-wrap">
  <span className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase bg-bee-ink text-bee-yellow px-1.5 py-0.5 leading-none">
    {padded(i + 1)}
  </span>
  {p.theme && (
    <span className="font-mono text-[10px] font-bold tracking-[0.4px] uppercase text-bee-mute">
      ▶ {p.theme}
    </span>
  )}
  <span className="font-mono text-[11px] font-bold tracking-[0.4px] uppercase text-bee-mute ml-auto">
    {p.status}
  </span>
</div>
```

(Adatta i nomi/classi se la struttura attuale del file è leggermente diversa. L'idea: il theme pill sta tra il numero e lo status.)

- [ ] **Step 3: Verifica TS + build + vitest**

```bash
npx tsc --noEmit && npm run build 2>&1 | tail -5 && npx vitest run 2>&1 | tail -10
```

Expected: TS clean, build clean, vitest 5/5 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PickerPage.tsx src/pages/ReviewPage.tsx
git commit -m "feat: show theme in Picker header + Review list"
```

---

## Task 6: Aggiorna mock test (PickerPage.test.tsx + Playwright)

**Files:**
- Modify: `src/pages/PickerPage.test.tsx`
- Modify: `e2e-pw/timeline.spec.ts`

- [ ] **Step 1: Aggiungi `theme` ai mock BRollPoint in PickerPage.test.tsx**

Apri `src/pages/PickerPage.test.tsx`. Cerca le definizioni di `BRollPoint` (es. helper `mockPoint(...)` o object literal con `id: "bp_01"`). Per ogni occorrenza aggiungi `theme: ""` (o un valore demo). Esempio:

```tsx
const mockPoint = (id: string, status: BRollPoint["status"] = "pending"): BRollPoint => ({
  id,
  theme: "",
  phrase: `phrase ${id}`,
  t_start: null,
  t_end: null,
  keywords: [],
  active_keyword: "",
  status,
  selected_video: null,
  output_clip: null,
});
```

Se al posto di un helper ci sono object literal sparsi, aggiungi `theme: ""` a ciascuno.

- [ ] **Step 2: Aggiungi `theme` ai punti nel Playwright store**

Apri `e2e-pw/timeline.spec.ts`. Trova il blocco `broll_points: [...]` dentro `useStore.setState`. A ogni oggetto aggiungi `theme: "<demo string>"`:

```ts
broll_points: [
  { id: "bp_01", theme: "trail running", phrase: "first phrase", t_start: null, t_end: null, keywords: ["k1"], active_keyword: "k1", status: "downloading", selected_video: { source: "youtube", video_id: "abc", title: "Vid A", channel: "Ch", duration_sec: 60, thumb_url: "", url: "https://www.youtube.com/watch?v=abc", stream_url: null }, output_clip: null },
  { id: "bp_02", theme: "gear", phrase: "second", t_start: null, t_end: null, keywords: ["k2"], active_keyword: "k2", status: "pending", selected_video: null, output_clip: null },
  { id: "bp_03", theme: "scenery", phrase: "third", t_start: null, t_end: null, keywords: ["k3"], active_keyword: "k3", status: "done", selected_video: null, output_clip: "clips/0003.mp4" },
],
```

E aggiungi un'asserzione che il theme appare nel header (sotto la H1):
```ts
// Verify the theme label is rendered in the header
await expect(page.getByText("trail running", { exact: false }).first()).toBeVisible();
```

- [ ] **Step 3: Esegui suite completa**

```bash
cd src-tauri && PATH="$HOME/.cargo/bin:$PATH" cargo test 2>&1 | grep "test result"
cd ..
npx tsc --noEmit && echo "TS OK"
npx vitest run 2>&1 | tail -5
```

Expected:
- Cargo: tutti PASS, +2 nuovi (extract_parses_themes_keywords_and_timestamps + extract_with_timestamped_input_formats_user_prompt)
- TS clean
- Vitest 5/5 PASS

Per Playwright lancia il vite dev server in background prima:

```bash
npm run dev > /tmp/vite-bg.log 2>&1 &
sleep 4
npm run test:pw 2>&1 | tail -5
pkill -f "node.*vite" 2>/dev/null
```

Expected: 1/1 PASS (timeline + theme assertion).

- [ ] **Step 4: Commit**

```bash
git add src/pages/PickerPage.test.tsx e2e-pw/timeline.spec.ts
git commit -m "test: include theme in BRollPoint mocks (vitest + Playwright)"
```

---

## Conclusione

A fine plan:
- B-Roll extraction segmenta per **cambio tema** invece di "ogni frase", con cap 30s
- Voiceover audio sfrutta i timestamp Whisper passandoli al modello come `[Xs-Ys] text`
- Keyword sono **larghe e visuali** (ottimizzate per stock footage)
- Frontend mostra il `theme` nell'header del Picker e nella lista Review
- Backwards compatible: progetti esistenti hanno `theme = ""` via `#[serde(default)]`

Test totali nuovi: 2 unit Rust (`extract_parses_themes_keywords_and_timestamps` + `extract_with_timestamped_input_formats_user_prompt`). Tutti i test esistenti continuano a passare.
