use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    let git_hash = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default();
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    println!(
        "cargo:rustc-env=WASM_BUILD_ID={}-{}",
        git_hash.trim(),
        ts
    );
    println!("cargo:rerun-if-changed=src/lib.rs");
}
