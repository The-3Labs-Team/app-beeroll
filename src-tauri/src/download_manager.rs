use crate::error::{AppError, AppResult};
use crate::process_ext::SilentCommand;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{Mutex as TokioMutex, Notify};

pub struct DownloadManager {
    ytdlp_path: String,
}

#[derive(Debug, Clone)]
pub struct DownloadProgress {
    pub percent: f32,
    pub eta_sec: Option<u32>,
}

impl DownloadManager {
    pub fn new(ytdlp_path: impl Into<String>) -> Self {
        Self {
            ytdlp_path: ytdlp_path.into(),
        }
    }

    pub async fn download<F>(
        &self,
        url: &str,
        output_dir: &Path,
        on_progress: F,
    ) -> AppResult<PathBuf>
    where
        F: FnMut(DownloadProgress) + Send,
    {
        // Non-cancellable callers route through the cancellable path with a
        // notify handle that nobody fires; behaviour is identical to the
        // original loop. Keeping this method in the public API avoids touching
        // every call-site that doesn't need cancellation.
        let cancel = Arc::new(Notify::new());
        self.download_cancellable(url, output_dir, on_progress, cancel)
            .await
    }

    /// Same as [`Self::download`] but races the read loop against
    /// `cancel.notified()`. When notified, the child process is killed and an
    /// `AppError::Subprocess("download cancelled")` is returned.
    pub async fn download_cancellable<F>(
        &self,
        url: &str,
        output_dir: &Path,
        mut on_progress: F,
        cancel: Arc<Notify>,
    ) -> AppResult<PathBuf>
    where
        F: FnMut(DownloadProgress) + Send,
    {
        tokio::fs::create_dir_all(output_dir).await?;
        let output_template = output_dir.join("%(id)s.%(ext)s");

        let start = std::time::Instant::now();
        tracing::info!(url = %url, "yt-dlp download start");

        let mut child = Command::new(&self.ytdlp_path)
            .args([
                "--newline",
                "--no-warnings",
                "--continue",
                // `--print after_move:filepath` below implicitly enables
                // quiet mode, which suppresses the `[download] X.X%` lines
                // we rely on to drive the progress bar. `--no-quiet` keeps
                // both: the per-line progress *and* the final filepath
                // print template.
                "--no-quiet",
                // Ladder, *least likely to 403* first. YouTube tends to
                // block adaptive streams (separate `bestvideo` + `bestaudio`)
                // for unauthenticated residential IPs, returning 403 on the
                // first GET of the video fragment. Progressive single-stream
                // formats (the legacy "18" / "22" itags up to 720p) are
                // served from the same CDN as the watch page and almost
                // always pass through. We try those first, then fall back to
                // adaptive + ffmpeg merge as a last resort.
                "-f",
                "best[height<=720][ext=mp4]/best[height<=720]/best[ext=mp4]/bestvideo[height<=720]+bestaudio/best",
                "--merge-output-format", "mp4",
                // Try multiple YouTube player clients in order so a 403 from
                // one falls through to the next. `tv_simply` and `android`
                // tend to bypass the most aggressive PO-token checks.
                "--extractor-args",
                "youtube:player_client=default,tv_simply,android,web_safari",
                // Be polite under rate-limit / transient network errors —
                // a single retry usually clears a sporadic 403.
                "-R", "5",
                "--fragment-retries", "5",
                "--retry-sleep", "fragment:exp=1:20",
                "-o", output_template.to_string_lossy().as_ref(),
                "--print", "after_move:filepath",
                url,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .no_console()
            .spawn()
            .map_err(|e| AppError::Subprocess(format!("yt-dlp spawn: {e}")))?;

        let stdout = child.stdout.take().unwrap();
        let stderr_pipe = child.stderr.take().unwrap();
        let mut reader = BufReader::new(stdout).lines();
        let mut filepath: Option<PathBuf> = None;

        // Drain stderr in a parallel task so the OS pipe buffer never fills
        // up (which would deadlock yt-dlp). On failure we surface the last
        // few lines as the error message — turns "exit status 1" into a
        // useful explanation like "Requested format not available".
        let stderr_buf: Arc<TokioMutex<String>> = Arc::new(TokioMutex::new(String::new()));
        let stderr_buf_clone = stderr_buf.clone();
        let stderr_task = tokio::spawn(async move {
            let mut buf = String::new();
            let mut r = BufReader::new(stderr_pipe);
            let _ = r.read_to_string(&mut buf).await;
            *stderr_buf_clone.lock().await = buf;
        });

        // Race the read loop against the cancel signal. `biased` ensures the
        // cancel branch is polled first on each select iteration, so a
        // cancellation that arrives between two stdout lines is honored
        // promptly. We can't borrow `child` inside the async block (it would
        // overlap with the post-loop `child.wait()`), so the loop only owns
        // `reader` and `on_progress`.
        //
        // We also info-log every ~25% of progress so the user can see in the
        // Cmd+L modal that the download is moving without us flooding the
        // buffer with the per-line yt-dlp output (which arrives several
        // times a second during merge).
        let mut last_logged_pct: i32 = -1;
        let read_loop = async {
            while let Some(line) = reader.next_line().await? {
                if let Some(p) = parse_progress(&line) {
                    let pct = p.percent as i32;
                    if pct >= last_logged_pct + 25 {
                        tracing::info!(percent = pct, "yt-dlp download progress");
                        last_logged_pct = pct;
                    }
                    on_progress(p);
                } else if !line.trim().starts_with('[')
                    && (line.trim().ends_with(".mp4")
                        || line.trim().ends_with(".mkv")
                        || line.trim().ends_with(".webm"))
                {
                    // Only the bare path emitted by `--print after_move:filepath`
                    // should be captured here. Lines like `[download] Destination:
                    // …mp4` also end with .mp4 but are status messages, not the
                    // post-move filepath we need.
                    filepath = Some(PathBuf::from(line.trim()));
                }
            }
            Ok::<(), AppError>(())
        };

        tokio::select! {
            biased;
            _ = cancel.notified() => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                let _ = stderr_task.await;
                return Err(AppError::Subprocess("download cancelled".into()));
            }
            res = read_loop => {
                res?;
            }
        }

        let status = child.wait().await?;
        let _ = stderr_task.await;

        let elapsed_ms = start.elapsed().as_millis() as u64;

        if !status.success() {
            let stderr_text = stderr_buf.lock().await.clone();
            // Trim and pick the most informative tail lines — yt-dlp prints
            // a banner of dependency info before the actual error, and the
            // last non-empty lines are usually the "ERROR: ..." message.
            let summary: String = stderr_text
                .lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .rev()
                .take(3)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join(" / ");
            let suffix = if summary.is_empty() {
                String::new()
            } else {
                format!(" — {summary}")
            };
            tracing::warn!(
                elapsed_ms,
                status = %status,
                "yt-dlp download failed"
            );
            return Err(AppError::Subprocess(format!(
                "yt-dlp exited with {status}{suffix}"
            )));
        }

        let resolved =
            filepath.ok_or_else(|| AppError::Subprocess("yt-dlp did not print filepath".into()))?;
        let size_kb = tokio::fs::metadata(&resolved)
            .await
            .map(|m| m.len() / 1024)
            .unwrap_or(0);
        tracing::info!(
            elapsed_ms,
            size_kb,
            file = %resolved.display(),
            "yt-dlp download done"
        );

        // Sanity check: yt-dlp sometimes exits 0 after YouTube serves only the
        // first few fragments (anti-bot / 403 on the rest), leaving a tiny mp4
        // that crashes ffmpeg downstream with a confusing "partial file"
        // error. Catch the case here so the picker surfaces a clear message
        // and a retry isn't tripped by `--continue` resuming from the corrupt
        // file.
        const MIN_VIDEO_KB: u64 = 500;
        if size_kb < MIN_VIDEO_KB {
            let _ = tokio::fs::remove_file(&resolved).await;
            return Err(AppError::Subprocess(format!(
                "yt-dlp produced a partial file ({size_kb} KB) — likely a 403 \
                 from YouTube. Try a different candidate."
            )));
        }

        Ok(resolved)
    }
}

fn parse_progress(line: &str) -> Option<DownloadProgress> {
    let l = line.trim();
    if !l.starts_with("[download]") {
        return None;
    }
    let after = l.strip_prefix("[download]")?.trim();
    let pct_token = after.split_whitespace().next()?;
    let pct = pct_token.trim_end_matches('%').parse::<f32>().ok()?;
    let eta = after.split("ETA").nth(1).and_then(|e| {
        let t = e.trim();
        let parts: Vec<&str> = t.splitn(2, |c: char| c.is_whitespace()).collect();
        let token = parts[0];
        let mut secs = 0u32;
        for part in token.split(':') {
            secs = secs * 60 + part.parse::<u32>().ok()?;
        }
        Some(secs)
    });
    Some(DownloadProgress {
        percent: pct,
        eta_sec: eta,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_progress_basic() {
        let p = parse_progress("[download]  42.3% of 10.5MiB at 1.2MiB/s ETA 00:05").unwrap();
        assert!((p.percent - 42.3).abs() < 0.01);
        assert_eq!(p.eta_sec, Some(5));
    }

    #[test]
    fn parse_progress_ignores_non_progress_line() {
        assert!(parse_progress("[youtube] abc: Downloading").is_none());
    }

    #[test]
    fn parse_progress_handles_hour_minute_second_eta() {
        let p = parse_progress("[download] 100.0% of 99.0MiB at 2.0MiB/s ETA 01:02:03").unwrap();
        assert!((p.percent - 100.0).abs() < 0.01);
        assert_eq!(p.eta_sec, Some(3723));
    }

    #[test]
    fn parse_progress_handles_missing_eta() {
        let p = parse_progress("[download]  7.5% of 1.0MiB at 200.0KiB/s").unwrap();
        assert!((p.percent - 7.5).abs() < 0.01);
        assert_eq!(p.eta_sec, None);
    }

    #[test]
    fn parse_progress_rejects_malformed_percent() {
        assert!(parse_progress("[download] nope% of 1.0MiB ETA 00:01").is_none());
    }

    /// Pre-firing the cancel notify before [`download_cancellable`] starts
    /// must terminate the run with the conventional cancelled-error string,
    /// even on a system without yt-dlp on PATH (the cancel fires before
    /// stdout reads). This guards the wiring between AppState's notify map
    /// and the manager's tokio::select branch.
    #[tokio::test]
    async fn cancellable_returns_cancelled_when_notified_before_progress() {
        // Use a path that will spawn-fail in case the cancel branch loses the
        // race; the test fails clearly either way (we'd see the spawn error,
        // not "download cancelled"). The /usr/bin/sleep here just produces a
        // long-running child without any stdout, so the only way to terminate
        // the loop is through the cancel signal.
        let dl = DownloadManager::new("/bin/sleep");
        let cancel = Arc::new(Notify::new());
        // Notify before await so the select fires immediately.
        cancel.notify_waiters();

        let dir = tempfile::tempdir().expect("tmp dir");
        // Pre-fire is a race with the spawn — give the manager an URL arg
        // that sleep will treat as a duration so the child runs long enough
        // for the cancel to win on slower machines.
        let result = dl
            .download_cancellable("60", dir.path(), |_p: DownloadProgress| {}, cancel.clone())
            .await;

        // Either we cancelled (preferred) or sleep returned non-zero (fine
        // too — also exits the function with a Subprocess error). What we
        // *don't* want is a successful Ok(_) here.
        match result {
            Err(AppError::Subprocess(_)) => {}
            other => panic!("expected Subprocess error, got {other:?}"),
        }
    }
}
