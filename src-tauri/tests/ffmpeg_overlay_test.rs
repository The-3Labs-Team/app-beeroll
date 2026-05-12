use std::path::PathBuf;
use std::process::Command;
use tempfile::TempDir;

/// Integration test: drive the bundled ffmpeg sidecar against a 2 s synthetic
/// clip and confirm the drawtext overlay produces a real video file.
///
/// Skipped by default because it depends on the sidecar binary being on disk.
/// Run `bash scripts/fetch-binaries.sh` first, then
/// `cargo test --include-ignored`.
#[tokio::test]
#[ignore = "requires sidecar ffmpeg fetched via scripts/fetch-binaries.sh"]
async fn ffmpeg_overlay_applies_drawtext() {
    let target = host_target();
    let ext = if target.contains("windows") { ".exe" } else { "" };
    let ffmpeg = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(format!("binaries/ffmpeg-{target}{ext}"));
    assert!(
        ffmpeg.exists(),
        "missing sidecar at {} — run `bash scripts/fetch-binaries.sh`",
        ffmpeg.display()
    );

    let tmp = TempDir::new().unwrap();
    let input = tmp.path().join("input.mp4");
    let output = tmp.path().join("output.mp4");

    let status = Command::new(&ffmpeg)
        .args([
            "-y",
            "-f", "lavfi",
            "-i", "testsrc=duration=2:size=320x240:rate=30",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            input.to_str().unwrap(),
        ])
        .status()
        .unwrap();
    assert!(status.success(), "ffmpeg test video generation failed");

    let font = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources/fonts/Inter-Regular.ttf");
    // The integration test cannot construct a Tauri AppHandle, so we use the
    // path-based variant of VideoProcessor pointing at the same sidecar
    // binary that gets bundled by `tauri build`.
    let processor = video_broll_lib::video_processor::VideoProcessor::with_path(
        ffmpeg.clone(),
        font,
    );
    processor
        .apply_copyright_overlay(&input, &output, "TestChannel")
        .await
        .unwrap();
    assert!(output.exists());
    let metadata = std::fs::metadata(&output).unwrap();
    assert!(metadata.len() > 1000, "output should be a real video file");
}

fn host_target() -> String {
    // Allow CI to override; otherwise inspect rustc.
    if let Ok(t) = std::env::var("TARGET") {
        return t;
    }
    let output = Command::new("rustc").args(["-vV"]).output().unwrap();
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find(|l| l.starts_with("host:"))
        .and_then(|l| l.split_whitespace().last())
        .map(|s| s.to_string())
        .expect("rustc -vV did not report host triple")
}
