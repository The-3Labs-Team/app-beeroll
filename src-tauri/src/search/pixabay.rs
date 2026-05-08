use super::VideoSource;
use crate::domain::VideoSourceId;
use crate::error::AppResult;
use async_trait::async_trait;

pub struct PixabaySource {
    #[allow(dead_code)]
    api_key: String,
    #[allow(dead_code)]
    base_url: String,
    #[allow(dead_code)]
    client: reqwest::Client,
}

impl PixabaySource {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: "https://pixabay.com/api/videos/".into(),
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
impl VideoSource for PixabaySource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Pixabay
    }
    async fn search(&self, _kw: &str, _l: u8) -> AppResult<Vec<crate::domain::VideoCandidate>> {
        Ok(Vec::new())
    }
}
