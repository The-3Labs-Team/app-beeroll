use super::VideoSource;
use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;
use tokio::process::Command;

pub struct YouTubeSource {
    ytdlp_path: String,
}

#[derive(Deserialize)]
struct YtDlpEntry {
    id: String,
    title: String,
    #[serde(default)]
    channel: Option<String>,
    #[serde(default)]
    uploader: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    thumbnails: Vec<YtDlpThumb>,
    #[serde(default)]
    thumbnail: Option<String>,
}

#[derive(Deserialize)]
struct YtDlpThumb {
    url: String,
    #[serde(default)]
    height: Option<u32>,
}

impl YouTubeSource {
    pub fn new(ytdlp_path: impl Into<String>) -> Self {
        Self { ytdlp_path: ytdlp_path.into() }
    }
}

#[async_trait]
impl VideoSource for YouTubeSource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Youtube
    }

    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>> {
        let query = format!("ytsearch{limit}:{keyword}");
        let output = Command::new(&self.ytdlp_path)
            .args([
                "--dump-json",
                "--flat-playlist",
                "--no-warnings",
                "--no-playlist",
                "--quiet",
                &query,
            ])
            .output()
            .await
            .map_err(|e| AppError::Subprocess(format!("yt-dlp spawn failed: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Subprocess(format!("yt-dlp failed: {stderr}")));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut results = Vec::new();
        for line in stdout.lines().filter(|l| !l.trim().is_empty()) {
            let entry: YtDlpEntry = serde_json::from_str(line)
                .map_err(|e| AppError::AiResponseInvalid(format!("yt-dlp json: {e}")))?;
            results.push(to_candidate(entry));
        }
        Ok(results)
    }
}

fn to_candidate(e: YtDlpEntry) -> VideoCandidate {
    let channel = e.channel.or(e.uploader).unwrap_or_else(|| "Unknown".into());
    let thumb_url = e
        .thumbnail
        .or_else(|| {
            e.thumbnails
                .into_iter()
                .max_by_key(|t| t.height.unwrap_or(0))
                .map(|t| t.url)
        })
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", e.id));
    VideoCandidate {
        source: VideoSourceId::Youtube,
        url: format!("https://www.youtube.com/watch?v={}", e.id),
        video_id: e.id,
        title: e.title,
        channel,
        duration_sec: e.duration.unwrap_or(0.0) as u32,
        thumb_url,
        stream_url: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "requires yt-dlp installed and network access"]
    async fn search_returns_results_for_real_keyword() {
        let ytdlp = which::which("yt-dlp").expect("yt-dlp not found in PATH");
        let s = YouTubeSource::new(ytdlp.to_string_lossy().into_owned());
        let results = s.search("rust programming language", 3).await.unwrap();
        assert!(!results.is_empty());
        assert!(results.len() <= 3);
        assert!(results[0].video_id.len() == 11);
        assert_eq!(results[0].source, VideoSourceId::Youtube);
    }
}
