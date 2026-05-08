//! Wraps the bundled ffmpeg sidecar to apply the copyright overlay onto a
//! downloaded clip.
//!
//! At runtime ffmpeg is launched through `tauri-plugin-shell`'s sidecar
//! resolver so we do not depend on a system install. The integration test
//! cannot construct an `AppHandle`, so the processor also accepts an explicit
//! path for tests / CLI use.
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};
use tauri_plugin_shell::ShellExt;

/// Source of the ffmpeg binary used by [`VideoProcessor`].
///
/// `Sidecar` is the production path – the [`AppHandle`] hands us the bundled
/// ffmpeg via `tauri_plugin_shell`. `Path` is used by the integration test,
/// which has no Tauri runtime: it points at the host-target binary fetched
/// by `scripts/fetch-binaries.sh`.
pub enum FfmpegSource<'a, R: Runtime> {
    Sidecar(&'a AppHandle<R>),
    Path(PathBuf),
}

pub struct VideoProcessor<'a, R: Runtime> {
    source: FfmpegSource<'a, R>,
    font_path: PathBuf,
}

impl<'a, R: Runtime> VideoProcessor<'a, R> {
    /// Production constructor – uses the Tauri shell sidecar.
    pub fn with_app(app: &'a AppHandle<R>, font_path: PathBuf) -> Self {
        Self { source: FfmpegSource::Sidecar(app), font_path }
    }

    /// Test/CLI constructor – invokes the ffmpeg binary at `path` directly.
    pub fn with_path(path: impl Into<PathBuf>, font_path: PathBuf) -> Self {
        Self { source: FfmpegSource::Path(path.into()), font_path }
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

        match &self.source {
            FfmpegSource::Sidecar(app) => {
                let cmd = app
                    .shell()
                    .sidecar("ffmpeg")
                    .map_err(|e| AppError::Subprocess(format!("ffmpeg sidecar lookup: {e}")))?
                    .args(args)
                    .arg(&output_str);
                let result = cmd
                    .output()
                    .await
                    .map_err(|e| AppError::Subprocess(format!("ffmpeg run: {e}")))?;
                if !result.status.success() {
                    let stderr = String::from_utf8_lossy(&result.stderr);
                    return Err(AppError::Subprocess(format!("ffmpeg failed: {stderr}")));
                }
            }
            FfmpegSource::Path(path) => {
                let result = tokio::process::Command::new(path)
                    .args(args)
                    .arg(&output_str)
                    .output()
                    .await
                    .map_err(|e| AppError::Subprocess(format!("ffmpeg spawn: {e}")))?;
                if !result.status.success() {
                    let stderr = String::from_utf8_lossy(&result.stderr);
                    return Err(AppError::Subprocess(format!("ffmpeg failed: {stderr}")));
                }
            }
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
