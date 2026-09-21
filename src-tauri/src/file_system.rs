use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LineEnding {
    Lf,
    Crlf,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownWriteRequest {
    path: String,
    markdown: String,
    line_ending: LineEnding,
    has_bom: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeMarkdownWriteRequest {
    path: String,
    markdown: String,
    line_ending: LineEnding,
    has_bom: bool,
    expected_markdown: Option<String>,
    expected_line_ending: Option<LineEnding>,
    expected_has_bom: Option<bool>,
    failure_point: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownDocument {
    path: String,
    markdown: String,
    line_ending: LineEnding,
    has_bom: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownTreeNode {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
    pub children: Vec<MarkdownTreeNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAssetRequest {
    document_path: String,
    bytes: Vec<u8>,
    mime_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAsset {
    pub path: String,
    pub relative_path: String,
}

#[tauri::command]
pub fn browse_markdown_folder(path: String) -> Result<MarkdownTreeNode, String> {
    let root = PathBuf::from(path);
    if !root.is_dir() {
        return Err("Milo can only browse an available folder.".to_owned());
    }
    read_markdown_tree(&root)
}

#[tauri::command]
pub fn write_image_asset(request: ImageAssetRequest) -> Result<ImageAsset, String> {
    let document_path = markdown_path(request.document_path)?;
    let parent = document_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| "Could not determine where to store this image asset.".to_owned())?;
    let extension = image_extension(&request.mime_type)?;
    let assets_directory = parent.join("assets");
    fs::create_dir_all(&assets_directory)
        .map_err(|error| format!("Could not create the image assets folder: {error}"))?;
    let (asset_path, mut asset_file) = create_image_asset_file(&assets_directory, extension)?;

    let result = (|| -> Result<(), String> {
        asset_file
            .write_all(&request.bytes)
            .map_err(|error| format!("Could not write image asset: {error}"))?;
        asset_file
            .sync_all()
            .map_err(|error| format!("Could not finish writing image asset: {error}"))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&asset_path);
    }
    result?;

    Ok(ImageAsset {
        path: asset_path.to_string_lossy().into_owned(),
        relative_path: format!(
            "assets/{}",
            asset_path.file_name().unwrap_or_default().to_string_lossy()
        ),
    })
}

#[tauri::command]
pub fn read_markdown_document(path: String) -> Result<MarkdownDocument, String> {
    let path = markdown_path(path)?;
    let bytes =
        fs::read(&path).map_err(|error| format!("Could not read Markdown file: {error}"))?;
    let (markdown, has_bom, line_ending) = decode_markdown(&bytes)?;

    Ok(MarkdownDocument {
        path: path.to_string_lossy().into_owned(),
        markdown,
        line_ending,
        has_bom,
    })
}

#[tauri::command]
pub fn write_markdown_document(request: MarkdownWriteRequest) -> Result<MarkdownDocument, String> {
    let path = markdown_path(request.path)?;
    let bytes = encode_markdown(&request.markdown, request.line_ending, request.has_bom);

    write_atomically(&path, &bytes)?;

    Ok(MarkdownDocument {
        path: path.to_string_lossy().into_owned(),
        markdown: request.markdown,
        line_ending: request.line_ending,
        has_bom: request.has_bom,
    })
}

/// Production macOS writer. It never falls back to inode-replacing atomic
/// rename: failures are surfaced so recovery semantics remain unambiguous.
#[tauri::command]
pub fn write_markdown_document_safe_v2(
    request: SafeMarkdownWriteRequest,
) -> Result<MarkdownDocument, String> {
    #[cfg(target_os = "macos")]
    {
        let path = markdown_path(request.path)?;
        let new_bytes = encode_markdown(&request.markdown, request.line_ending, request.has_bom);
        let expected_bytes = match (
            request.expected_markdown.as_deref(),
            request.expected_line_ending,
            request.expected_has_bom,
        ) {
            (Some(markdown), Some(line_ending), Some(has_bom)) => {
                Some(encode_markdown(markdown, line_ending, has_bom))
            }
            (None, None, None) => None,
            _ => return Err("Safe Save received an incomplete expected disk version.".to_owned()),
        };
        let failure = match request.failure_point.as_deref() {
            #[cfg(debug_assertions)]
            Some(point) => Some(crate::macos_safe_save::FailurePoint::parse(point)?),
            #[cfg(not(debug_assertions))]
            Some(_) => {
                return Err("Safe Save failure injection is unavailable in production.".to_owned())
            }
            None => None,
        };

        if let Some(expected_bytes) = expected_bytes {
            crate::macos_safe_save::save_inode_preserving_if_unchanged(
                &path,
                &new_bytes,
                &expected_bytes,
                failure,
            )?;
        } else {
            if failure.is_some() {
                return Err("Safe Save failure injection requires an existing target.".to_owned());
            }
            match fs::symlink_metadata(&path) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    // New documents have no inode to preserve. This is an
                    // explicit creation path, never a fallback after a Safe
                    // Save failure.
                    write_atomically(&path, &new_bytes)?;
                }
                Ok(_) => {
                    return Err(
                        "Safe Save refuses to overwrite an existing target without its expected disk version."
                            .to_owned(),
                    )
                }
                Err(error) => {
                    return Err(format!("Could not inspect the Safe Save target: {error}"))
                }
            }
        }

        return Ok(MarkdownDocument {
            path: path.to_string_lossy().into_owned(),
            markdown: request.markdown,
            line_ending: request.line_ending,
            has_bom: request.has_bom,
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        Err("macOS Safe Save V2 is only available on macOS.".to_owned())
    }
}

#[tauri::command]
pub fn recover_markdown_document_safe_v2(path: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let path = markdown_path(path)?;
        let outcome = crate::macos_safe_save::recover_inode_preserving(&path)
            .map_err(classify_safe_save_recovery_error)?;
        return Ok(format!("{outcome:?}"));
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("macOS Safe Save V2 recovery is only available on macOS.".to_owned())
    }
}

#[cfg(target_os = "macos")]
fn classify_safe_save_recovery_error(detail: String) -> String {
    let category = if detail.contains("marker is invalid") {
        "corrupt-marker"
    } else if detail.contains("backup without a recovery marker") {
        "orphan-backup"
    } else if detail.contains("backup is corrupt") || detail.contains("no complete verified backup")
    {
        "backup-sha-mismatch"
    } else if detail.contains("identity changed") {
        "target-identity-mismatch"
    } else if detail.contains("conflicting recovery artifacts") || detail.contains("sidecar") {
        "conflicting-sidecars"
    } else {
        "ambiguous-recovery"
    };

    format!("SAFE_SAVE_RECOVERY_BLOCKED[{category}]: {detail}")
}

#[cfg(all(test, target_os = "macos"))]
mod safe_save_recovery_error_tests {
    use super::classify_safe_save_recovery_error;

    #[test]
    fn classifies_recovery_states_for_actionable_user_errors() {
        let cases = [
            ("Safe Save recovery marker is invalid", "corrupt-marker"),
            (
                "Safe Save found a backup without a recovery marker",
                "orphan-backup",
            ),
            (
                "Safe Save target matches the new SHA but its backup is corrupt",
                "backup-sha-mismatch",
            ),
            (
                "Safe Save recovery target identity changed",
                "target-identity-mismatch",
            ),
            (
                "Safe Save found conflicting recovery artifacts",
                "conflicting-sidecars",
            ),
            ("Safe Save target is missing", "ambiguous-recovery"),
        ];

        for (detail, category) in cases {
            assert_eq!(
                classify_safe_save_recovery_error(detail.to_owned()),
                format!("SAFE_SAVE_RECOVERY_BLOCKED[{category}]: {detail}"),
            );
        }
    }
}

fn markdown_path(path: String) -> Result<PathBuf, String> {
    let path = PathBuf::from(path);
    let extension = path.extension().and_then(|extension| extension.to_str());

    if matches!(extension, Some(extension) if extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown"))
    {
        Ok(path)
    } else {
        Err("Milo can only open or save .md and .markdown files.".to_owned())
    }
}

fn read_markdown_tree(path: &Path) -> Result<MarkdownTreeNode, String> {
    let mut children = Vec::new();
    let entries =
        fs::read_dir(path).map_err(|error| format!("Could not read this folder: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Could not read a folder entry: {error}"))?;
        let entry_path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Could not inspect a folder entry: {error}"))?;
        if file_type.is_dir() {
            let directory = read_markdown_tree(&entry_path)?;
            if !directory.children.is_empty() {
                children.push(directory);
            }
        } else if file_type.is_file() && is_markdown_path(&entry_path) {
            children.push(MarkdownTreeNode {
                path: entry_path.to_string_lossy().into_owned(),
                name: entry.file_name().to_string_lossy().into_owned(),
                is_directory: false,
                children: Vec::new(),
            });
        }
    }
    children.sort_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(MarkdownTreeNode {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into_owned(),
        is_directory: true,
        children,
    })
}

fn is_markdown_path(path: &Path) -> bool {
    matches!(path.extension().and_then(|extension| extension.to_str()), Some(extension) if extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown"))
}

fn image_extension(mime_type: &str) -> Result<&'static str, String> {
    match mime_type {
        "image/png" => Ok("png"),
        "image/jpeg" => Ok("jpg"),
        "image/gif" => Ok("gif"),
        "image/webp" => Ok("webp"),
        _ => Err("Milo can paste PNG, JPEG, GIF, and WebP images.".to_owned()),
    }
}

fn create_image_asset_file(directory: &Path, extension: &str) -> Result<(PathBuf, File), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    for suffix in 0..256 {
        let name = if suffix == 0 {
            format!("image-{timestamp}.{extension}")
        } else {
            format!("image-{timestamp}-{suffix}.{extension}")
        };
        let path = directory.join(name);
        match OpenOptions::new().create_new(true).write(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not create image asset: {error}")),
        }
    }
    Err("Could not find an available image asset name.".to_owned())
}

fn decode_markdown(bytes: &[u8]) -> Result<(String, bool, LineEnding), String> {
    const UTF8_BOM: &[u8] = &[0xEF, 0xBB, 0xBF];

    let has_bom = bytes.starts_with(UTF8_BOM);
    let text = if has_bom {
        &bytes[UTF8_BOM.len()..]
    } else {
        bytes
    };
    let markdown = std::str::from_utf8(text)
        .map_err(|_| "Milo can only edit UTF-8 Markdown files.".to_owned())?
        .to_owned();
    let line_ending = if markdown.contains("\r\n") {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    };

    Ok((markdown, has_bom, line_ending))
}

fn encode_markdown(markdown: &str, line_ending: LineEnding, has_bom: bool) -> Vec<u8> {
    let normalized = markdown.replace("\r\n", "\n").replace('\r', "\n");
    let serialized = match line_ending {
        LineEnding::Lf => normalized,
        LineEnding::Crlf => normalized.replace('\n', "\r\n"),
    };
    let mut bytes = Vec::with_capacity(serialized.len() + usize::from(has_bom) * 3);

    if has_bom {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }

    bytes.extend_from_slice(serialized.as_bytes());
    bytes
}

fn write_atomically(destination: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = destination
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "Could not determine where to save this Markdown file.".to_owned())?;
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Could not determine a valid Markdown file name.".to_owned())?;
    let original_permissions = fs::metadata(destination)
        .ok()
        .map(|metadata| metadata.permissions());
    let (temporary_path, mut temporary_file) = create_temporary_file(parent, file_name)?;

    let result = (|| -> Result<(), String> {
        temporary_file
            .write_all(contents)
            .map_err(|error| format!("Could not write Markdown file: {error}"))?;
        temporary_file
            .sync_all()
            .map_err(|error| format!("Could not finish writing Markdown file: {error}"))?;
        drop(temporary_file);

        if let Some(permissions) = original_permissions {
            fs::set_permissions(&temporary_path, permissions).map_err(|error| {
                format!("Could not preserve Markdown file permissions: {error}")
            })?;
        }

        fs::rename(&temporary_path, destination)
            .map_err(|error| format!("Could not replace Markdown file safely: {error}"))
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary_path);
    }

    result
}

fn create_temporary_file(parent: &Path, file_name: &str) -> Result<(PathBuf, File), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();

    for attempt in 0..32 {
        let temporary_path = parent.join(format!(
            ".{file_name}.milo-{}-{timestamp}-{attempt}.tmp",
            std::process::id()
        ));

        match OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary_path)
        {
            Ok(file) => return Ok((temporary_path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Could not prepare a safe Markdown save: {error}")),
        }
    }

    Err("Could not prepare a unique temporary Markdown file.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::{
        create_image_asset_file, decode_markdown, encode_markdown, image_extension,
        read_markdown_tree, write_atomically, write_image_asset, ImageAssetRequest, LineEnding,
    };
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn recognizes_utf8_bom_and_crlf() {
        let (markdown, has_bom, line_ending) =
            decode_markdown(b"\xEF\xBB\xBF# Title\r\n\r\nText\r\n").unwrap();

        assert_eq!(markdown, "# Title\r\n\r\nText\r\n");
        assert!(has_bom);
        assert!(matches!(line_ending, LineEnding::Crlf));
    }

    #[test]
    fn serializes_the_requested_line_ending_and_bom() {
        assert_eq!(
            encode_markdown("# Title\nText", LineEnding::Crlf, true),
            b"\xEF\xBB\xBF# Title\r\nText"
        );
    }

    #[test]
    fn rejects_non_utf8_content() {
        assert!(decode_markdown(&[0xFF, 0xFE]).is_err());
    }

    #[test]
    fn atomically_replaces_an_existing_file() {
        let directory = std::env::temp_dir().join(format!(
            "milo-atomic-save-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let destination = directory.join("note.md");
        fs::write(&destination, "Before").unwrap();

        write_atomically(&destination, b"After").unwrap();

        assert_eq!(fs::read_to_string(&destination).unwrap(), "After");
        fs::remove_dir_all(&directory).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn production_safe_save_creates_new_files_but_never_falls_back_over_existing_files() {
        use super::{write_markdown_document_safe_v2, SafeMarkdownWriteRequest};
        use std::os::unix::fs::MetadataExt;

        let directory = std::env::temp_dir().join(format!(
            "milo-production-safe-save-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let destination = directory.join("note.md");
        let request = |markdown: &str, expected: Option<&str>| SafeMarkdownWriteRequest {
            path: destination.to_string_lossy().into_owned(),
            markdown: markdown.to_owned(),
            line_ending: LineEnding::Lf,
            has_bom: false,
            expected_markdown: expected.map(str::to_owned),
            expected_line_ending: expected.map(|_| LineEnding::Lf),
            expected_has_bom: expected.map(|_| false),
            failure_point: None,
        };

        write_markdown_document_safe_v2(request("# Created\n", None)).unwrap();
        let inode = fs::metadata(&destination).unwrap().ino();
        let error =
            write_markdown_document_safe_v2(request("# Must not replace\n", None)).unwrap_err();
        assert!(error.contains("refuses to overwrite an existing target"));
        assert_eq!(fs::read_to_string(&destination).unwrap(), "# Created\n");

        write_markdown_document_safe_v2(request("# Updated\n", Some("# Created\n"))).unwrap();
        assert_eq!(fs::read_to_string(&destination).unwrap(), "# Updated\n");
        assert_eq!(fs::metadata(&destination).unwrap().ino(), inode);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn recursively_lists_directories_and_markdown_files_only() {
        let directory = std::env::temp_dir().join(format!(
            "milo-folder-tree-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(directory.join("nested")).unwrap();
        fs::create_dir_all(directory.join("assets")).unwrap();
        fs::write(directory.join("note.md"), "# Note").unwrap();
        fs::write(directory.join("nested/plan.markdown"), "# Plan").unwrap();
        fs::write(directory.join("assets/image.png"), "not an image").unwrap();
        fs::write(directory.join("readme.txt"), "not markdown").unwrap();

        let tree = read_markdown_tree(&directory).unwrap();

        assert_eq!(tree.children.len(), 2);
        assert!(tree.children.iter().any(|child| child.name == "note.md"));
        let nested = tree
            .children
            .iter()
            .find(|child| child.name == "nested")
            .unwrap();
        assert_eq!(nested.children.len(), 1);
        assert_eq!(nested.children[0].name, "plan.markdown");
        assert!(!tree.children.iter().any(|child| child.name == "assets"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn creates_collision_safe_image_asset_names() {
        let directory = std::env::temp_dir().join(format!(
            "milo-image-assets-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let (first_path, _) = create_image_asset_file(&directory, "png").unwrap();
        let (second_path, _) = create_image_asset_file(&directory, "png").unwrap();

        assert_ne!(first_path, second_path);
        assert_eq!(image_extension("image/jpeg").unwrap(), "jpg");
        assert!(image_extension("image/svg+xml").is_err());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn writes_image_assets_beside_the_markdown_document() {
        let directory = std::env::temp_dir().join(format!(
            "milo-image-write-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let document = directory.join("note.md");
        fs::write(&document, "# Note").unwrap();

        let asset = write_image_asset(ImageAssetRequest {
            document_path: document.to_string_lossy().into_owned(),
            bytes: vec![137, 80, 78, 71],
            mime_type: "image/png".to_owned(),
        })
        .unwrap();

        assert!(asset.relative_path.starts_with("assets/image-"));
        assert_eq!(fs::read(&asset.path).unwrap(), vec![137, 80, 78, 71]);
        assert!(write_image_asset(ImageAssetRequest {
            document_path: document.to_string_lossy().into_owned(),
            bytes: vec![1],
            mime_type: "image/svg+xml".to_owned(),
        })
        .is_err());
        fs::remove_dir_all(directory).unwrap();
    }
}
