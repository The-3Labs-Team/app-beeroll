//! Apply the copyright overlay onto a downloaded clip via the bundled
//! ffmpeg.
//!
//! ffmpeg is spawned directly with `tokio::process::Command` (not via
//! `tauri-plugin-shell`'s sidecar API) so we can attach `CREATE_NO_WINDOW`
//! on Windows. The plugin doesn't expose that flag, and without it a
//! console window flashes on the user every time an overlay runs.
use crate::error::{AppError, AppResult};
use crate::process_ext::SilentCommand;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Notify;

/// Hard cap for the overlay ffmpeg pass. Clips are capped at ~30s, so a
/// drawtext re-encode finishes in seconds; anything past this is a hang (e.g.
/// a corrupt download) and is turned into an error so the point doesn't sit in
/// "Elaborazione" forever.
const OVERLAY_TIMEOUT: Duration = Duration::from_secs(120);

pub struct VideoProcessor {
    ffmpeg_path: PathBuf,
    font_path: PathBuf,
}

impl VideoProcessor {
    pub fn new(ffmpeg_path: impl Into<PathBuf>, font_path: PathBuf) -> Self {
        Self {
            ffmpeg_path: ffmpeg_path.into(),
            font_path,
        }
    }

    /// Backwards-compatible alias for callers / tests still using the old
    /// `with_path` name.
    pub fn with_path(ffmpeg_path: impl Into<PathBuf>, font_path: PathBuf) -> Self {
        Self::new(ffmpeg_path, font_path)
    }

    pub async fn apply_copyright_overlay(
        &self,
        input: &Path,
        output: &Path,
        channel_name: &str,
        cancel: Arc<Notify>,
    ) -> AppResult<()> {
        let escaped_channel = escape_drawtext(channel_name);
        let escaped_font = self.font_path.to_string_lossy().replace('\\', "/").replace(':', "\\:");
        let filter = format!(
            "drawtext=text='\u{00A9} {escaped_channel}':x=24:y=h-th-24:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=8:fontfile={escaped_font}"
        );

        let input_str = input.to_string_lossy().into_owned();
        let output_str = output.to_string_lossy().into_owned();
        let args: [&str; 9] = [
            "-y",
            "-i", &input_str,
            "-vf", &filter,
            "-codec:a", "copy",
            "-loglevel", "error",
        ];

        let child = tokio::process::Command::new(&self.ffmpeg_path)
            .args(args)
            .arg(&output_str)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .no_console()
            // Ensure ffmpeg is reaped when its future is dropped (on timeout or
            // cancellation, the `wait_with_output` future below is dropped).
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| AppError::Subprocess(format!("ffmpeg spawn: {e}")))?;

        // Race ffmpeg against the cancel signal and the hard timeout. `biased`
        // polls the cancel branch first so a cancellation queued while ffmpeg
        // is running is honored promptly.
        let result = tokio::select! {
            biased;
            _ = cancel.notified() => {
                return Err(AppError::Cancelled);
            }
            res = tokio::time::timeout(OVERLAY_TIMEOUT, child.wait_with_output()) => {
                match res {
                    Ok(r) => r.map_err(|e| AppError::Subprocess(format!("ffmpeg wait: {e}")))?,
                    Err(_) => {
                        return Err(AppError::Subprocess(format!(
                            "ffmpeg overlay timed out after {}s — the clip may be corrupt; try another video",
                            OVERLAY_TIMEOUT.as_secs()
                        )));
                    }
                }
            }
        };
        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            return Err(AppError::Subprocess(format!("ffmpeg failed: {stderr}")));
        }
        Ok(())
    }
}

fn escape_drawtext(s: &str) -> String {
    s.replace('\\', r"\\")
        .replace(':', r"\:")
        .replace('\'', r"\'")
        .replace('%', r"\%")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_drawtext_handles_special_chars() {
        assert_eq!(escape_drawtext("foo:bar"), r"foo\:bar");
        assert_eq!(escape_drawtext("it's"), r"it\'s");
    }
}
