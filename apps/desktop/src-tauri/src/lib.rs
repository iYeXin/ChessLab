mod engines;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            engines::spawn_engine,
            engines::engine_write,
            engines::engine_stop,
            engines::engine_nnue_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
