use crate::ai::AIProvider;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
const DEFAULT_MODEL: &str = "claude-sonnet-4-6";

pub struct AnthropicProvider {
    api_key: String,
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl AnthropicProvider {
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

    pub fn with_model(mut self, model: String) -> Self {
        self.model = model;
        self
    }
}

#[derive(Serialize)]
struct ReqMessage {
    role: &'static str,
    content: String,
}

#[derive(Serialize)]
struct ReqBody<'a> {
    model: &'a str,
    max_tokens: u32,
    system: &'a str,
    messages: Vec<ReqMessage>,
}

#[derive(Deserialize)]
struct RespContent {
    text: String,
}

#[derive(Deserialize)]
struct RespBody {
    content: Vec<RespContent>,
}

#[async_trait]
impl AIProvider for AnthropicProvider {
    fn name(&self) -> &'static str {
        "anthropic_api"
    }

    async fn complete(&self, system: &str, user: &str) -> AppResult<String> {
        let url = format!("{}/v1/messages", self.base_url);
        let body = ReqBody {
            model: &self.model,
            max_tokens: 4096,
            system,
            messages: vec![ReqMessage {
                role: "user",
                content: user.to_string(),
            }],
        };
        let resp = self
            .client
            .post(&url)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::AiProvider(format!("status {status}: {body}")));
        }

        let parsed: RespBody = resp.json().await?;
        parsed
            .content
            .into_iter()
            .next()
            .map(|c| c.text)
            .ok_or_else(|| AppError::AiResponseInvalid("empty content array".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn complete_returns_first_content_text() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("POST", "/v1/messages")
            .match_header("x-api-key", "test-key")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"content":[{"type":"text","text":"hello world"}]}"#)
            .create_async()
            .await;

        let provider = AnthropicProvider::new("test-key".into()).with_base_url(server.url());
        let out = provider.complete("system prompt", "user prompt").await.unwrap();
        assert_eq!(out, "hello world");
    }

    #[tokio::test]
    async fn complete_propagates_4xx_as_error() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("POST", "/v1/messages")
            .with_status(401)
            .with_body(r#"{"error":"invalid api key"}"#)
            .create_async()
            .await;

        let provider = AnthropicProvider::new("bad".into()).with_base_url(server.url());
        let err = provider.complete("s", "u").await.unwrap_err();
        assert!(matches!(err, AppError::AiProvider(_)));
    }
}
