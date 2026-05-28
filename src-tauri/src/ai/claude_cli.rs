use crate::ai::AIProvider;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use std::path::PathBuf;
use tokio::process::Command;

pub struct ClaudeCliProvider {
    binary_path: PathBuf,
}

impl ClaudeCliProvider {
    pub fn new(binary_path: String) -> Self {
        Self {
            binary_path: PathBuf::from(binary_path),
        }
    }

    /// Resolve the binary via `which` if no path is configured.
    pub fn auto_detect() -> AppResult<Self> {
        let p = which::which("claude").map_err(|e| {
            AppError::InvalidInput(format!("`claude` CLI not found in PATH: {e}"))
        })?;
        Ok(Self { binary_path: p })
    }
}

#[async_trait]
impl AIProvider for ClaudeCliProvider {
    fn name(&self) -> &'static str {
        "claude_cli"
    }

    async fn complete(&self, system: &str, user: &str) -> AppResult<String> {
        // Concatenate system + user as a single prompt; the CLI does not have a
        // separate system prompt argument suitable for our use here.
        let prompt = if system.is_empty() {
            user.to_string()
        } else {
            format!("{system}\n\n{user}")
        };
        let output = Command::new(&self.binary_path)
            .arg("-p")
            .arg(&prompt)
            .output()
            .await
            .map_err(|e| AppError::Subprocess(format!("failed to spawn claude: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
            return Err(AppError::AiProvider(format!(
                "claude CLI exited with {:?}: {}",
                output.status.code(),
                stderr
            )));
        }
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg_attr(windows, ignore = "uses /bin/echo mock only on Unix")]
    #[tokio::test]
    async fn complete_uses_configured_binary_and_returns_stdout() {
        // /bin/echo prints its args to stdout; this lets us simulate a CLI that
        // produces a deterministic response without needing a real `claude` binary.
        let provider = ClaudeCliProvider::new("/bin/echo".into());
        let out = provider.complete("system", "user").await.unwrap();
        // /bin/echo prints "-p <prompt>" — the trim collapses trailing newline.
        assert!(out.contains("system"));
        assert!(out.contains("user"));
    }

    #[tokio::test]
    async fn complete_errors_when_binary_missing() {
        let provider =
            ClaudeCliProvider::new("/this/path/definitely/does/not/exist/claude".into());
        let err = provider.complete("s", "u").await.unwrap_err();
        assert!(matches!(err, AppError::Subprocess(_)));
    }
}
