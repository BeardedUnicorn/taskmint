use serde::Deserialize;
use std::env;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize)]
struct BuildTimeConfig {
    tray_status_update_interval: u64,
    tray_menu_refresh_interval: u64,
}

fn main() {
    // Tell Cargo that if the given file changes, to rerun this build script.
    println!("cargo:rerun-if-changed=config.toml");

    let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
    let config_path = Path::new(&manifest_dir).join("config.toml");
    let config_content = fs::read_to_string(config_path)
        .expect("Failed to read config.toml");
    let config: BuildTimeConfig = toml::from_str(&config_content)
        .expect("Failed to parse config.toml");

    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("generated_config.rs");
    fs::write(
        &dest_path,
        format!(
            "pub const TRAY_STATUS_UPDATE_INTERVAL: u64 = {};\npub const TRAY_MENU_REFRESH_INTERVAL: u64 = {};",
            config.tray_status_update_interval, config.tray_menu_refresh_interval
        ),
    )
    .expect("Failed to write generated_config.rs");

    tauri_build::build()
}