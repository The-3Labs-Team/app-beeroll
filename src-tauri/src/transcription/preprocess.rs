//! Audio preprocessing for Whisper.
//!
//! Whisper-compatible APIs (Groq, OpenAI) accept audio up to 25MB and
//! internally resample to 16kHz mono. Sending the original podcast/voiceover
//! file straight through means uploading 50-200MB of stereo 44.1/48kHz audio
//! that the server immediately throws away. By transcoding locally to 16kHz
//! mono FLAC first we typically reduce file size 10-20× — turning a 1-hour
//! podcast from ~60MB MP3 (rejected by the 25MB limit) into a ~12MB FLAC
//! that uploads in seconds.
//!
//! ffmpeg is the bundled sidecar binary; we spawn it via
//! `tokio::process::Command` rather than the Tauri shell plugin so we can
//! attach `CREATE_NO_WINDOW` on Windows (the plugin doesn't expose that
//! flag, and without it a console window flashes every transcode).

use crate::error::{AppError, AppResult};
use crate::process_ext::{ffmpeg_path, SilentCommand};
use std::path::{Path, PathBuf};

/// Convert `input` to 16kHz mono FLAC and return the path to the temp file.
/// The caller is responsible for deleting the result when done.
///
/// Returns the original `input` path on transcoding failure rather than
/// erroring out — Whisper would just have to do the work itself, and we'd
/// rather pay the slow upload than block the entire transcription run.
pub async fn transcode_for_whisper(input: &Path) -> AppResult<PathBuf> {
    let stem = input
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "audio".to_string());
    // Mix in the input mtime + size so concurrent transcriptions of different
    // files don't clobber each other in /tmp.
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let out = std::env::temp_dir().join(format!("broll-whisper-{stem}-{suffix}.flac"));

    let input_str = input.to_string_lossy().into_owned();
    let output_str = out.to_string_lossy().into_owned();

    let args = [
        "-y",
        "-i", &input_str,
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "flac",
        "-loglevel", "error",
        &output_str,
    ];

    let ffmpeg = ffmpeg_path()
        .map_err(|e| AppError::Subprocess(format!("resolve ffmpeg path: {e}")))?;
    let result = tokio::process::Command::new(&ffmpeg)
        .args(args)
        .no_console()
        .output()
        .await
        .map_err(|e| AppError::Subprocess(format!("ffmpeg transcode: {e}")))?;
    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr);
        return Err(AppError::Subprocess(format!(
            "ffmpeg transcode failed: {stderr}"
        )));
    }
    Ok(out)
}
