use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum BRollStatus {
    Pending,
    Searching,
    Picking,
    Downloading,
    /// User asked to pause an in-flight yt-dlp run. The subprocess is killed
    /// but the partial `.part` file is left in `cache/downloads/` so a Resume
    /// (pickVideo with the same candidate) can let yt-dlp pick up where it
    /// left off.
    Paused,
    /// yt-dlp finished writing the raw file and we're now running ffmpeg
    /// to apply the copyright overlay. No bandwidth happening, but the
    /// pipeline isn't done — keep the UI showing in-flight work.
    Processing,
    Done,
    Skipped,
    Error,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VoiceoverInput {
    pub kind: VoiceoverKind,
    pub path: String,
    pub duration_sec: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum VoiceoverKind {
    Audio,
    Text,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TranscriptSegment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum VideoSourceId {
    Youtube,
    Pixabay,
    Pexels,
}

impl Default for VideoSourceId {
    fn default() -> Self {
        Self::Youtube
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoCandidate {
    #[serde(default)]
    pub source: VideoSourceId,
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub duration_sec: u32,
    pub thumb_url: String,
    pub url: String,
    #[serde(default)]
    pub stream_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BRollPoint {
    pub id: String,
    #[serde(default)]
    pub theme: String,
    pub phrase: String,
    pub t_start: Option<f64>,
    pub t_end: Option<f64>,
    pub keywords: Vec<String>,
    pub active_keyword: String,
    pub status: BRollStatus,
    pub selected_video: Option<VideoCandidate>,
    pub output_clip: Option<String>,
    /// Cached search results for this point, persisted so reopening a project
    /// doesn't trigger a fresh YouTube/yt-dlp round-trip. Valid only when
    /// `cached_keyword` matches the keyword currently displayed in the picker.
    #[serde(default)]
    pub cached_results: Vec<VideoCandidate>,
    /// The keyword that produced `cached_results`. Used to invalidate the cache
    /// when the user edits the keyword in the picker.
    #[serde(default)]
    pub cached_keyword: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub version: u32,
    pub slug: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub voiceover: VoiceoverInput,
    pub transcript: Vec<TranscriptSegment>,
    pub broll_points: Vec<BRollPoint>,
}

impl Project {
    pub const CURRENT_VERSION: u32 = 1;
}
