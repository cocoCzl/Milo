//! Independent recovery copies for never-saved documents, not document storage.
use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Deserialize, Serialize)]
pub struct Draft {
    id: String,
    markdown: String,
}

fn draft_path(directory: &std::path::Path, id: &str) -> Result<PathBuf, String> {
    if id.len() != 36 || !id.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
        return Err("Invalid recovery identifier.".to_owned());
    }
    Ok(directory.join(format!("{id}.json")))
}

fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("unsaved-recovery-v1"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_draft_recovery(
    app: AppHandle,
    id: String,
    markdown: Option<String>,
) -> Result<(), String> {
    let directory = directory(&app)?;
    let path = draft_path(&directory, &id)?;
    if let Some(markdown) = markdown {
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let bytes = serde_json::to_vec(&Draft { id, markdown }).map_err(|e| e.to_string())?;
        crate::file_system::write_atomically(&path, &bytes)
    } else {
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[tauri::command]
pub fn read_draft_recovery(app: AppHandle) -> Result<Vec<Draft>, String> {
    let directory = directory(&app)?;
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut drafts = Vec::new();
    for entry in fs::read_dir(&directory).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let draft: Draft = serde_json::from_slice(
            &fs::read(entry.path()).map_err(|e| e.to_string())?,
        )
        .map_err(|e| {
            format!(
                "Could not read recovery copy {}: {e}",
                entry.path().display()
            )
        })?;
        if draft_path(&directory, &draft.id)? == entry.path() {
            drafts.push(draft);
        }
    }
    Ok(drafts)
}

#[cfg(test)]
mod tests {
    #[test]
    fn recovery_identifiers_cannot_escape_the_directory() {
        let directory = std::path::Path::new("/tmp/milo-recovery");
        assert!(super::draft_path(directory, "../../note.md").is_err());
        assert_eq!(
            super::draft_path(directory, "12345678-1234-1234-1234-123456789abc").unwrap(),
            directory.join("12345678-1234-1234-1234-123456789abc.json")
        );
    }
}
