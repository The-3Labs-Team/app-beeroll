use crate::domain::TranscriptSegment;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;

pub mod groq;
pub mod openai;

#[async_trait]
pub trait TranscriptionProvider: Send + Sync {
    async fn transcribe(&self, audio_path: &Path) -> AppResult<TranscriptionResult>;
    fn name(&self) -> &'static str;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub segments: Vec<TranscriptSegment>,
    pub full_text: String,
    pub duration_sec: f64,
}

/// Runtime configuration for [`create_transcription_provider`]. Each field is
/// optional; missing values cause an `InvalidInput` error only when the
/// selected provider needs them.
#[derive(Debug, Default, Clone)]
pub struct TranscriptionConfig {
    pub groq_key: Option<String>,
    pub openai_key: Option<String>,
}

/// Shared verbose-JSON response shape exposed by both Groq and OpenAI's
/// Whisper-compatible endpoints.
#[derive(Debug, Deserialize)]
pub(crate) struct WhisperResponse {
    pub text: String,
    pub duration: Option<f64>,
    #[serde(default)]
    pub segments: Vec<WhisperSegment>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct WhisperSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

impl WhisperResponse {
    pub(crate) fn into_result(self) -> TranscriptionResult {
        let segments = self
            .segments
            .into_iter()
            .map(|s| TranscriptSegment {
                start: s.start,
                end: s.end,
                text: s.text.trim().to_string(),
            })
            .collect();
        let duration_sec = self.duration.unwrap_or(0.0);
        TranscriptionResult {
            segments,
            full_text: self.text.trim().to_string(),
            duration_sec,
        }
    }
}

fn missing(field: &str, provider: &str) -> AppError {
    AppError::InvalidInput(format!(
        "transcription provider '{provider}' requires '{field}' to be configured"
    ))
}

/// Build a transcription provider implementation for the given identifier.
///
/// Supported ids: `groq_api`, `openai_api`.
pub fn create_transcription_provider(
    provider_id: &str,
    config: &TranscriptionConfig,
) -> AppResult<Arc<dyn TranscriptionProvider>> {
    match provider_id {
        "groq_api" => {
            let key = config
                .groq_key
                .clone()
                .ok_or_else(|| missing("groq_key", provider_id))?;
            Ok(Arc::new(groq::GroqTranscriptionProvider::new(key)))
        }
        "openai_api" => {
            let key = config
                .openai_key
                .clone()
                .ok_or_else(|| missing("openai_key", provider_id))?;
            Ok(Arc::new(openai::OpenAITranscriptionProvider::new(key)))
        }
        other => Err(AppError::InvalidInput(format!(
            "unknown transcription provider: {other}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_groq_requires_key() {
        let res = create_transcription_provider("groq_api", &TranscriptionConfig::default());
        match res {
            Err(AppError::InvalidInput(_)) => {}
            _ => panic!("expected InvalidInput"),
        }
    }

    #[test]
    fn create_openai_requires_key() {
        let res = create_transcription_provider("openai_api", &TranscriptionConfig::default());
        match res {
            Err(AppError::InvalidInput(_)) => {}
            _ => panic!("expected InvalidInput"),
        }
    }

    #[test]
    fn create_groq_succeeds_with_key() {
        let cfg = TranscriptionConfig {
            groq_key: Some("k".into()),
            ..Default::default()
        };
        let provider = create_transcription_provider("groq_api", &cfg).expect("ok");
        assert_eq!(provider.name(), "groq_api");
    }

    #[test]
    fn create_unknown_provider_errors() {
        let res = create_transcription_provider("does_not_exist", &TranscriptionConfig::default());
        match res {
            Err(AppError::InvalidInput(_)) => {}
            _ => panic!("expected InvalidInput"),
        }
    }
}
