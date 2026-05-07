use crate::ai::AIProvider;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

const DEFAULT_BASE_URL: &str = "https://api.openai.com";
const DEFAULT_MODEL: &str = "gpt-4o";

pub struct OpenAIProvider {
    api_key: String,
    base_url: String,
    model: String,
    client: reqwest::Client,
}

impl OpenAIProvider {
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

#[derive(Serialize)]
struct ReqMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct ReqBody<'a> {
    model: &'a str,
    max_tokens: u32,
    messages: Vec<ReqMessage<'a>>,
}

#[derive(Deserialize)]
struct RespMessage {
    content: String,
}

#[derive(Deserialize)]
struct RespChoice {
    message: RespMessage,
}

#[derive(Deserialize)]
struct RespBody {
    choices: Vec<RespChoice>,
}

#[async_trait]
impl AIProvider for OpenAIProvider {
    fn name(&self) -> &'static str {
        "openai_api"
    }

    async fn complete(&self, system: &str, user: &str) -> AppResult<String> {
        let url = format!("{}/v1/chat/completions", self.base_url);
        let body = ReqBody {
            model: &self.model,
            max_tokens: 4096,
            messages: vec![
                ReqMessage { role: "system", content: system },
                ReqMessage { role: "user", content: user },
            ],
        };
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
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
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .ok_or_else(|| AppError::AiResponseInvalid("empty choices array".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn complete_returns_first_choice_message_content() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("POST", "/v1/chat/completions")
            .match_header("authorization", "Bearer test-key")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{"choices":[{"message":{"role":"assistant","content":"hello world"}}]}"#,
            )
            .create_async()
            .await;

        let provider = OpenAIProvider::new("test-key".into()).with_base_url(server.url());
        let out = provider.complete("system prompt", "user prompt").await.unwrap();
        assert_eq!(out, "hello world");
    }

    #[tokio::test]
    async fn complete_propagates_4xx_as_error() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("POST", "/v1/chat/completions")
            .with_status(401)
            .with_body(r#"{"error":{"message":"invalid api key"}}"#)
            .create_async()
            .await;

        let provider = OpenAIProvider::new("bad".into()).with_base_url(server.url());
        let err = provider.complete("s", "u").await.unwrap_err();
        assert!(matches!(err, AppError::AiProvider(_)));
    }
}
