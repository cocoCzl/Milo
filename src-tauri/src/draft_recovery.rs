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

#[derive(Default, Serialize)]
pub struct RecoveryCopies {
    drafts: Vec<Draft>,
    errors: Vec<String>,
}

fn read_copies(directory: &std::path::Path) -> Result<RecoveryCopies, String> {
    let mut copies = RecoveryCopies::default();
    if !directory.exists() {
        return Ok(copies);
    }
    for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let path = match entry {
            Ok(entry) => entry.path(),
            Err(error) => {
                copies.errors.push(error.to_string());
                continue;
            }
        };
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let read = || -> Result<Draft, String> {
            let draft: Draft = serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            if draft_path(directory, &draft.id)? != path {
                return Err("Recovery identifier does not match its file.".into());
            }
            Ok(draft)
        };
        match read() {
            Ok(draft) => copies.drafts.push(draft),
            Err(error) => copies.errors.push(format!(
                "Could not read recovery copy {}: {error}",
                path.display()
            )),
        }
    }
    Ok(copies)
}

#[tauri::command]
pub fn read_draft_recovery(app: AppHandle) -> Result<RecoveryCopies, String> {
    read_copies(&directory(&app)?)
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_damaged_copy_does_not_block_other_unsaved_documents() {
        let directory = std::env::temp_dir().join(format!(
            "milo-draft-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let id = "12345678-1234-1234-1234-123456789abc";
        let path = super::draft_path(&directory, id).unwrap();
        let bytes = serde_json::to_vec(&super::Draft {
            id: id.into(),
            markdown: "# 已确认\n".into(),
        })
        .unwrap();
        crate::file_system::write_atomically(&path, &bytes).unwrap();
        std::fs::write(directory.join("broken.json"), b"{").unwrap();
        let recovered = super::read_copies(&directory).unwrap();
        assert_eq!(recovered.drafts.len(), 1);
        assert_eq!(recovered.drafts[0].markdown, "# 已确认\n");
        assert_eq!(recovered.errors.len(), 1);
        assert!(directory.join("broken.json").exists()); // preserve for diagnosis
        std::fs::remove_dir_all(directory).unwrap();
    }

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
