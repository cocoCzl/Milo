//! Local timing records for explicitly enabled diagnostic Release builds only.
use tauri::AppHandle;

#[cfg(feature = "diagnostics")]
pub fn record(app: &AppHandle, value: serde_json::Value) -> Result<(), String> {
    use std::io::Write;
    use tauri::Manager;
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("open-profile.jsonl"))
        .map_err(|e| e.to_string())?;
    let mut value = value;
    value["pid"] = std::process::id().into();
    serde_json::to_writer(&mut file, &value).map_err(|e| e.to_string())?;
    writeln!(file).map_err(|e| e.to_string())
}
#[cfg(not(feature = "diagnostics"))]
pub fn record(_app: &AppHandle, _value: serde_json::Value) -> Result<(), String> {
    Err("Local open profiling is disabled in this build.".into())
}

pub fn measure<T>(app: &AppHandle, path: &str, stage: &str, operation: impl FnOnce() -> T) -> T {
    #[cfg(feature = "diagnostics")]
    {
        let epoch_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs_f64()
            * 1000.0;
        let start = std::time::Instant::now();
        let result = operation();
        let ms = start.elapsed().as_secs_f64() * 1000.0;
        let _ = record(
            app,
            serde_json::json!({ "kind": "native", "stage": stage, "path": path, "epochMs": epoch_ms, "ms": ms }),
        );
        result
    }
    #[cfg(not(feature = "diagnostics"))]
    {
        let _ = (app, path, stage);
        operation()
    }
}

#[tauri::command]
pub fn record_open_profile(app: AppHandle, record: serde_json::Value) -> Result<(), String> {
    self::record(&app, record)
}
