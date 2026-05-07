use serde::Serialize;

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

pub async fn detect_toolchain() -> ToolchainStatus {
    ToolchainStatus {
        ytdlp: detect_one("yt-dlp", &["--version"]).await,
        ffmpeg: detect_one("ffmpeg", &["-version"]).await,
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
