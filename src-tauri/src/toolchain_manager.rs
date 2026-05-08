use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const YTDLP_LATEST_BASE: &str = "https://github.com/yt-dlp/yt-dlp/releases/latest/download";

#[derive(Debug, Serialize, Clone)]
pub struct ToolchainStatus {
    pub ytdlp: ToolStatus,
    pub ffmpeg: ToolStatus,
}

#[derive(Debug, Serialize, Clone)]
pub struct ToolStatus {
    pub found: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AiCliStatus {
    pub claude: ToolStatus,
    pub codex: ToolStatus,
    pub ollama: ToolStatus,
}

/// Result of a successful auto-install of yt-dlp.
pub struct YtdlpInstall {
    pub path: PathBuf,
    pub version: Option<String>,
}

/// Returns the local file name yt-dlp is installed under in our app data dir.
fn ytdlp_local_file_name() -> &'static str {
    if std::env::consts::OS == "windows" {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    }
}

/// Returns the asset name to download from the GitHub release for the current
/// host OS. macOS gets a universal binary that ships separately from Linux.
fn ytdlp_remote_asset_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "yt-dlp_macos",
        "windows" => "yt-dlp.exe",
        _ => "yt-dlp",
    }
}

/// Resolve the directory used to store our auto-installed binaries
/// (`<app_data_dir>/bin`).
fn ytdlp_bin_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Subprocess(format!("app_data_dir: {e}")))?
        .join("bin");
    Ok(dir)
}

/// Ensure yt-dlp is present in the per-user app data dir, downloading it on
/// first run and refreshing it once per day. Returns the resolved local path
/// and (best-effort) the running version string.
pub async fn ensure_ytdlp(app: &AppHandle) -> AppResult<YtdlpInstall> {
    let bin_dir = ytdlp_bin_dir(app)?;
    tokio::fs::create_dir_all(&bin_dir).await?;

    let local_path = bin_dir.join(ytdlp_local_file_name());
    let asset_name = ytdlp_remote_asset_name();

    let need_install = !local_path.exists();
    let need_update = !need_install && should_check_update(&bin_dir).await;

    if need_install || need_update {
        // For auto-update we tolerate transient network failures: the existing
        // binary is still usable. For first-install the failure must surface.
        match download_ytdlp(&local_path, asset_name).await {
            Ok(()) => {
                mark_update_check(&bin_dir).await;
            }
            Err(e) if !need_install => {
                tracing::warn!("yt-dlp update check failed (keeping existing binary): {e}");
                // Even on failure, push the stamp forward so we don't retry
                // every command on a flaky network. We still try again
                // tomorrow.
                mark_update_check(&bin_dir).await;
            }
            Err(e) => return Err(e),
        }
    }

    let version = ytdlp_version(&local_path).await.ok();
    Ok(YtdlpInstall {
        path: local_path,
        version,
    })
}

async fn download_ytdlp(dest: &Path, asset_name: &str) -> AppResult<()> {
    let url = format!("{YTDLP_LATEST_BASE}/{asset_name}");
    let bytes = reqwest::get(&url)
        .await?
        .error_for_status()?
        .bytes()
        .await?;
    tokio::fs::write(dest, &bytes).await?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = tokio::fs::metadata(dest).await?.permissions();
        perms.set_mode(0o755);
        tokio::fs::set_permissions(dest, perms).await?;
    }
    Ok(())
}

