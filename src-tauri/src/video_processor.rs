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

        let result = tokio::process::Command::new(&self.ffmpeg_path)
            .args(args)
            .arg(&output_str)
            .no_console()
            .output()
            .await
            .map_err(|e| AppError::Subprocess(format!("ffmpeg spawn: {e}")))?;
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
