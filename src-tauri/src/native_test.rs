//! Explicit acceptance-build gate, never compiled into normal distributions.
//! Pause the ordered blocking worker before a complete real save transaction.
//! No document content or path is exposed and timeout fails without writing.
use std::{
    fs,
    path::Path,
    time::{Duration, Instant},
};

pub fn before_save() -> Result<(), String> {
    let Some(directory) = option_env!("MILO_NATIVE_TEST_DIR") else {
        return Ok(());
    };
    pause(Path::new(directory))
}

fn pause(directory: &Path) -> Result<(), String> {
    if !directory.is_absolute() || !directory.starts_with("/private/tmp") {
        return Err("Native test gate must be inside /private/tmp.".into());
    }
    let arm = directory.join("arm-save");
    match fs::remove_file(arm) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not consume native test gate: {error}")),
        Ok(()) => {}
    }
    let token = format!(
        "{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    );
    let waiting = directory.join("save-waiting.json");
    let release = directory.join(format!("release-{token}"));
    fs::write(
        &waiting,
        serde_json::to_vec(&serde_json::json!({"pid":std::process::id(),"token":token})).unwrap(),
    )
    .map_err(|e| e.to_string())?;
    let start = Instant::now();
    let result = loop {
        match fs::remove_file(&release) {
            Ok(()) => break Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => break Err(format!("Could not release native test save: {error}")),
        }
        if start.elapsed() >= Duration::from_secs(300) {
            break Err("Native test save gate timed out without writing.".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    let _ = fs::remove_file(waiting);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_gate_reports_ownership_and_releases_once() {
        let directory = Path::new("/private/tmp").join(format!(
            "milo-gate-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        pause(&directory).unwrap(); // Unarmed builds do not wait.
        fs::write(directory.join("arm-save"), "").unwrap();
        let worker_directory = directory.clone();
        let worker = std::thread::spawn(move || pause(&worker_directory));
        let started = Instant::now();
        let waiting = loop {
            if let Ok(bytes) = fs::read(directory.join("save-waiting.json")) {
                if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    break value;
                }
            }
            assert!(
                started.elapsed() < Duration::from_secs(5),
                "gate did not publish its state"
            );
            std::thread::yield_now();
        };
        assert_eq!(waiting["pid"], std::process::id());
        assert!(!worker.is_finished());
        assert!(!directory.join("arm-save").exists());
        fs::write(
            directory.join(format!("release-{}", waiting["token"].as_str().unwrap())),
            "",
        )
        .unwrap();
        worker.join().unwrap().unwrap();
        assert!(!directory.join("save-waiting.json").exists());
        pause(&directory).unwrap();
        fs::remove_dir_all(directory).unwrap();
    }
}