async fn ytdlp_version(path: &Path) -> AppResult<String> {
    let output = tokio::process::Command::new(path)
        .arg("--version")
        .output()
        .await
        .map_err(|e| AppError::Subprocess(format!("yt-dlp version: {e}")))?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn should_check_update(bin_dir: &Path) -> bool {
    let stamp = bin_dir.join(".last_update_check");
    match tokio::fs::metadata(&stamp).await {
        Ok(meta) => match meta.modified() {
            Ok(modified) => match modified.elapsed() {
                Ok(d) => d.as_secs() > 86_400,
                // Negative elapsed (clock skew) — treat as fresh, no update.
                Err(_) => false,
            },
            Err(_) => true,
        },
        Err(_) => true,
    }
}

async fn mark_update_check(bin_dir: &Path) {
    let stamp = bin_dir.join(".last_update_check");
    let _ = tokio::fs::write(&stamp, b"").await;
}

/// Detect yt-dlp using the AppHandle: prefer the auto-installed copy, fall
/// back to PATH (legacy installs).
pub async fn detect_toolchain_with_app(app: &AppHandle) -> ToolchainStatus {
    let local_path = ytdlp_bin_dir(app)
        .ok()
        .map(|dir| dir.join(ytdlp_local_file_name()));

    let ytdlp = if let Some(path) = local_path.as_ref().filter(|p| p.exists()) {
        let version = ytdlp_version(path).await.ok();
        ToolStatus {
            found: true,
            path: Some(path.to_string_lossy().into_owned()),
            version,
        }
    } else {
        detect_one("yt-dlp", &["--version"]).await
    };

    ToolchainStatus {
        ytdlp,
        ffmpeg: ToolStatus {
            found: true,
            path: Some("(bundled)".into()),
            version: Some("bundled".into()),
        },
    }
}

/// Legacy PATH-only detection. Kept for callers that don't have an
/// [`AppHandle`] (e.g. early bootstrap before Tauri's setup hook completes).
pub async fn detect_toolchain() -> ToolchainStatus {
    ToolchainStatus {
        ytdlp: detect_one("yt-dlp", &["--version"]).await,
        // ffmpeg ships with the app as a Tauri sidecar (see
        // `tauri.conf.json > bundle.externalBin`), so we do not probe PATH.
        ffmpeg: ToolStatus {
            found: true,
            path: Some("(bundled)".into()),
            version: Some("bundled".into()),
        },
    }
}

pub async fn detect_ai_clis() -> AiCliStatus {
    AiCliStatus {
        claude: detect_one("claude", &["--version"]).await,
        codex: detect_one("codex", &["--version"]).await,
        ollama: detect_one("ollama", &["--version"]).await,
    }
}

async fn detect_one(name: &str, args: &[&str]) -> ToolStatus {
    let path = match which::which(name) {
        Ok(p) => p,
        Err(_) => return ToolStatus { found: false, path: None, version: None },
    };
    let path_str = path.to_string_lossy().into_owned();
    let output = tokio::process::Command::new(&path).args(args).output().await;
    match output {
        Ok(o) if o.status.success() => {
            let version = String::from_utf8_lossy(&o.stdout).lines().next().map(|l| l.to_string());
            ToolStatus { found: true, path: Some(path_str), version }
        }
        _ => ToolStatus { found: true, path: Some(path_str), version: None },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn should_check_update_returns_true_when_no_stamp() {
        let tmp = TempDir::new().unwrap();
        assert!(should_check_update(tmp.path()).await);
    }

    #[tokio::test]
    async fn should_check_update_returns_false_when_stamp_recent() {
        let tmp = TempDir::new().unwrap();
        mark_update_check(tmp.path()).await;
        assert!(!should_check_update(tmp.path()).await);
    }

    #[tokio::test]
    async fn should_check_update_returns_true_when_stamp_old() {
        let tmp = TempDir::new().unwrap();
        let stamp = tmp.path().join(".last_update_check");
        tokio::fs::write(&stamp, b"").await.unwrap();

        // Backdate the file's modified time by 2 days. We use the std `File`
        // handle so that the `set_modified` API is available on stable Rust.
        let two_days_ago = std::time::SystemTime::now()
            - std::time::Duration::from_secs(86_400 * 2);
        let f = std::fs::File::options()
            .write(true)
            .open(&stamp)
            .unwrap();
        f.set_modified(two_days_ago).unwrap();
        drop(f);

        assert!(should_check_update(tmp.path()).await);
    }

    #[test]
    fn ytdlp_local_file_name_picks_extension() {
        // Sanity: the function must always return a non-empty filename. The
        // platform-specific branches are exercised by the host OS at test
        // time.
        let name = ytdlp_local_file_name();
        assert!(!name.is_empty());
        assert!(name.starts_with("yt-dlp"));
    }

    #[test]
    fn ytdlp_remote_asset_name_picks_platform_asset() {
        let name = ytdlp_remote_asset_name();
        match std::env::consts::OS {
            "macos" => assert_eq!(name, "yt-dlp_macos"),
            "windows" => assert_eq!(name, "yt-dlp.exe"),
            _ => assert_eq!(name, "yt-dlp"),
        }
    }
}
