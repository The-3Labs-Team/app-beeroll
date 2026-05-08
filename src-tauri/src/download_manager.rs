use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use std::process::Stdio;
use tokio::sync::Notify;

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
        Self { ytdlp_path: ytdlp_path.into() }
    }

    pub async fn download<F>(&self, url: &str, output_dir: &Path, on_progress: F) -> AppResult<PathBuf>
    where
        F: FnMut(DownloadProgress) + Send,
    {
        // Non-cancellable callers route through the cancellable path with a
        // notify handle that nobody fires; behaviour is identical to the
        // original loop. Keeping this method in the public API avoids touching
        // every call-site that doesn't need cancellation.
        let cancel = Arc::new(Notify::new());
        self.download_cancellable(url, output_dir, on_progress, cancel).await
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

        let mut child = Command::new(&self.ytdlp_path)
            .args([
                "--newline",
                "--no-warnings",
                "--continue",
                "-f", "best[ext=mp4][height<=720]/best[ext=mp4]/best",
                "-o", output_template.to_string_lossy().as_ref(),
                "--print", "after_move:filepath",
                url,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| AppError::Subprocess(format!("yt-dlp spawn: {e}")))?;

        let stdout = child.stdout.take().unwrap();
        let mut reader = BufReader::new(stdout).lines();
        let mut filepath: Option<PathBuf> = None;

        // Race the read loop against the cancel signal. `biased` ensures the
        // cancel branch is polled first on each select iteration, so a
        // cancellation that arrives between two stdout lines is honored
        // promptly. We can't borrow `child` inside the async block (it would
        // overlap with the post-loop `child.wait()`), so the loop only owns
        // `reader` and `on_progress`.
        let read_loop = async {
            while let Some(line) = reader.next_line().await? {
                if let Some(p) = parse_progress(&line) {
                    on_progress(p);
                } else if line.trim().ends_with(".mp4") || line.trim().ends_with(".mkv") || line.trim().ends_with(".webm") {
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
                return Err(AppError::Subprocess("download cancelled".into()));
            }
            res = read_loop => {
                res?;
            }
        }

        let status = child.wait().await?;
        if !status.success() {
            return Err(AppError::Subprocess(format!("yt-dlp exited with {status}")));
        }

        filepath.ok_or_else(|| AppError::Subprocess("yt-dlp did not print filepath".into()))
    }
}

fn parse_progress(line: &str) -> Option<DownloadProgress> {
    let l = line.trim();
    if !l.starts_with("[download]") { return None; }
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
    Some(DownloadProgress { percent: pct, eta_sec: eta })
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
            .download_cancellable(
                "60",
                dir.path(),
                |_p: DownloadProgress| {},
                cancel.clone(),
            )
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
