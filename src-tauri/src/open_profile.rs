//! Local timing records for explicitly enabled diagnostic Release builds only.
use tauri::AppHandle;

#[cfg(feature = "diagnostics")]
pub fn record(app: &AppHandle, value: serde_json::Value) -> Result<(), String> {
    use tauri::Manager;
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut value = value;
    value["pid"] = std::process::id().into();
    append_record(&directory.join("open-profile.jsonl"), &value)
}

#[cfg(feature = "diagnostics")]
fn append_record(path: &std::path::Path, value: &serde_json::Value) -> Result<(), String> {
    use std::io::Write;
    // Settings and document workers can report concurrently. serde's writer
    // performs multiple writes, so O_APPEND alone cannot keep records intact.
    static APPEND_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let mut line = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    line.push(b'\n');
    let _guard = APPEND_LOCK.lock().map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(&line).map_err(|e| e.to_string())
}
#[cfg(not(feature = "diagnostics"))]
pub fn record(_app: &AppHandle, _value: serde_json::Value) -> Result<(), String> {
    Err("Local open profiling is disabled in this build.".into())
}

pub fn measure<T>(app: &AppHandle, path: &str, stage: &str, operation: impl FnOnce() -> T) -> T {
    #[cfg(feature = "diagnostics")]
    {
        let _ = path;
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
            serde_json::json!({ "kind": "native", "stage": stage, "epochMs": epoch_ms, "ms": ms }),
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
pub async fn record_open_profile(app: AppHandle, record: serde_json::Value) -> Result<(), String> {
    crate::disk_job::run(crate::disk_job::Lane::Settings, move || {
        self::record(&app, record)
    })
    .await
}

#[cfg(all(test, feature = "diagnostics"))]
mod tests {
    use super::*;
    use std::{collections::HashSet, sync::Arc};

    #[test]
    fn concurrent_records_remain_complete_distinct_json_lines() {
        let path = std::env::temp_dir().join(format!(
            "milo-profile-{}-{}.jsonl",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let barrier = Arc::new(std::sync::Barrier::new(8));
        let workers: Vec<_> = (0..8)
            .map(|worker| {
                let path = path.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    for sequence in 0..80 {
                        append_record(
                            &path,
                            &serde_json::json!({"worker": worker, "sequence": sequence}),
                        )
                        .unwrap();
                    }
                })
            })
            .collect();
        for worker in workers {
            worker.join().unwrap();
        }
        let text = std::fs::read_to_string(&path).unwrap();
        std::fs::remove_file(path).unwrap();
        let records: Vec<serde_json::Value> = text
            .lines()
            .map(|line| serde_json::from_str(line).expect("interleaved diagnostic record"))
            .collect();
        assert_eq!(records.len(), 640);
        let identities: HashSet<_> = records
            .iter()
            .map(|value| {
                (
                    value["worker"].as_u64().unwrap(),
                    value["sequence"].as_u64().unwrap(),
                )
            })
            .collect();
        assert_eq!(identities.len(), 640);
    }
}
