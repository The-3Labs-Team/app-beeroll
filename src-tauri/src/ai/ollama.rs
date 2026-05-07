use crate::ai::AIProvider;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

const DEFAULT_BASE_URL: &str = "http://localhost:11434";
const DEFAULT_MODEL: &str = "llama3.1";

pub struct OllamaProvider {
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            model: DEFAULT_MODEL.to_string(),
            client: reqwest::Client::new(),
        }
    }

    pub fn with_default_base_url() -> Self {
        Self::new(DEFAULT_BASE_URL.to_string())
    }

    #[allow(dead_code)]
    pub fn with_model(mut self, model: String) -> Self {
        self.model = model;
        self
    }
}

#[derive(Serialize)]
struct ReqBody<'a> {
    model: &'a str,
    system: &'a str,
    prompt: &'a str,
    stream: bool,
}

#[derive(Deserialize)]
struct RespBody {
    response: String,
}

#[async_trait]
impl AIProvider for OllamaProvider {
    fn name(&self) -> &'static str {
        "ollama"
    }

    async fn complete(&self, system: &str, user: &str) -> AppResult<String> {
        let url = format!("{}/api/generate", self.base_url);
        let body = ReqBody {
            model: &self.model,
            system,
            prompt: user,
            stream: false,
        };
        let resp = self.client.post(&url).json(&body).send().await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::AiProvider(format!("status {status}: {body}")));
        }

        let parsed: RespBody = resp.json().await?;
        Ok(parsed.response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn complete_returns_response_field() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("POST", "/api/generate")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"model":"llama3.1","response":"hello from ollama","done":true}"#)
            .create_async()
            .await;

        let provider = OllamaProvider::new(server.url());
        let out = provider.complete("system prompt", "user prompt").await.unwrap();
        assert_eq!(out, "hello from ollama");
    }

    #[tokio::test]
    async fn complete_propagates_connection_error() {
        // Use an unreachable address to simulate a connection failure.
        let provider = OllamaProvider::new("http://127.0.0.1:1".into());
        let err = provider.complete("s", "u").await.unwrap_err();
        // Either Http (transport error) or AiProvider depending on what the server returns.
        assert!(matches!(err, AppError::Http(_) | AppError::AiProvider(_)));
    }
}
