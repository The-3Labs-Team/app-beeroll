use super::VideoSource;
use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;

pub struct PexelsSource {
    api_key: String,
    base_url: String,
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

    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
}

#[derive(Deserialize)]
struct RespBody {
    videos: Vec<Video>,
}

#[derive(Deserialize)]
struct Video {
    id: u64,
    #[serde(default)]
    duration: u32,
    image: String,
    user: User,
    video_files: Vec<VideoFile>,
    url: String,
}

#[derive(Deserialize)]
struct User {
    name: String,
}

#[derive(Deserialize)]
struct VideoFile {
    link: String,
    #[serde(default)]
    quality: String,
    #[serde(default)]
    height: Option<u32>,
}

#[async_trait]
impl VideoSource for PexelsSource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Pexels
    }

    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>> {
        let limit = limit.clamp(1, 80);
        let url = format!("{}/videos/search", self.base_url);
        let resp = self
            .client
            .get(&url)
            .header("Authorization", &self.api_key)
            .query(&[("query", keyword), ("per_page", &limit.to_string())])
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::AiProvider(format!("pexels status {status}: {body}")));
        }

        let parsed: RespBody = resp.json().await?;
        Ok(parsed.videos.into_iter().map(to_candidate).collect())
    }
}

fn to_candidate(v: Video) -> VideoCandidate {
    let stream_url = v
        .video_files
        .iter()
        .find(|f| f.quality == "hd" && f.height.unwrap_or(2000) <= 720)
        .or_else(|| v.video_files.first())
        .map(|f| f.link.clone());
    let title = v
        .url
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .unwrap_or(&v.url)
        .replace('-', " ");
    let title = if title.is_empty() {
        format!("Pexels #{}", v.id)
    } else {
        title
    };
    VideoCandidate {
        source: VideoSourceId::Pexels,
        video_id: v.id.to_string(),
        title,
        channel: v.user.name,
        duration_sec: v.duration,
        thumb_url: v.image,
        url: v.url,
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
            "videos": [{
                "id": 9999,
                "duration": 17,
                "image": "https://images.pexels.com/videos/9999/thumb.jpg",
                "user": { "name": "Jane Photo" },
                "url": "https://www.pexels.com/video/sunset-over-the-sea-9999/",
                "video_files": [
                    { "link": "https://videos.pexels.com/9999_hd.mp4", "quality": "hd", "height": 720 },
                    { "link": "https://videos.pexels.com/9999_sd.mp4", "quality": "sd", "height": 360 }
                ]
            }]
        }"#;
        let _m = server
            .mock("GET", mockito::Matcher::Any)
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(body)
            .create_async()
            .await;

        let s = PexelsSource::new("test-key".into()).with_base_url(server.url());
        let result = s.search("sunset", 9).await.unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].source, VideoSourceId::Pexels);
        assert_eq!(result[0].video_id, "9999");
        assert_eq!(result[0].channel, "Jane Photo");
        assert_eq!(result[0].duration_sec, 17);
        assert_eq!(
            result[0].stream_url.as_deref(),
            Some("https://videos.pexels.com/9999_hd.mp4")
        );
        assert!(result[0].title.contains("sunset"));
    }

    #[tokio::test]
    async fn search_propagates_401_as_error() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", mockito::Matcher::Any)
            .with_status(401)
            .with_body("{\"error\":\"unauthorized\"}")
            .create_async()
            .await;

        let s = PexelsSource::new("bad".into()).with_base_url(server.url());
        let err = s.search("k", 9).await.unwrap_err();
        assert!(matches!(err, AppError::AiProvider(_)));
    }
}
