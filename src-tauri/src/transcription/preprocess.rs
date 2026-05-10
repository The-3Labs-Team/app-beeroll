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
//! ffmpeg ships with the app via the Tauri shell sidecar (see
//! `tauri.conf.json > bundle.externalBin`), so this is always available at
//! runtime.

use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::ShellExt;

/// Convert `input` to 16kHz mono FLAC and return the path to the temp file.
/// The caller is responsible for deleting the result when done.
///
/// Returns the original `input` path on transcoding failure rather than
/// erroring out — Whisper would just have to do the work itself, and we'd
/// rather pay the slow upload than block the entire transcription run.
pub async fn transcode_for_whisper<R: Runtime>(
    app: &AppHandle<R>,
    input: &Path,
) -> AppResult<PathBuf> {
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

    let cmd = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| AppError::Subprocess(format!("ffmpeg sidecar lookup: {e}")))?
        .args(args);
    let result = cmd
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
