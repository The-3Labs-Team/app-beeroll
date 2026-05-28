//! Cross-platform mock subprocess binaries for unit tests.

use std::path::{Path, PathBuf};

/// Returns a temp directory guard and a binary that echoes all arguments to stdout.
pub fn echo_mock() -> (tempfile::TempDir, PathBuf) {
    #[cfg(windows)]
    {
        let dir = tempfile::tempdir().expect("tempdir for echo mock guard");
        return (dir, built_test_bin("mock-echo"));
    }
    #[cfg(unix)]
    {
        let dir = tempfile::tempdir().expect("tempdir for echo mock");
        let path = dir.path().join("mock-echo.sh");
        write_echo_mock(&path);
        (dir, path)
    }
}

/// Returns a temp directory guard and a binary that runs for a long time (no stdout).
pub fn sleep_mock() -> (tempfile::TempDir, PathBuf) {
    #[cfg(windows)]
    {
        let dir = tempfile::tempdir().expect("tempdir for sleep mock guard");
        return (dir, built_test_bin("mock-sleep"));
    }
    #[cfg(unix)]
    {
        let dir = tempfile::tempdir().expect("tempdir for sleep mock");
        let path = dir.path().join("mock-sleep.sh");
        write_sleep_mock(&path);
        (dir, path)
    }
}

#[cfg(windows)]
fn built_test_bin(name: &str) -> PathBuf {
    let target_dir = std::env::var_os("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target"));
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let path = target_dir.join(profile).join(format!("{name}.exe"));
    assert!(
        path.is_file(),
        "test helper {name} missing at {}; run `cargo test --features test-mocks`",
        path.display()
    );
    path
}

#[cfg(unix)]
fn write_echo_mock(path: &Path) {
    std::fs::write(path, "#!/bin/sh\nexec echo \"$@\"\n").expect("write mock echo sh");
    set_executable(path);
}

#[cfg(unix)]
fn write_sleep_mock(path: &Path) {
    std::fs::write(path, "#!/bin/sh\nexec sleep 120\n").expect("write mock sleep sh");
    set_executable(path);
}

#[cfg(unix)]
fn set_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)
        .expect("mock metadata")
        .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms).expect("mock chmod");
}
