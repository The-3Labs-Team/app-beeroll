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
                cached_results: Vec::new(),
                cached_keyword: None,
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
