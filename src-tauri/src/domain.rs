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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoCandidate {
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub duration_sec: u32,
    pub thumb_url: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BRollPoint {
    pub id: String,
    pub phrase: String,
    pub t_start: Option<f64>,
    pub t_end: Option<f64>,
    pub keywords: Vec<String>,
    pub active_keyword: String,
    pub status: BRollStatus,
    pub selected_video: Option<VideoCandidate>,
    pub output_clip: Option<String>,
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
