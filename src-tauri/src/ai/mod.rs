use crate::error::AppResult;
use async_trait::async_trait;

pub mod anthropic;

#[async_trait]
pub trait AIProvider: Send + Sync {
    async fn complete(&self, system: &str, user: &str) -> AppResult<String>;
    fn name(&self) -> &'static str;
}
