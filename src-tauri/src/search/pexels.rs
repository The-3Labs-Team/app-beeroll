use super::VideoSource;
use crate::domain::VideoSourceId;
use crate::error::AppResult;
use async_trait::async_trait;

pub struct PexelsSource {
    #[allow(dead_code)]
    api_key: String,
    #[allow(dead_code)]
    base_url: String,
    #[allow(dead_code)]
    client: reqwest::Client,
}

impl PexelsSource {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://api.pexels.com".into(),
            client: reqwest::Client::new(),
        }
    }

    #[allow(dead_code)]
    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
}

#[async_trait]
impl VideoSource for PexelsSource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Pexels
    }
    async fn search(&self, _kw: &str, _l: u8) -> AppResult<Vec<crate::domain::VideoCandidate>> {
        Ok(Vec::new())
    }
}
