use super::VideoSource;
use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;

pub struct PixabaySource {
    api_key: String,
    base_url: String,
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

    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
}

#[derive(Deserialize)]
struct RespBody {
    hits: Vec<Hit>,
}

#[derive(Deserialize)]
struct Hit {
    id: u64,
    #[serde(default)]
    duration: u32,
    #[serde(default)]
    picture_id: String,
    #[serde(default)]
    user: String,
    videos: VideoFiles,
    #[serde(rename = "pageURL", default)]
    page_url: String,
    #[serde(default)]
    tags: String,
}

#[derive(Deserialize)]
struct VideoFiles {
    #[serde(default)]
    medium: Option<VideoFile>,
    #[serde(default)]
    small: Option<VideoFile>,
    #[serde(default)]
    tiny: Option<VideoFile>,
}

#[derive(Deserialize)]
struct VideoFile {
    url: String,
}

#[async_trait]
impl VideoSource for PixabaySource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Pixabay
    }

    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>> {
        let limit = limit.clamp(3, 200);
        let resp = self
            .client
            .get(&self.base_url)
            .query(&[
                ("key", self.api_key.as_str()),
                ("q", keyword),
                ("per_page", &limit.to_string()),
                ("video_type", "film"),
                ("safesearch", "true"),
            ])
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::AiProvider(format!("pixabay status {status}: {body}")));
        }

        let parsed: RespBody = resp.json().await?;
        Ok(parsed.hits.into_iter().map(to_candidate).collect())
    }
}

fn to_candidate(h: Hit) -> VideoCandidate {
    let stream_url = h
        .videos
        .medium
        .or(h.videos.small)
        .or(h.videos.tiny)
        .map(|f| f.url);
    let thumb_url = if h.picture_id.is_empty() {
        "https://i.vimeocdn.com/video/default_640x360.jpg".to_string()
    } else {
        format!("https://i.vimeocdn.com/video/{}_640x360.jpg", h.picture_id)
    };
    let title = if h.tags.is_empty() {
        format!("Pixabay #{}", h.id)
    } else {
        h.tags.chars().take(80).collect::<String>()
    };
    VideoCandidate {
        source: VideoSourceId::Pixabay,
        video_id: h.id.to_string(),
        title,
        channel: if h.user.is_empty() { "unknown".into() } else { h.user },
        duration_sec: h.duration,
        thumb_url,
        url: h.page_url,
        stream_url,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn search_returns_first_hit() {
        let mut server = mockito::Server::new_async().await;
        let body = r#"{
            "hits": [{
                "id": 12345,
                "duration": 30,
                "picture_id": "abcd1234",
                "user": "john_doe",
                "tags": "nature, water, ocean",
                "pageURL": "https://pixabay.com/videos/12345/",
                "videos": { "medium": { "url": "https://cdn.pixabay.com/video/12345/medium.mp4" } }
            }]
        }"#;
        let _m = server
            .mock("GET", mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(body)
            .create_async()
            .await;

        let s = PixabaySource::new("test-key".into()).with_base_url(server.url());
        let result = s.search("nature", 9).await.unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].source, VideoSourceId::Pixabay);
        assert_eq!(result[0].video_id, "12345");
        assert_eq!(result[0].channel, "john_doe");
        assert_eq!(result[0].duration_sec, 30);
        assert_eq!(
            result[0].stream_url.as_deref(),
            Some("https://cdn.pixabay.com/video/12345/medium.mp4")
        );
        assert!(result[0].title.starts_with("nature"));
    }

    #[tokio::test]
    async fn search_propagates_4xx_as_error() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", mockito::Matcher::Any)
            .with_status(400)
            .with_body("{\"error\":\"bad key\"}")
            .create_async()
            .await;

        let s = PixabaySource::new("bad".into()).with_base_url(server.url());
        let err = s.search("k", 9).await.unwrap_err();
        assert!(matches!(err, AppError::AiProvider(_)));
    }
}
