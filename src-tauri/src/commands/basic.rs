// Basic command handlers

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn log_to_terminal(message: String) {
    println!("Frontend log: {}", message);
}
