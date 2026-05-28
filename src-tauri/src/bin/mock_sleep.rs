//! Test-only helper: blocks for a long time (used instead of .cmd on Windows).

fn main() {
    std::thread::sleep(std::time::Duration::from_secs(120));
}
