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
        let escaped_font = escape_font_path(&self.font_path);
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

/// Build the `fontfile=` value for the drawtext filter from a font path.
///
/// Two Windows-specific hazards have to be defused; on Unix (no verbatim
/// prefix, no drive colon) the path passes through unchanged:
///
/// 1. Tauri resolves bundled resources to extended-length paths carrying the
///    verbatim prefix (`\\?\C:\...`). Normalized it becomes `//?/C...`, which
///    ffmpeg can't open — so the prefix is stripped first.
/// 2. The drive colon must survive ffmpeg's filtergraph parsing, which
///    un-escapes the description in *two* passes: the outer pass consumes one
///    backslash, the inner option splitter then treats `:` as a separator. A
///    single `\:` (the obvious escape) is therefore eaten by the outer pass and
///    the colon still splits — exactly the "No option name near '…'" failure.
///    Doubling it to `\\:` leaves `\:` after the outer pass, so the inner pass
///    sees a properly escaped colon and keeps it literal. The drive letter then
///    arrives intact as `C\\:/Users/.../font.ttf`.
fn escape_font_path(path: &Path) -> String {
    let raw = path.to_string_lossy();
    let clean = raw.strip_prefix(r"\\?\").unwrap_or(raw.as_ref());
    clean.replace('\\', "/").replace(':', r"\\:")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_drawtext_handles_special_chars() {
        assert_eq!(escape_drawtext("foo:bar"), r"foo\:bar");
        assert_eq!(escape_drawtext("it's"), r"it\'s");
    }

    #[test]
    fn escape_font_path_strips_windows_verbatim_prefix() {
        // The exact shape Tauri hands back for a bundled resource on Windows.
        let p = Path::new(
            r"\\?\C:\Users\Doukas\AppData\Local\BeeRoll\resources\fonts\Inter-Regular.ttf",
        );
        // Double-backslashed colon so it survives ffmpeg's two un-escaping passes.
        assert_eq!(
            escape_font_path(p),
            r"C\\:/Users/Doukas/AppData/Local/BeeRoll/resources/fonts/Inter-Regular.ttf",
        );
    }

    #[test]
    fn escape_font_path_passes_unix_path_through() {
        let p = Path::new("/Users/toms/Library/fonts/Inter-Regular.ttf");
        assert_eq!(
            escape_font_path(p),
            "/Users/toms/Library/fonts/Inter-Regular.ttf",
        );
    }
}
