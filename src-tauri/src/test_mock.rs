//! Cross-platform mock subprocess binaries for unit tests.

use std::path::PathBuf;

/// Returns a temp directory guard and a script that echoes all arguments to stdout.
pub fn echo_mock() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("tempdir for echo mock");
    let path = dir.path().join(echo_mock_filename());
    write_echo_mock(&path);
    (dir, path)
}

/// Returns a temp directory guard and a script that runs for a long time (no stdout).
pub fn sleep_mock() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().expect("tempdir for sleep mock");
    let path = dir.path().join(sleep_mock_filename());
    write_sleep_mock(&path);
    (dir, path)
}

fn echo_mock_filename() -> &'static str {
    if cfg!(windows) {
        "mock-echo.cmd"
    } else {
        "mock-echo.sh"
    }
}

fn sleep_mock_filename() -> &'static str {
    if cfg!(windows) {
        "mock-sleep.cmd"
    } else {
        "mock-sleep.sh"
    }
}

fn write_echo_mock(path: &std::path::Path) {
    if cfg!(windows) {
        std::fs::write(path, "@echo off\r\necho %*\r\n").expect("write mock echo cmd");
    } else {
        std::fs::write(path, "#!/bin/sh\nexec echo \"$@\"\n").expect("write mock echo sh");
        set_executable(path);
    }
}

fn write_sleep_mock(path: &std::path::Path) {
    if cfg!(windows) {
        std::fs::write(path, "@echo off\r\ntimeout /t 120 /nobreak >nul\r\n")
            .expect("write mock sleep cmd");
    } else {
        std::fs::write(path, "#!/bin/sh\nexec sleep 120\n").expect("write mock sleep sh");
        set_executable(path);
    }
}

#[cfg(unix)]
fn set_executable(path: &std::path::Path) {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)
        .expect("mock metadata")
        .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms).expect("mock chmod");
}
