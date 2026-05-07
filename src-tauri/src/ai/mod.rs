use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use std::sync::Arc;

pub mod anthropic;
pub mod claude_cli;
pub mod codex_cli;
pub mod ollama;
pub mod openai;

#[async_trait]
pub trait AIProvider: Send + Sync {
    async fn complete(&self, system: &str, user: &str) -> AppResult<String>;
    fn name(&self) -> &'static str;
}

/// Runtime configuration consumed by [`create_provider`]. Each field is
/// optional; missing fields cause an `InvalidInput` error only if the
/// selected provider needs them.
#[derive(Debug, Default, Clone)]
pub struct ProviderConfig {
    pub anthropic_key: Option<String>,
    pub openai_key: Option<String>,
    pub ollama_base_url: Option<String>,
    pub claude_cli_path: Option<String>,
    pub codex_cli_path: Option<String>,
}

const OLLAMA_DEFAULT_BASE_URL: &str = "http://localhost:11434";

fn missing(field: &str, provider: &str) -> AppError {
    AppError::InvalidInput(format!(
        "provider '{provider}' requires '{field}' to be configured"
    ))
}

/// Build a provider implementation for the given identifier.
///
/// Supported ids: `anthropic_api`, `openai_api`, `ollama`, `claude_cli`,
/// `codex_cli`. The CLI providers fall back to `which` lookup when no path is
/// configured.
pub fn create_provider(
    provider_id: &str,
    config: &ProviderConfig,
) -> AppResult<Arc<dyn AIProvider>> {
    match provider_id {
        "anthropic_api" => {
            let key = config
                .anthropic_key
                .clone()
                .ok_or_else(|| missing("anthropic_key", provider_id))?;
            Ok(Arc::new(anthropic::AnthropicProvider::new(key)))
        }
        "openai_api" => {
            let key = config
                .openai_key
                .clone()
                .ok_or_else(|| missing("openai_key", provider_id))?;
            Ok(Arc::new(openai::OpenAIProvider::new(key)))
        }
        "ollama" => {
            let base = config
                .ollama_base_url
                .clone()
                .unwrap_or_else(|| OLLAMA_DEFAULT_BASE_URL.into());
            Ok(Arc::new(ollama::OllamaProvider::new(base)))
        }
        "claude_cli" => {
            let provider = match &config.claude_cli_path {
                Some(p) => claude_cli::ClaudeCliProvider::new(p.clone()),
                None => claude_cli::ClaudeCliProvider::auto_detect()?,
            };
            Ok(Arc::new(provider))
        }
        "codex_cli" => {
            let provider = match &config.codex_cli_path {
                Some(p) => codex_cli::CodexCliProvider::new(p.clone()),
                None => codex_cli::CodexCliProvider::auto_detect()?,
            };
            Ok(Arc::new(provider))
        }
        other => Err(AppError::InvalidInput(format!(
            "unknown provider: {other}"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_anthropic_requires_key() {
        let res = create_provider("anthropic_api", &ProviderConfig::default());
        match res {
            Err(AppError::InvalidInput(_)) => {}
            _ => panic!("expected InvalidInput"),
        }
    }

    #[test]
    fn create_openai_requires_key() {
        let res = create_provider("openai_api", &ProviderConfig::default());
        match res {
            Err(AppError::InvalidInput(_)) => {}
            _ => panic!("expected InvalidInput"),
        }
    }

    #[test]
    fn create_anthropic_succeeds_with_key() {
        let cfg = ProviderConfig {
            anthropic_key: Some("k".into()),
            ..Default::default()
        };
        let provider = create_provider("anthropic_api", &cfg).expect("ok");
        assert_eq!(provider.name(), "anthropic_api");
    }

    #[test]
    fn create_ollama_uses_default_when_no_base_url() {
        let provider = create_provider("ollama", &ProviderConfig::default()).expect("ok");
        assert_eq!(provider.name(), "ollama");
    }

    #[test]
    fn create_unknown_provider_errors() {
        let res = create_provider("does_not_exist", &ProviderConfig::default());
        match res {
            Err(AppError::InvalidInput(_)) => {}
            _ => panic!("expected InvalidInput"),
        }
    }
}
