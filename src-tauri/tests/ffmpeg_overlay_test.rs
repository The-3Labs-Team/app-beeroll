use std::path::PathBuf;
use std::process::Command;
use tempfile::TempDir;

#[tokio::test]
#[ignore = "requires ffmpeg installed; generates 2s test video"]
async fn ffmpeg_overlay_applies_drawtext() {
    let ffmpeg = which::which("ffmpeg").expect("ffmpeg in PATH");
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

    let font = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/fonts/Inter-Regular.ttf");
    let processor = video_broll_lib::video_processor::VideoProcessor::new(
        ffmpeg.to_string_lossy().into_owned(),
        font,
    );
    processor.apply_copyright_overlay(&input, &output, "TestChannel").await.unwrap();
    assert!(output.exists());
    let metadata = std::fs::metadata(&output).unwrap();
    assert!(metadata.len() > 1000, "output should be a real video file");
}
