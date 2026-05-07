use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),

    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("ai provider error: {0}")]
    AiProvider(String),

    #[error("invalid response from AI: {0}")]
    AiResponseInvalid(String),

    #[error("subprocess failed: {0}")]
    Subprocess(String),

    #[error("project not found: {0}")]
    ProjectNotFound(String),

    #[error("invalid input: {0}")]
    InvalidInput(String),
}

pub type AppResult<T> = std::result::Result<T, AppError>;

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
