use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use tokio::process::Command;

pub struct VideoProcessor {
    ffmpeg_path: String,
    font_path: PathBuf,
}

impl VideoProcessor {
    pub fn new(ffmpeg_path: impl Into<String>, font_path: PathBuf) -> Self {
        Self { ffmpeg_path: ffmpeg_path.into(), font_path }
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

        let output_status = Command::new(&self.ffmpeg_path)
            .args([
                "-y",
                "-i", input.to_string_lossy().as_ref(),
                "-vf", &filter,
                "-codec:a", "copy",
                "-loglevel", "error",
                output.to_string_lossy().as_ref(),
            ])
            .output()
            .await
            .map_err(|e| AppError::Subprocess(format!("ffmpeg spawn: {e}")))?;

        if !output_status.status.success() {
            let stderr = String::from_utf8_lossy(&output_status.stderr);
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
