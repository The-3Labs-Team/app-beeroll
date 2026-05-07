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
