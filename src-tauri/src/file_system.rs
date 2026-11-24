use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tauri_plugin_fs::FsExt;

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownTreeNode {
    pub path: String,
    pub name: String,
    pub is_directory: bool,
    pub children: Vec<MarkdownTreeNode>,
    pub next_offset: Option<usize>,
    pub snapshot_id: Option<String>,
    pub directory_version: Option<String>,
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
pub async fn browse_markdown_folder(
    path: String,
    excluded_names: Option<Vec<String>>,
    offset: Option<usize>,
    snapshot_id: Option<String>,
) -> Result<MarkdownTreeNode, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(path);
        let excluded = excluded_names
            .unwrap_or_else(|| DEFAULT_EXCLUDED.iter().map(|s| (*s).to_owned()).collect());
        read_markdown_directory(
            &root,
            &excluded,
            offset.unwrap_or(0),
            snapshot_id.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn validate_markdown_directory(path: String, version: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        directory_modified(Path::new(&path)).map(|modified| directory_version(modified) == version)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn directory_version(modified: SystemTime) -> String {
    match modified.duration_since(UNIX_EPOCH) {
        Ok(time) => format!("{}:{}", time.as_secs(), time.subsec_nanos()),
        Err(error) => format!(
            "-{}:{}",
            error.duration().as_secs(),
            error.duration().subsec_nanos()
        ),
    }
}

const DEFAULT_EXCLUDED: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".cache",
    ".venv",
    "vendor",
];
const DIRECTORY_PAGE_SIZE: usize = 200;

#[tauri::command]
pub async fn write_image_asset(
    app: AppHandle,
    request: ImageAssetRequest,
) -> Result<ImageAsset, String> {
    crate::disk_job::run(crate::disk_job::Lane::Documents, move || {
        let document_path = markdown_path(request.document_path.clone())?;
        allow_document_directory(&app, &document_path)?;
        write_image_asset_impl(request)
    })
    .await
}

#[tauri::command]
pub async fn write_image_asset_binary(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<ImageAsset, String> {
    let document_path = request
        .headers()
        .get("x-milo-document")
        .and_then(|h| h.to_str().ok())
        .ok_or("Missing image document")?
        .to_owned();
    let document_path: String = serde_json::from_str(&document_path).map_err(|e| e.to_string())?;
    let mime_type = request
        .headers()
        .get("x-milo-mime")
        .and_then(|h| h.to_str().ok())
        .ok_or("Missing image type")?
        .to_owned();
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("Expected binary image bytes".into()),
    };
    crate::disk_job::run(crate::disk_job::Lane::Documents, move || {
        let path = markdown_path(document_path.clone())?;
        allow_document_directory(&app, &path)?;
        write_image_asset_impl(ImageAssetRequest {
            document_path,
            mime_type,
            bytes,
        })
    })
    .await
}

fn write_image_asset_impl(request: ImageAssetRequest) -> Result<ImageAsset, String> {
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
pub async fn read_markdown_document(
    app: AppHandle,
    path: String,
) -> Result<MarkdownDocument, String> {
    crate::disk_job::run(crate::disk_job::Lane::Documents, move || {
        crate::open_profile::measure(&app, &path, "read+scope+decode", || {
            let path = markdown_path(path.clone())?;
            allow_document_directory(&app, &path)?;
            read_markdown_document_impl(path)
        })
    })
    .await
}

fn read_markdown_document_impl(path: PathBuf) -> Result<MarkdownDocument, String> {
    let path = fs::canonicalize(&path)
        .map_err(|error| format!("Could not resolve Markdown file: {error}"))?;
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
pub async fn write_markdown_document(
    app: AppHandle,
    request: MarkdownWriteRequest,
) -> Result<MarkdownDocument, String> {
    crate::disk_job::run(crate::disk_job::Lane::Documents, move || {
        let path = markdown_path(request.path.clone())?;
        allow_document_directory(&app, &path)?;
        write_markdown_document_impl(path, request)
    })
    .await
}

fn write_markdown_document_impl(
    path: PathBuf,
    request: MarkdownWriteRequest,
) -> Result<MarkdownDocument, String> {
    let bytes = encode_markdown(&request.markdown, request.line_ending, request.has_bom);

    write_atomically(&path, &bytes)?;

    // Save dialogs can return /tmp while reads resolve /private/tmp (and
    // similarly for symlinked parent directories). Publish one file identity
    // only after creation, so opening the saved file reuses its existing tab.
    let path = fs::canonicalize(&path)
        .map_err(|error| format!("Could not resolve saved Markdown file: {error}"))?;

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
pub async fn write_markdown_document_safe_v2(
    app: AppHandle,
    request: SafeMarkdownWriteRequest,
) -> Result<MarkdownDocument, String> {
    crate::disk_job::run(crate::disk_job::Lane::Documents, move || {
        #[cfg(target_os = "macos")]
        {
            let path = markdown_path(request.path.clone())?;
            allow_document_directory(&app, &path)?;
        }
        #[cfg(feature = "native-test")]
        crate::native_test::before_save()?;
        let profile_path = request.path.clone();
        crate::open_profile::measure(&app, &profile_path, "safe-save-transaction", || {
            write_markdown_document_safe_v2_impl(request)
        })
    })
    .await
}

fn write_markdown_document_safe_v2_impl(
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

        let path = fs::canonicalize(&path)
            .map_err(|error| format!("Could not resolve saved Markdown file: {error}"))?;
        Ok(MarkdownDocument {
            path: path.to_string_lossy().into_owned(),
            markdown: request.markdown,
            line_ending: request.line_ending,
            has_bom: request.has_bom,
        })
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = request;
        Err("macOS Safe Save V2 is only available on macOS.".to_owned())
    }
}

#[tauri::command]
pub async fn recover_markdown_document_safe_v2(
    app: AppHandle,
    path: String,
) -> Result<String, String> {
    crate::disk_job::run(crate::disk_job::Lane::Documents, move || {
        crate::open_profile::measure(&app, &path, "safe-save-recovery", || {
            recover_markdown_impl(path.clone())
        })
    })
    .await
}

fn recover_markdown_impl(path: String) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let path = markdown_path(path)?;
        let outcome = crate::macos_safe_save::recover_inode_preserving(&path)
            .map_err(classify_safe_save_recovery_error)?;
        Ok(format!("{outcome:?}"))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("macOS Safe Save V2 recovery is only available on macOS.".to_owned())
    }
}

fn allow_document_directory(app: &AppHandle, document_path: &Path) -> Result<(), String> {
    let directory = document_path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .ok_or_else(|| "Could not determine the Markdown document directory.".to_owned())?;

    app.asset_protocol_scope()
        .allow_directory(directory, true)
        .map_err(|error| format!("Could not authorize document assets: {error}"))?;
    app.fs_scope()
        .allow_directory(directory, true)
        .map_err(|error| format!("Could not authorize document watching: {error}"))
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

struct DirectoryEntry {
    path: String,
    name: String,
    lower_name: String,
    is_directory: bool,
}
struct DirectorySnapshot {
    path: PathBuf,
    excluded: Vec<String>,
    modified: SystemTime,
    used: std::time::Instant,
    bytes: usize,
    children: Vec<DirectoryEntry>,
}
type DirectoryCache = std::collections::HashMap<String, DirectorySnapshot>;
const DIRECTORY_CACHE_BYTES: usize = 16 * 1024 * 1024;
const DIRECTORY_SCAN_BYTES: usize = 8 * 1024 * 1024;
const DIRECTORY_SCAN_ENTRIES: usize = 100_000;
const DIRECTORY_SNAPSHOT_STALE: &str =
    "DIRECTORY_SNAPSHOT_STALE: Folder changed or paging expired. Refresh this folder.";
fn directory_cache() -> &'static std::sync::Mutex<DirectoryCache> {
    static CACHE: std::sync::OnceLock<std::sync::Mutex<DirectoryCache>> =
        std::sync::OnceLock::new();
    CACHE.get_or_init(|| std::sync::Mutex::new(DirectoryCache::new()))
}

fn read_markdown_directory(
    path: &Path,
    excluded: &[String],
    offset: usize,
    snapshot_id: Option<&str>,
) -> Result<MarkdownTreeNode, String> {
    read_directory_with_cache(path, excluded, offset, snapshot_id, directory_cache())
}

fn read_directory_with_cache(
    path: &Path,
    excluded: &[String],
    offset: usize,
    snapshot_id: Option<&str>,
    cache: &std::sync::Mutex<DirectoryCache>,
) -> Result<MarkdownTreeNode, String> {
    let modified = directory_modified(path)?;
    if offset > 0 {
        let id = snapshot_id.ok_or(DIRECTORY_SNAPSHOT_STALE)?;
        let mut cache = cache.lock().map_err(|e| e.to_string())?;
        let snapshot = cache.get_mut(id).ok_or(DIRECTORY_SNAPSHOT_STALE)?;
        if snapshot.path != path
            || snapshot.excluded != excluded
            || snapshot.modified != modified
            || snapshot.used.elapsed() >= std::time::Duration::from_secs(30)
            || offset % DIRECTORY_PAGE_SIZE != 0
            || offset >= snapshot.children.len()
        {
            return Err(DIRECTORY_SNAPSHOT_STALE.into());
        }
        snapshot.used = std::time::Instant::now();
        return Ok(directory_page(
            path,
            &snapshot.children,
            offset,
            Some(id),
            snapshot.modified,
        ));
    }
    // Serialize scans only, independently of save/settings lanes. Cache hits do
    // not take this guard; at most one bounded sort workspace is live at once.
    static SCAN: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _scan = SCAN.lock().map_err(|e| e.to_string())?;
    let mut children = Vec::new();
    let mut bytes = path.as_os_str().len() + excluded.iter().map(|s| s.len()).sum::<usize>() + 256;
    let entries = fs::read_dir(path).map_err(|e| format!("Could not read this folder: {e}"))?;
    for (index, entry) in entries.enumerate() {
        if index >= DIRECTORY_SCAN_ENTRIES {
            return Err(
                "DIRECTORY_ENTRY_LIMIT: Folder exceeds the 100,000-entry browsing limit. Open a smaller subfolder.".into(),
            );
        }
        let entry = entry.map_err(|e| format!("Could not read a folder entry: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Could not inspect a folder entry: {e}"))?;
        let entry_path = entry.path();
        if file_type.is_dir() {
            if excluded
                .iter()
                .any(|name| entry.file_name() == std::ffi::OsStr::new(name))
            {
                continue;
            }
        } else if !file_type.is_file() || !is_markdown_path(&entry_path) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let child = DirectoryEntry {
            path: entry_path.to_string_lossy().into_owned(),
            lower_name: name.to_lowercase(),
            name,
            is_directory: file_type.is_dir(),
        };
        // Includes all retained strings, entry storage and conservative Vec slack.
        bytes += 2 * std::mem::size_of::<DirectoryEntry>()
            + child.path.capacity()
            + child.name.capacity()
            + child.lower_name.capacity();
        if bytes > DIRECTORY_SCAN_BYTES {
            return Err(
                "DIRECTORY_BYTE_LIMIT: Folder exceeds the 8 MiB browsing snapshot limit. Open a smaller subfolder."
                    .into(),
            );
        }
        children.push(child);
    }
    children.sort_unstable_by(|left, right| {
        right
            .is_directory
            .cmp(&left.is_directory)
            .then_with(|| left.lower_name.cmp(&right.lower_name))
            .then_with(|| left.name.cmp(&right.name))
    });
    if directory_modified(path)? != modified {
        return Err(DIRECTORY_SNAPSHOT_STALE.into());
    }
    static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    let id = NEXT_ID
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        .to_string();
    let result = directory_page(path, &children, 0, Some(&id), modified);
    let mut cache = cache.lock().map_err(|e| e.to_string())?;
    insert_directory_snapshot(
        &mut cache,
        id,
        DirectorySnapshot {
            path: path.to_owned(),
            excluded: excluded.to_vec(),
            modified,
            used: std::time::Instant::now(),
            bytes,
            children,
        },
    );
    Ok(result)
}

fn insert_directory_snapshot(cache: &mut DirectoryCache, id: String, snapshot: DirectorySnapshot) {
    cache.retain(|_, snapshot| snapshot.used.elapsed() < std::time::Duration::from_secs(30));
    while cache.len() >= 8
        || cache.values().map(|s| s.bytes).sum::<usize>() + snapshot.bytes > DIRECTORY_CACHE_BYTES
    {
        let oldest = cache
            .iter()
            .min_by_key(|(_, s)| s.used)
            .map(|(key, _)| key.clone());
        if let Some(oldest) = oldest {
            cache.remove(&oldest);
        } else {
            break;
        }
    }
    cache.insert(id, snapshot);
}

fn directory_modified(path: &Path) -> Result<SystemTime, String> {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .map_err(|e| format!("Could not inspect this folder: {e}"))
}

fn directory_page(
    path: &Path,
    children: &[DirectoryEntry],
    offset: usize,
    snapshot_id: Option<&str>,
    modified: SystemTime,
) -> MarkdownTreeNode {
    MarkdownTreeNode {
        next_offset: (offset + DIRECTORY_PAGE_SIZE < children.len())
            .then_some(offset + DIRECTORY_PAGE_SIZE),
        snapshot_id: snapshot_id.map(str::to_owned),
        directory_version: Some(directory_version(modified)),
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .unwrap_or(path.as_os_str())
            .to_string_lossy()
            .into_owned(),
        is_directory: true,
        children: children
            .iter()
            .skip(offset)
            .take(DIRECTORY_PAGE_SIZE)
            .map(|entry| MarkdownTreeNode {
                path: entry.path.clone(),
                name: entry.name.clone(),
                is_directory: entry.is_directory,
                children: Vec::new(),
                next_offset: None,
                snapshot_id: None,
                directory_version: None,
            })
            .collect(),
    }
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

pub(crate) fn write_atomically(destination: &Path, contents: &[u8]) -> Result<(), String> {
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
        read_markdown_directory, write_atomically, write_image_asset_impl, ImageAssetRequest,
        LineEnding,
    };
    use std::{
        fs::{self, File},
        path::PathBuf,
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
    fn saved_documents_return_the_same_canonical_identity_as_reads() {
        let directory = std::env::temp_dir().join(format!(
            "milo-save-identity-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(directory.join("child")).unwrap();
        let alias = directory.join("child/../note.md");
        let request = super::SafeMarkdownWriteRequest {
            path: alias.to_string_lossy().into_owned(),
            markdown: "# Created\n".into(),
            line_ending: super::LineEnding::Lf,
            has_bom: false,
            expected_markdown: None,
            expected_line_ending: None,
            expected_has_bom: None,
            failure_point: None,
        };
        let saved = super::write_markdown_document_safe_v2_impl(request).unwrap();
        let read = super::read_markdown_document_impl(alias.clone()).unwrap();
        assert_eq!(saved.path, read.path);
        let ordinary = super::write_markdown_document_impl(
            alias.clone(),
            super::MarkdownWriteRequest {
                path: alias.to_string_lossy().into_owned(),
                markdown: "# Updated\n".into(),
                line_ending: super::LineEnding::Lf,
                has_bom: false,
            },
        )
        .unwrap();
        assert_eq!(ordinary.path, read.path);
        assert_eq!(fs::read_to_string(alias).unwrap(), "# Updated\n");
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn production_safe_save_creates_new_files_but_never_falls_back_over_existing_files() {
        use super::{write_markdown_document_safe_v2_impl, SafeMarkdownWriteRequest};
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

        write_markdown_document_safe_v2_impl(request("# Created\n", None)).unwrap();
        let inode = fs::metadata(&destination).unwrap().ino();
        let error = write_markdown_document_safe_v2_impl(request("# Must not replace\n", None))
            .unwrap_err();
        assert!(error.contains("refuses to overwrite an existing target"));
        assert_eq!(fs::read_to_string(&destination).unwrap(), "# Created\n");

        write_markdown_document_safe_v2_impl(request("# Updated\n", Some("# Created\n"))).unwrap();
        assert_eq!(fs::read_to_string(&destination).unwrap(), "# Updated\n");
        assert_eq!(fs::metadata(&destination).unwrap().ino(), inode);
        fs::remove_dir_all(directory).unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn ordered_alias_writes_keep_inode_and_reject_a_stale_expected_revision() {
        use super::{write_markdown_document_safe_v2_impl, SafeMarkdownWriteRequest};
        use crate::disk_job::{run, Lane};
        use std::os::unix::fs::MetadataExt;
        let directory = std::env::temp_dir().join(format!(
            "milo-ordered-save-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(directory.join("child")).unwrap();
        let path = directory.join("note.md");
        fs::write(&path, "old").unwrap();
        let inode = fs::metadata(&path).unwrap().ino();
        let request =
            |target: std::path::PathBuf, text: &str, expected: &str| SafeMarkdownWriteRequest {
                path: target.to_string_lossy().into_owned(),
                markdown: text.into(),
                line_ending: LineEnding::Lf,
                has_bom: false,
                expected_markdown: Some(expected.into()),
                expected_line_ending: Some(LineEnding::Lf),
                expected_has_bom: Some(false),
                failure_point: None,
            };
        let first = request(path.clone(), "new", "old");
        let stale = request(directory.join("child/../note.md"), "stale", "old");
        tauri::async_runtime::block_on(async {
            run(Lane::Documents, move || {
                write_markdown_document_safe_v2_impl(first)
            })
            .await
            .unwrap();
            let failure = run(Lane::Documents, move || {
                write_markdown_document_safe_v2_impl(stale)
            })
            .await
            .unwrap_err();
            assert!(failure.contains("external change conflict"));
        });
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(fs::metadata(&path).unwrap().ino(), inode);
        assert_eq!(
            super::read_markdown_document_impl(directory.join("child/../note.md"))
                .unwrap()
                .path,
            path.canonicalize().unwrap().to_string_lossy()
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn lazily_lists_one_directory_and_excludes_generated_directories() {
        let directory = std::env::temp_dir().join(format!(
            "milo-folder-tree-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(directory.join("nested")).unwrap();
        fs::create_dir_all(directory.join("assets")).unwrap();
        fs::create_dir_all(directory.join("target/deep")).unwrap();
        fs::write(directory.join("note.md"), "# Note").unwrap();
        fs::write(directory.join("nested/plan.markdown"), "# Plan").unwrap();
        fs::write(directory.join("assets/image.png"), "not an image").unwrap();
        fs::write(directory.join("readme.txt"), "not markdown").unwrap();

        let tree = read_markdown_directory(&directory, &["target".into()], 0, None).unwrap();

        assert_eq!(tree.children.len(), 3);
        assert!(tree.children.iter().any(|child| child.name == "note.md"));
        let nested = tree
            .children
            .iter()
            .find(|child| child.name == "nested")
            .unwrap();
        assert!(nested.children.is_empty());
        let nested = read_markdown_directory(&directory.join("nested"), &[], 0, None).unwrap();
        assert_eq!(nested.children[0].name, "plan.markdown");
        assert!(tree.children.iter().any(|child| child.name == "assets"));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn pages_a_large_directory_without_reading_descendants() {
        let directory = std::env::temp_dir().join(format!(
            "milo-paging-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(directory.join("target/deep")).unwrap();
        for index in 0..450 {
            fs::write(directory.join(format!("{index:04}.md")), "# Note").unwrap();
        }
        let excluded = vec!["target".to_owned()];
        let first = read_markdown_directory(&directory, &excluded, 0, None).unwrap();
        assert_eq!(first.children.len(), 200);
        assert_eq!(first.next_offset, Some(200));
        let second = read_markdown_directory(
            &directory,
            &excluded,
            first.next_offset.unwrap(),
            first.snapshot_id.as_deref(),
        )
        .unwrap();
        assert_eq!(second.children[0].name, "0200.md");
        let third = read_markdown_directory(
            &directory,
            &excluded,
            second.next_offset.unwrap(),
            second.snapshot_id.as_deref(),
        )
        .unwrap();
        assert_eq!(third.children.len(), 50);
        assert_eq!(third.next_offset, None);
        fs::write(directory.join("new.md"), "# Added").unwrap();
        // Force a distinct directory mtime even on coarse filesystems.
        let now = SystemTime::now() + std::time::Duration::from_secs(2);
        fs::File::open(&directory)
            .unwrap()
            .set_modified(now)
            .unwrap();
        assert!(
            read_markdown_directory(&directory, &excluded, 200, first.snapshot_id.as_deref())
                .unwrap_err()
                .contains("Folder changed")
        );
        let fresh = read_markdown_directory(&directory, &excluded, 0, None).unwrap();
        assert_eq!(fresh.children.len(), 200);
        assert!(read_markdown_directory(&directory.join("missing"), &excluded, 0, None).is_err());
        fs::remove_dir_all(directory).unwrap();
    }

    fn paging_fixture(label: &str, count: usize) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "milo-snapshot-{label}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        for index in 0..count {
            fs::write(path.join(format!("{index:05}.md")), "").unwrap();
        }
        path
    }

    #[test]
    fn directory_snapshot_handles_more_than_ten_thousand_entries_without_rescanning() {
        let path = paging_fixture("large", 10_050);
        let cache = std::sync::Mutex::new(super::DirectoryCache::new());
        let first = super::read_directory_with_cache(&path, &[], 0, None, &cache).unwrap();
        let original_modified = fs::metadata(&path).unwrap().modified().unwrap();
        // Even an undetected/coarse-mtime change cannot turn an old offset into
        // a slice of a newly scanned list: the original snapshot is immutable.
        fs::write(path.join("00000-before.md"), "").unwrap();
        File::open(&path)
            .unwrap()
            .set_modified(original_modified)
            .unwrap();
        let second =
            super::read_directory_with_cache(&path, &[], 200, first.snapshot_id.as_deref(), &cache)
                .unwrap();
        assert_eq!(second.children[0].name, "00200.md");
        assert_eq!(second.snapshot_id, first.snapshot_id);
        assert_eq!(
            cache
                .lock()
                .unwrap()
                .values()
                .next()
                .unwrap()
                .children
                .len(),
            10_050
        );
        let refreshed = super::read_directory_with_cache(&path, &[], 0, None, &cache).unwrap();
        assert_ne!(refreshed.snapshot_id, first.snapshot_id);
        let old =
            super::read_directory_with_cache(&path, &[], 400, first.snapshot_id.as_deref(), &cache)
                .unwrap();
        let new = super::read_directory_with_cache(
            &path,
            &[],
            200,
            refreshed.snapshot_id.as_deref(),
            &cache,
        )
        .unwrap();
        assert_eq!(old.children[0].name, "00400.md");
        assert_eq!(new.children[0].name, "00199.md");
        fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn directory_snapshot_rejects_eviction_expiry_wrong_scope_and_missing_tokens() {
        let path = paging_fixture("expiry", 450);
        let cache = std::sync::Mutex::new(super::DirectoryCache::new());
        let first = super::read_directory_with_cache(&path, &[], 0, None, &cache).unwrap();
        let id = first.snapshot_id.as_deref();
        assert!(
            super::read_directory_with_cache(&path, &[], 200, None, &cache)
                .unwrap_err()
                .starts_with("DIRECTORY_SNAPSHOT_STALE:")
        );
        assert!(
            super::read_directory_with_cache(&path, &["target".into()], 200, id, &cache).is_err()
        );
        assert!(super::read_directory_with_cache(&path, &[], usize::MAX, id, &cache).is_err());
        fs::create_dir(path.join("other")).unwrap();
        let modified = cache.lock().unwrap().get(id.unwrap()).unwrap().modified;
        File::open(&path).unwrap().set_modified(modified).unwrap();
        File::open(path.join("other"))
            .unwrap()
            .set_modified(modified)
            .unwrap();
        assert!(
            super::read_directory_with_cache(&path.join("other"), &[], 200, id, &cache).is_err()
        );
        cache.lock().unwrap().get_mut(id.unwrap()).unwrap().used -=
            std::time::Duration::from_secs(31);
        assert!(super::read_directory_with_cache(&path, &[], 200, id, &cache).is_err());
        let fresh = super::read_directory_with_cache(&path, &[], 0, None, &cache).unwrap();
        for _ in 0..8 {
            super::read_directory_with_cache(&path, &[], 0, None, &cache).unwrap();
        }
        assert_eq!(cache.lock().unwrap().len(), 8);
        assert!(!cache
            .lock()
            .unwrap()
            .contains_key(fresh.snapshot_id.as_ref().unwrap()));
        let count = cache.lock().unwrap().len();
        assert!(super::read_directory_with_cache(
            &path,
            &[],
            200,
            fresh.snapshot_id.as_deref(),
            &cache
        )
        .unwrap_err()
        .starts_with("DIRECTORY_SNAPSHOT_STALE:"));
        assert_eq!(
            cache.lock().unwrap().len(),
            count,
            "an evicted continuation must not scan/insert a replacement list"
        );
        fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn validates_listing_metadata_after_paging_cache_eviction_and_detects_change_or_deletion() {
        let path = paging_fixture("validation", 1);
        let cache = std::sync::Mutex::new(super::DirectoryCache::new());
        let first = super::read_directory_with_cache(&path, &[], 0, None, &cache).unwrap();
        let version = first.directory_version.unwrap();
        cache.lock().unwrap().clear();
        let validate = || {
            tauri::async_runtime::block_on(super::validate_markdown_directory(
                path.to_string_lossy().into_owned(),
                version.clone(),
            ))
        };
        assert!(
            validate().unwrap(),
            "cache eviction must not invalidate unchanged cached rows"
        );
        fs::write(path.join("new.md"), "").unwrap();
        File::open(&path)
            .unwrap()
            .set_modified(SystemTime::now() + std::time::Duration::from_secs(2))
            .unwrap();
        assert!(!validate().unwrap());
        fs::remove_dir_all(&path).unwrap();
        assert!(validate().is_err());
    }

    #[test]
    fn directory_snapshot_byte_budget_evicts_oldest_without_exceeding_limits() {
        let mut cache = super::DirectoryCache::new();
        for index in 0..4 {
            super::insert_directory_snapshot(
                &mut cache,
                index.to_string(),
                super::DirectorySnapshot {
                    path: PathBuf::from("/synthetic"),
                    excluded: vec![],
                    modified: SystemTime::now(),
                    used: std::time::Instant::now(),
                    bytes: super::DIRECTORY_SCAN_BYTES,
                    children: vec![],
                },
            );
            assert!(cache.values().map(|s| s.bytes).sum::<usize>() <= super::DIRECTORY_CACHE_BYTES);
        }
        assert_eq!(cache.len(), 2);
        assert!(!cache.contains_key("0"));
        assert!(cache.contains_key("3"));
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

        let asset = write_image_asset_impl(ImageAssetRequest {
            document_path: document.to_string_lossy().into_owned(),
            bytes: vec![137, 80, 78, 71],
            mime_type: "image/png".to_owned(),
        })
        .unwrap();

        assert!(asset.relative_path.starts_with("assets/image-"));
        assert_eq!(fs::read(&asset.path).unwrap(), vec![137, 80, 78, 71]);
        assert!(write_image_asset_impl(ImageAssetRequest {
            document_path: document.to_string_lossy().into_owned(),
            bytes: vec![1],
            mime_type: "image/svg+xml".to_owned(),
        })
        .is_err());
        fs::remove_dir_all(directory).unwrap();
    }
}
