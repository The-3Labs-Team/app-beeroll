use crate::download_manager::DownloadProgress;
use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use tokio::io::AsyncWriteExt;

pub struct StockDownloader {
    client: reqwest::Client,
}

impl Default for StockDownloader {
    fn default() -> Self {
        Self::new()
    }
}

impl StockDownloader {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    pub async fn download<F>(
        &self,
        url: &str,
        output_dir: &Path,
        filename: &str,
        mut on_progress: F,
    ) -> AppResult<PathBuf>
    where
        F: FnMut(DownloadProgress) + Send,
    {
        use futures::StreamExt;

        tokio::fs::create_dir_all(output_dir).await?;
        let dest = output_dir.join(filename);

        let resp = self.client.get(url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::Subprocess(format!(
                "stock download {} HTTP {}",
                url,
                resp.status()
            )));
        }
        let total = resp.content_length();
        let mut file = tokio::fs::File::create(&dest).await?;
        let mut stream = resp.bytes_stream();
        let mut downloaded: u64 = 0;
        let mut last_emit = std::time::Instant::now();
        let started = std::time::Instant::now();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|e| AppError::Subprocess(format!("stock download stream: {e}")))?;
            file.write_all(&chunk).await?;
            downloaded += chunk.len() as u64;

            if last_emit.elapsed() > std::time::Duration::from_millis(200) {
                let percent = total
                    .map(|t| (downloaded as f32 / t as f32) * 100.0)
                    .unwrap_or(0.0);
                let elapsed = started.elapsed().as_secs_f32().max(0.001);
                let bps = (downloaded as f32) / elapsed;
                let eta_sec = total.and_then(|t| {
                    if bps > 0.0 {
                        Some(((t - downloaded) as f32 / bps) as u32)
                    } else {
                        None
                    }
                });
                on_progress(DownloadProgress { percent, eta_sec });
                last_emit = std::time::Instant::now();
            }
        }
        file.flush().await?;
        Ok(dest)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn download_writes_file_from_mock() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", "/file.mp4")
            .with_status(200)
            .with_header("content-length", "11")
            .with_body("hello world")
            .create_async()
            .await;

        let url = format!("{}/file.mp4", server.url());
        let tmp = TempDir::new().unwrap();
        let dl = StockDownloader::new();
        let mut last = 0.0;
        let path = dl
            .download(&url, tmp.path(), "out.mp4", |p| {
                last = p.percent;
            })
            .await
            .unwrap();

        let content = std::fs::read_to_string(&path).unwrap();
        assert_eq!(content, "hello world");
        let _ = last;
    }

    #[tokio::test]
    async fn download_propagates_4xx() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", "/x")
            .with_status(404)
            .create_async()
            .await;
        let url = format!("{}/x", server.url());
        let tmp = TempDir::new().unwrap();
        let err = StockDownloader::new()
            .download(&url, tmp.path(), "out.mp4", |_| {})
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::Subprocess(_)));
    }
}
