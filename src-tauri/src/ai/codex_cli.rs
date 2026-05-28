use crate::ai::AIProvider;
use crate::error::{AppError, AppResult};
use async_trait::async_trait;
use std::path::PathBuf;
use tokio::process::Command;

pub struct CodexCliProvider {
    binary_path: PathBuf,
}

impl CodexCliProvider {
    pub fn new(binary_path: String) -> Self {
        Self {
            binary_path: PathBuf::from(binary_path),
        }
    }

    /// Resolve the binary via `which` if no path is configured.
    pub fn auto_detect() -> AppResult<Self> {
        let p = which::which("codex")
            .map_err(|e| AppError::InvalidInput(format!("`codex` CLI not found in PATH: {e}")))?;
        Ok(Self { binary_path: p })
    }
}

#[async_trait]
impl AIProvider for CodexCliProvider {
    fn name(&self) -> &'static str {
        "codex_cli"
    }

    async fn complete(&self, system: &str, user: &str) -> AppResult<String> {
        // codex exec runs non-interactively. We pass --skip-git-repo-check so the
        // user does not need to invoke us from inside a git repo, and concatenate
        // system + user into a single prompt argument.
        let prompt = if system.is_empty() {
            user.to_string()
        } else {
            format!("{system}\n\n{user}")
        };
        let output = Command::new(&self.binary_path)
            .arg("exec")
            .arg("--skip-git-repo-check")
            .arg(&prompt)
            .output()
            .await
            .map_err(|e| AppError::Subprocess(format!("failed to spawn codex: {e}")))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
            return Err(AppError::AiProvider(format!(
                "codex CLI exited with {:?}: {}",
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

    #[tokio::test]
    async fn complete_uses_configured_binary_and_returns_stdout() {
        let (_guard, mock_path) = crate::test_mock::echo_mock();
        let provider = CodexCliProvider::new(mock_path.to_string_lossy().into_owned());
        let out = provider.complete("system", "user").await.unwrap();
        assert!(out.contains("exec"));
        assert!(out.contains("system"));
        assert!(out.contains("user"));
    }

    #[tokio::test]
    async fn complete_errors_when_binary_missing() {
        let provider =
            CodexCliProvider::new("/this/path/definitely/does/not/exist/codex".into());
        let err = provider.complete("s", "u").await.unwrap_err();
        assert!(matches!(err, AppError::Subprocess(_)));
    }
}
