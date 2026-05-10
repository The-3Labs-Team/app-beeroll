//! YouTube Data API v3 search source.
//!
//! Used as the *fast* path for YouTube search when the user has provided an
//! API key in settings. Compared to `yt-dlp` scraping (1.5–15s depending on
//! the binary), the API responds in 150–300ms and returns metadata in a
//! single round-trip.
//!
//! The free tier allows 10k units/day. A `search.list` call costs 100 units,
//! so this gracefully covers ~100 distinct keyword searches per day. When
//! quota is exhausted the picker silently falls back to yt-dlp.

use super::VideoSource;
use crate::domain::{VideoCandidate, VideoSourceId};
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use serde::Deserialize;

const DEFAULT_BASE_URL: &str = "https://www.googleapis.com/youtube/v3";

pub struct YouTubeApiSource {
    api_key: String,
    base_url: String,
    client: reqwest::Client,
}

impl YouTubeApiSource {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            base_url: DEFAULT_BASE_URL.into(),
            client: reqwest::Client::new(),
        }
    }

    pub fn with_base_url(mut self, url: String) -> Self {
        self.base_url = url;
        self
    }
}

#[derive(Deserialize)]
struct SearchResp {
    items: Vec<SearchItem>,
}

#[derive(Deserialize)]
struct SearchItem {
    id: SearchItemId,
    snippet: SearchSnippet,
}

#[derive(Deserialize)]
struct SearchItemId {
    #[serde(rename = "videoId")]
    video_id: Option<String>,
}

#[derive(Deserialize)]
struct SearchSnippet {
    title: String,
    #[serde(rename = "channelTitle")]
    channel_title: String,
    thumbnails: Thumbnails,
}

#[derive(Deserialize, Default)]
struct Thumbnails {
    #[serde(default)]
    high: Option<Thumb>,
    #[serde(default)]
    medium: Option<Thumb>,
    #[serde(default)]
    default: Option<Thumb>,
}

#[derive(Deserialize)]
struct Thumb {
    url: String,
}

#[derive(Deserialize)]
struct VideosResp {
    items: Vec<VideoItem>,
}

#[derive(Deserialize)]
struct VideoItem {
    id: String,
    #[serde(rename = "contentDetails")]
    content_details: ContentDetails,
}

#[derive(Deserialize)]
struct ContentDetails {
    duration: String,
}

#[async_trait]
impl VideoSource for YouTubeApiSource {
    fn id(&self) -> VideoSourceId {
        VideoSourceId::Youtube
    }

    async fn search(&self, keyword: &str, limit: u8) -> AppResult<Vec<VideoCandidate>> {
        let limit = limit.clamp(1, 50);

        // Step 1: search.list — returns video ids + titles + thumbs.
        let search_url = format!("{}/search", self.base_url);
        let resp = self
            .client
            .get(&search_url)
            .query(&[
                ("part", "snippet"),
                ("type", "video"),
                ("maxResults", &limit.to_string()),
                ("q", keyword),
                ("key", &self.api_key),
            ])
            .send()
            .await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::AiProvider(format!(
                "youtube api status {status}: {body}"
            )));
        }
        let parsed: SearchResp = resp.json().await?;

        // Collect ids in order so we can join the duration map back at the end
        // without losing the API's relevance ranking.
        let mut entries: Vec<(String, String, String, String)> = Vec::new();
        for item in parsed.items {
            let id = match item.id.video_id {
                Some(v) => v,
                None => continue,
            };
            let thumb = item
                .snippet
                .thumbnails
                .high
                .or(item.snippet.thumbnails.medium)
                .or(item.snippet.thumbnails.default)
                .map(|t| t.url)
                .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"));
            entries.push((id, item.snippet.title, item.snippet.channel_title, thumb));
        }
        if entries.is_empty() {
            return Ok(Vec::new());
        }

        // Step 2: videos.list — fetch durations in a single batched call.
        let ids = entries
            .iter()
            .map(|(id, ..)| id.as_str())
            .collect::<Vec<_>>()
            .join(",");
        let videos_url = format!("{}/videos", self.base_url);
        let dur_resp = self
            .client
            .get(&videos_url)
            .query(&[
                ("part", "contentDetails"),
                ("id", &ids),
                ("key", &self.api_key),
            ])
            .send()
            .await?;
        if !dur_resp.status().is_success() {
            // Don't fail the whole search if durations come back empty —
            // just default to 0 and let the picker render anyway.
            tracing::warn!(
                status = %dur_resp.status(),
                "youtube api videos.list failed; durations will be 0"
            );
            return Ok(entries
                .into_iter()
                .map(|(id, title, channel, thumb)| {
                    to_candidate(id, title, channel, thumb, 0)
                })
                .collect());
        }
        let durs: VideosResp = dur_resp.json().await?;
        let durations_by_id: std::collections::HashMap<String, u32> = durs
            .items
            .into_iter()
            .map(|v| (v.id, parse_iso8601_duration(&v.content_details.duration)))
            .collect();

        Ok(entries
            .into_iter()
            .map(|(id, title, channel, thumb)| {
                let dur = durations_by_id.get(&id).copied().unwrap_or(0);
                to_candidate(id, title, channel, thumb, dur)
            })
            .collect())
    }
}

fn to_candidate(
    id: String,
    title: String,
    channel: String,
    thumb_url: String,
    duration_sec: u32,
) -> VideoCandidate {
    let url = format!("https://www.youtube.com/watch?v={id}");
    VideoCandidate {
        source: VideoSourceId::Youtube,
        url,
        video_id: id,
        title,
        channel,
        duration_sec,
        thumb_url,
        stream_url: None,
    }
}

/// Parse an ISO 8601 duration like `PT5M30S` / `PT1H2M3S` / `PT45S` into total
/// seconds. Returns 0 for malformed input — durations are display-only here.
fn parse_iso8601_duration(s: &str) -> u32 {
    if !s.starts_with("PT") {
        return 0;
    }
    let body = &s[2..];
    let mut total: u32 = 0;
    let mut buf = String::new();
    for ch in body.chars() {
        match ch {
            '0'..='9' => buf.push(ch),
            'H' => {
                if let Ok(h) = buf.parse::<u32>() {
                    total = total.saturating_add(h.saturating_mul(3600));
                }
                buf.clear();
            }
            'M' => {
                if let Ok(m) = buf.parse::<u32>() {
                    total = total.saturating_add(m.saturating_mul(60));
                }
                buf.clear();
            }
            'S' => {
                if let Ok(sec) = buf.parse::<u32>() {
                    total = total.saturating_add(sec);
                }
                buf.clear();
            }
            _ => buf.clear(),
        }
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_duration_parses_typical_shapes() {
        assert_eq!(parse_iso8601_duration("PT45S"), 45);
        assert_eq!(parse_iso8601_duration("PT5M"), 300);
        assert_eq!(parse_iso8601_duration("PT5M30S"), 330);
        assert_eq!(parse_iso8601_duration("PT1H2M3S"), 3723);
        assert_eq!(parse_iso8601_duration("PT1H"), 3600);
        assert_eq!(parse_iso8601_duration(""), 0);
        assert_eq!(parse_iso8601_duration("garbage"), 0);
    }
}
