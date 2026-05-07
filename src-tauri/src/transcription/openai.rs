use crate::error::{AppError, AppResult};
use crate::transcription::{TranscriptionProvider, TranscriptionResult, WhisperResponse};
use async_trait::async_trait;
use reqwest::multipart;
use std::path::Path;

const DEFAULT_BASE_URL: &str = "https://api.openai.com";
const DEFAULT_MODEL: &str = "whisper-1";

pub struct OpenAITranscriptionProvider {
    api_key: String,
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl OpenAITranscriptionProvider {
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

    #[allow(dead_code)]
    pub fn with_model(mut self, model: String) -> Self {
        self.model = model;
        self
    }
}

#[async_trait]
impl TranscriptionProvider for OpenAITranscriptionProvider {
    fn name(&self) -> &'static str {
        "openai_api"
    }

    async fn transcribe(&self, audio_path: &Path) -> AppResult<TranscriptionResult> {
        let url = format!("{}/v1/audio/transcriptions", self.base_url);

        let bytes = tokio::fs::read(audio_path).await?;
        let filename = audio_path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "audio".into());

        let file_part = multipart::Part::bytes(bytes)
            .file_name(filename)
            .mime_str("application/octet-stream")
            .map_err(|e| AppError::AiProvider(format!("multipart error: {e}")))?;

        let form = multipart::Form::new()
            .part("file", file_part)
            .text("model", self.model.clone())
            .text("response_format", "verbose_json")
            .text("timestamp_granularities[]", "segment");

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .multipart(form)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::AiProvider(format!("status {status}: {body}")));
        }

        let parsed: WhisperResponse = resp.json().await?;
        Ok(parsed.into_result())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_dummy_audio() -> tempfile::NamedTempFile {
        let mut tmp = tempfile::Builder::new()
            .suffix(".mp3")
            .tempfile()
            .unwrap();
        std::io::Write::write_all(&mut tmp, b"fake audio bytes").unwrap();
        tmp
    }

    #[tokio::test]
    async fn transcribe_returns_segments_and_text() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("POST", "/v1/audio/transcriptions")
            .match_header("authorization", "Bearer test-key")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                    "text": "ciao mondo",
                    "duration": 4.2,
                    "segments": [
                        {"start": 0.0, "end": 2.0, "text": " ciao"},
                        {"start": 2.0, "end": 4.2, "text": " mondo"}
                    ]
                }"#,
            )
            .create_async()
            .await;

        let tmp = write_dummy_audio();
        let provider = OpenAITranscriptionProvider::new("test-key".into())
            .with_base_url(server.url());
        let result = provider.transcribe(tmp.path()).await.unwrap();
        assert_eq!(result.full_text, "ciao mondo");
        assert_eq!(result.duration_sec, 4.2);
        assert_eq!(result.segments.len(), 2);
        assert_eq!(result.segments[0].text, "ciao");
    }

    #[tokio::test]
    async fn transcribe_propagates_4xx_as_error() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("POST", "/v1/audio/transcriptions")
            .with_status(401)
            .with_body(r#"{"error":{"message":"invalid api key"}}"#)
            .create_async()
            .await;

        let tmp = write_dummy_audio();
        let provider = OpenAITranscriptionProvider::new("bad".into())
            .with_base_url(server.url());
        let err = provider.transcribe(tmp.path()).await.unwrap_err();
        assert!(matches!(err, AppError::AiProvider(_)));
    }
}
