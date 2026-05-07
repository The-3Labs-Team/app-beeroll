use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use std::process::Stdio;

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

    pub async fn download<F>(&self, url: &str, output_dir: &Path, mut on_progress: F) -> AppResult<PathBuf>
    where
        F: FnMut(DownloadProgress) + Send,
    {
        tokio::fs::create_dir_all(output_dir).await?;
        let output_template = output_dir.join("%(id)s.%(ext)s");

        let mut child = Command::new(&self.ytdlp_path)
            .args([
                "--newline",
                "--no-warnings",
                "-f", "best[ext=mp4][height<=720]/best[ext=mp4]/best",
                "-o", output_template.to_string_lossy().as_ref(),
                "--print", "after_move:filepath",
                url,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| AppError::Subprocess(format!("yt-dlp spawn: {e}")))?;

        let stdout = child.stdout.take().unwrap();
        let mut reader = BufReader::new(stdout).lines();
        let mut filepath: Option<PathBuf> = None;

        while let Some(line) = reader.next_line().await? {
            if let Some(p) = parse_progress(&line) {
                on_progress(p);
            } else if line.trim().ends_with(".mp4") || line.trim().ends_with(".mkv") || line.trim().ends_with(".webm") {
                filepath = Some(PathBuf::from(line.trim()));
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
}
