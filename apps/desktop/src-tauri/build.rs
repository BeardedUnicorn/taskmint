fn main() {
    // Which TaskMint this is (src/environment.rs): TASKMINT_ENV, "production"
    // for a release and "dev" (also when unset) for any other build, the
    // variable that picks the webview's Firebase project too
    // (scripts/environment.mjs).
    println!("cargo:rerun-if-env-changed=TASKMINT_ENV");
    let environment = std::env::var("TASKMINT_ENV")
        .ok()
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "dev".to_string());
    if environment != "production" && environment != "dev" {
        panic!(
            "TASKMINT_ENV is \"{environment}\", but it can only be \"production\" or \"dev\" (unset means \"dev\")."
        );
    }
    println!("cargo:rustc-env=TASKMINT_ENV={environment}");
    tauri_build::build()
}
