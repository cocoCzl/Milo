use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    os::unix::fs::MetadataExt,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
#[cfg(test)]
use std::{
    sync::{Condvar, Mutex, OnceLock},
    time::Duration,
};

#[cfg(test)]
const CRASH_PAUSE_STATUS_PATH: &str = "/tmp/milo-safe-save-pause-status.json";

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum CrashPausePoint {
    C1,
    C2,
    C3,
    C4,
    C5,
}

#[cfg(test)]
impl CrashPausePoint {
    fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "c1" => Ok(Self::C1),
            "c2" => Ok(Self::C2),
            "c3" => Ok(Self::C3),
            "c4" => Ok(Self::C4),
            "c5" => Ok(Self::C5),
            _ => Err("Unknown Safe Save crash pause point; expected c1 through c5.".to_owned()),
        }
    }
}

#[cfg(test)]
#[derive(Debug)]
struct CrashPauseConfiguration {
    target: PathBuf,
    point: CrashPausePoint,
}

#[cfg(test)]
#[derive(Default)]
struct CrashPauseState {
    configuration: Option<CrashPauseConfiguration>,
}

#[cfg(test)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CrashPauseStatus<'a> {
    target_path: &'a str,
    pause_point: CrashPausePoint,
    process_id: u32,
}

#[cfg(test)]
fn crash_pause_controller() -> &'static (Mutex<CrashPauseState>, Condvar) {
    static CONTROLLER: OnceLock<(Mutex<CrashPauseState>, Condvar)> = OnceLock::new();
    CONTROLLER.get_or_init(|| (Mutex::new(CrashPauseState::default()), Condvar::new()))
}

#[cfg(test)]
pub fn crash_pause_status_path() -> PathBuf {
    PathBuf::from(CRASH_PAUSE_STATUS_PATH)
}

#[cfg(test)]
pub fn configure_crash_pause(target: &Path, point: &str) -> Result<(), String> {
    let point = CrashPausePoint::parse(point)?;
    let (lock, _) = crash_pause_controller();
    let mut state = lock
        .lock()
        .map_err(|_| "Could not lock the Safe Save crash pause controller.".to_owned())?;
    if state.configuration.is_some() {
        return Err("A Safe Save crash pause is already configured.".to_owned());
    }
    remove_crash_pause_status()?;
    state.configuration = Some(CrashPauseConfiguration {
        target: target.to_path_buf(),
        point,
    });
    Ok(())
}

#[cfg(test)]
pub fn resume_crash_pause() -> Result<(), String> {
    let (lock, wake) = crash_pause_controller();
    let mut state = lock
        .lock()
        .map_err(|_| "Could not lock the Safe Save crash pause controller.".to_owned())?;
    if state.configuration.is_none() {
        return Err("No Safe Save crash pause is currently configured.".to_owned());
    }
    state.configuration = None;
    remove_crash_pause_status()?;
    wake.notify_all();
    Ok(())
}

#[cfg(test)]
fn maybe_pause_for_crash_test(target: &Path, point: CrashPausePoint) -> Result<(), String> {
    let (lock, wake) = crash_pause_controller();
    let mut state = lock
        .lock()
        .map_err(|_| "Could not lock the Safe Save crash pause controller.".to_owned())?;
    let Some(configuration) = state.configuration.as_ref() else {
        return Ok(());
    };
    if configuration.target != target || configuration.point != point {
        return Ok(());
    }

    write_crash_pause_status(target, point)?;
    while state.configuration.is_some() {
        let (next_state, _) = wake
            .wait_timeout(state, Duration::from_millis(100))
            .map_err(|_| "Could not wait on the Safe Save crash pause controller.".to_owned())?;
        state = next_state;
        if !crash_pause_status_path().exists() {
            state.configuration = None;
            wake.notify_all();
        }
    }
    Ok(())
}

#[cfg(test)]
fn crash_pause_matches(target: &Path, point: CrashPausePoint) -> Result<bool, String> {
    let (lock, _) = crash_pause_controller();
    let state = lock
        .lock()
        .map_err(|_| "Could not lock the Safe Save crash pause controller.".to_owned())?;
    Ok(state.configuration.as_ref().is_some_and(|configuration| {
        configuration.target == target && configuration.point == point
    }))
}

#[cfg(test)]
fn write_crash_pause_status(target: &Path, point: CrashPausePoint) -> Result<(), String> {
    let target_path = target.to_string_lossy();
    let status = CrashPauseStatus {
        target_path: &target_path,
        pause_point: point,
        process_id: std::process::id(),
    };
    let bytes = serde_json::to_vec_pretty(&status).map_err(|error| {
        format!("Could not serialize the Safe Save crash pause status: {error}")
    })?;
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(crash_pause_status_path())
        .map_err(|error| format!("Could not publish the Safe Save crash pause status: {error}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.flush())
        .and_then(|_| file.sync_all())
        .map_err(|error| {
            format!("Could not make the Safe Save crash pause status durable: {error}")
        })
}

#[cfg(test)]
fn remove_crash_pause_status() -> Result<(), String> {
    match fs::remove_file(crash_pause_status_path()) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not remove the Safe Save crash pause status: {error}"
        )),
    }
}

#[cfg(not(test))]
fn maybe_pause_for_crash_test(_target: &Path, _point: CrashPausePoint) -> Result<(), String> {
    Ok(())
}

#[cfg(not(test))]
fn crash_pause_matches(_target: &Path, _point: CrashPausePoint) -> Result<bool, String> {
    Ok(false)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FailurePoint {
    F1BeforeBackupCreate,
    F2BackupHalfWritten,
    F3BackupSyncedBeforeTruncate,
    F4AfterOriginalTruncate,
    F5OriginalHalfWritten,
    F6OriginalWrittenBeforeSync,
    F7OriginalSyncedBeforeCleanup,
}

#[cfg(debug_assertions)]
impl FailurePoint {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "f1" => Ok(Self::F1BeforeBackupCreate),
            "f2" => Ok(Self::F2BackupHalfWritten),
            "f3" => Ok(Self::F3BackupSyncedBeforeTruncate),
            "f4" => Ok(Self::F4AfterOriginalTruncate),
            "f5" => Ok(Self::F5OriginalHalfWritten),
            "f6" => Ok(Self::F6OriginalWrittenBeforeSync),
            "f7" => Ok(Self::F7OriginalSyncedBeforeCleanup),
            _ => Err("Unknown Safe Save failure point; expected f1 through f7.".to_owned()),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryMarker {
    schema_version: u8,
    target_path: String,
    backup_path: String,
    device_id: u64,
    inode: u64,
    original_size: u64,
    new_size: u64,
    original_sha256: String,
    new_sha256: String,
    created_at: u64,
    phase: RecoveryPhase,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
enum RecoveryPhase {
    PreparingBackup,
    BackupReady,
    CommitStarted,
}

#[derive(Debug, Eq, PartialEq)]
pub enum RecoveryOutcome {
    Clean,
    KeptOriginal,
    KeptCommitted,
    RestoredOriginal,
}

pub fn backup_path(target: &Path) -> Result<PathBuf, String> {
    sibling_path(target, "milo-backup")
}

pub fn marker_path(target: &Path) -> Result<PathBuf, String> {
    sibling_path(target, "milo-recovery.json")
}

fn marker_temporary_path(target: &Path) -> Result<PathBuf, String> {
    sibling_path(target, "milo-recovery.json.tmp")
}

fn sibling_path(target: &Path, suffix: &str) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "Could not determine the Safe Save target directory.".to_owned())?;
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Could not determine the Safe Save target name.".to_owned())?;
    Ok(parent.join(format!(".{file_name}.{suffix}")))
}

#[cfg(test)]
pub fn save_inode_preserving(
    target: &Path,
    new_contents: &[u8],
    failure: Option<FailurePoint>,
) -> Result<(), String> {
    save_inode_preserving_impl(target, new_contents, None, failure)
}

fn save_inode_preserving_impl(
    target: &Path,
    new_contents: &[u8],
    expected_disk_contents: Option<&[u8]>,
    failure: Option<FailurePoint>,
) -> Result<(), String> {
    inspect_safe_target(target)?;
    let backup = backup_path(target)?;
    let marker = marker_path(target)?;
    let marker_temporary = marker_temporary_path(target)?;
    if sidecar_exists(&backup)? || sidecar_exists(&marker)? || sidecar_exists(&marker_temporary)? {
        return Err(
            "Safe Save recovery artifacts already exist; recovery must run before another save."
                .to_owned(),
        );
    }

    let original_contents = fs::read(target)
        .map_err(|error| format!("Could not read the Safe Save original: {error}"))?;
    if expected_disk_contents.is_some_and(|expected| original_contents != expected) {
        return Err(
            "Safe Save external change conflict: disk content no longer matches the session version."
                .to_owned(),
        );
    }
    let original_metadata = fs::metadata(target)
        .map_err(|error| format!("Could not inspect the Safe Save original: {error}"))?;
    let recovery = RecoveryMarker {
        schema_version: 1,
        target_path: target.to_string_lossy().into_owned(),
        backup_path: backup.to_string_lossy().into_owned(),
        device_id: original_metadata.dev(),
        inode: original_metadata.ino(),
        original_size: original_contents.len() as u64,
        new_size: new_contents.len() as u64,
        original_sha256: sha256(&original_contents),
        new_sha256: sha256(new_contents),
        created_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or_default(),
        phase: RecoveryPhase::PreparingBackup,
    };

    write_marker(&marker_temporary, &marker, &recovery)?;
    fs::rename(&marker_temporary, &marker)
        .map_err(|error| format!("Could not publish the Safe Save recovery marker: {error}"))?;
    sync_parent(target)?;

    inject(failure, FailurePoint::F1BeforeBackupCreate)?;

    let mut backup_file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&backup)
        .map_err(|error| format!("Could not create the Safe Save recovery backup: {error}"))?;
    fs::set_permissions(&backup, original_metadata.permissions())
        .map_err(|error| format!("Could not protect the Safe Save recovery backup: {error}"))?;
    if failure == Some(FailurePoint::F2BackupHalfWritten) {
        backup_file
            .write_all(first_half(&original_contents))
            .and_then(|_| backup_file.flush())
            .map_err(|error| format!("Could not inject Safe Save F2: {error}"))?;
        return Err("Injected Safe Save failure F2 after writing half the backup.".to_owned());
    }
    backup_file
        .write_all(&original_contents)
        .and_then(|_| backup_file.flush())
        .and_then(|_| backup_file.sync_all())
        .map_err(|error| {
            format!("Could not create a durable Safe Save recovery backup: {error}")
        })?;
    drop(backup_file);
    sync_parent(target)?;

    let mut recovery = recovery;
    recovery.phase = RecoveryPhase::BackupReady;
    publish_marker_update(&marker_temporary, &marker, &recovery)?;

    inject(failure, FailurePoint::F3BackupSyncedBeforeTruncate)?;
    maybe_pause_for_crash_test(target, CrashPausePoint::C1)?;

    let precommit_metadata = inspect_safe_target(target)?;
    let precommit_contents = fs::read(target).map_err(|error| {
        format!("Could not revalidate the Safe Save target before commit: {error}")
    })?;
    if precommit_metadata.dev() != recovery.device_id
        || precommit_metadata.ino() != recovery.inode
        || sha256(&precommit_contents) != recovery.original_sha256
    {
        cleanup_recovery_artifacts(target, &backup, &marker)?;
        return Err(
            "Safe Save external change conflict detected before in-place commit.".to_owned(),
        );
    }

    recovery.phase = RecoveryPhase::CommitStarted;
    publish_marker_update(&marker_temporary, &marker, &recovery)?;

    let mut original_file = OpenOptions::new()
        .write(true)
        .open(target)
        .map_err(|error| format!("Could not open the Safe Save original for commit: {error}"))?;
    let opened_metadata = original_file
        .metadata()
        .map_err(|error| format!("Could not inspect the opened Safe Save target: {error}"))?;
    if opened_metadata.dev() != recovery.device_id || opened_metadata.ino() != recovery.inode {
        return Err("Safe Save target identity changed while opening for commit.".to_owned());
    }
    original_file
        .set_len(0)
        .map_err(|error| format!("Could not truncate the Safe Save original: {error}"))?;
    inject(failure, FailurePoint::F4AfterOriginalTruncate)?;
    maybe_pause_for_crash_test(target, CrashPausePoint::C2)?;

    if failure == Some(FailurePoint::F5OriginalHalfWritten) {
        original_file
            .write_all(first_half(new_contents))
            .and_then(|_| original_file.flush())
            .map_err(|error| format!("Could not inject Safe Save F5: {error}"))?;
        return Err("Injected Safe Save failure F5 after writing half the original.".to_owned());
    }
    let split = new_contents.len().div_ceil(2);
    if crash_pause_matches(target, CrashPausePoint::C3)? {
        original_file
            .write_all(&new_contents[..split])
            .and_then(|_| original_file.flush())
            .map_err(|error| {
                format!("Could not write the first half of the Safe Save target: {error}")
            })?;
        maybe_pause_for_crash_test(target, CrashPausePoint::C3)?;
        original_file
            .write_all(&new_contents[split..])
            .and_then(|_| original_file.flush())
            .map_err(|error| format!("Could not finish writing the Safe Save target: {error}"))?;
    } else {
        original_file
            .write_all(new_contents)
            .and_then(|_| original_file.flush())
            .map_err(|error| format!("Could not write the Safe Save original: {error}"))?;
    }
    maybe_pause_for_crash_test(target, CrashPausePoint::C4)?;
    inject(failure, FailurePoint::F6OriginalWrittenBeforeSync)?;
    original_file
        .sync_all()
        .map_err(|error| format!("Could not sync the Safe Save original: {error}"))?;
    drop(original_file);

    if sha256(
        &fs::read(target).map_err(|error| format!("Could not verify Safe Save commit: {error}"))?,
    ) != recovery.new_sha256
    {
        return Err(
            "Safe Save commit verification did not match the expected new SHA-256.".to_owned(),
        );
    }
    maybe_pause_for_crash_test(target, CrashPausePoint::C5)?;
    inject(failure, FailurePoint::F7OriginalSyncedBeforeCleanup)?;

    cleanup_recovery_artifacts(target, &backup, &marker)?;
    Ok(())
}

fn inspect_safe_target(target: &Path) -> Result<fs::Metadata, String> {
    let link_metadata = fs::symlink_metadata(target)
        .map_err(|error| format!("Could not inspect the Safe Save target: {error}"))?;
    if link_metadata.file_type().is_symlink() {
        return Err("Safe Save refuses to save through a symbolic link.".to_owned());
    }
    if !link_metadata.is_file() {
        return Err("Safe Save requires an existing regular target file.".to_owned());
    }
    if link_metadata.nlink() > 1 {
        return Err("Safe Save refuses to save a file with multiple hard links.".to_owned());
    }
    Ok(link_metadata)
}

fn sidecar_exists(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(format!(
            "Safe Save refuses to follow a recovery sidecar symbolic link: {}",
            path.display()
        )),
        Ok(metadata) if !metadata.is_file() => Err(format!(
            "Safe Save recovery sidecar is not a regular file: {}",
            path.display()
        )),
        Ok(_) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Could not inspect Safe Save recovery sidecar: {error}"
        )),
    }
}

pub fn save_inode_preserving_if_unchanged(
    target: &Path,
    new_contents: &[u8],
    expected_disk_contents: &[u8],
    failure: Option<FailurePoint>,
) -> Result<(), String> {
    save_inode_preserving_impl(target, new_contents, Some(expected_disk_contents), failure)
}

pub fn recover_inode_preserving(target: &Path) -> Result<RecoveryOutcome, String> {
    let backup = backup_path(target)?;
    let marker = marker_path(target)?;
    let marker_temporary = marker_temporary_path(target)?;
    let marker_temporary_exists = sidecar_exists(&marker_temporary)?;
    let marker_exists = sidecar_exists(&marker)?;
    let backup_exists = sidecar_exists(&backup)?;

    if marker_temporary_exists {
        if marker_exists || backup_exists {
            return Err(
                "Safe Save found conflicting recovery artifacts; refusing automatic recovery."
                    .to_owned(),
            );
        }
        fs::remove_file(&marker_temporary).map_err(|error| {
            format!("Could not remove an unpublished Safe Save marker: {error}")
        })?;
        sync_parent(target)?;
        return Ok(RecoveryOutcome::KeptOriginal);
    }
    if !marker_exists {
        return if backup_exists {
            Err("Safe Save found a backup without a recovery marker; refusing to guess its owner or version.".to_owned())
        } else {
            Ok(RecoveryOutcome::Clean)
        };
    }
    if !target.is_file() {
        return Err(
            "Safe Save target is missing; refusing recovery because inode preservation is impossible."
                .to_owned(),
        );
    }

    let marker_bytes = fs::read(&marker)
        .map_err(|error| format!("Could not read the Safe Save recovery marker: {error}"))?;
    let recovery: RecoveryMarker = serde_json::from_slice(&marker_bytes).map_err(|error| {
        format!("Safe Save recovery marker is invalid; preserving all artifacts: {error}")
    })?;
    if recovery.schema_version != 1
        || recovery.target_path != target.to_string_lossy()
        || recovery.backup_path != backup.to_string_lossy()
    {
        return Err(
            "Safe Save recovery marker does not identify this exact target and backup.".to_owned(),
        );
    }

    let target_metadata = fs::metadata(target)
        .map_err(|error| format!("Could not inspect the Safe Save recovery target: {error}"))?;
    if target_metadata.dev() != recovery.device_id || target_metadata.ino() != recovery.inode {
        return Err(
            "Safe Save recovery target identity changed; refusing automatic recovery.".to_owned(),
        );
    }

    let target_contents = fs::read(target)
        .map_err(|error| format!("Could not read the Safe Save recovery target: {error}"))?;
    let target_sha = sha256(&target_contents);
    let backup_contents = if backup_exists {
        Some(
            fs::read(&backup)
                .map_err(|error| format!("Could not read the Safe Save backup: {error}"))?,
        )
    } else {
        None
    };
    let backup_is_complete = backup_contents
        .as_ref()
        .map(|contents| sha256(contents) == recovery.original_sha256)
        .unwrap_or(false);

    if target_sha == recovery.new_sha256 {
        if backup_exists && !backup_is_complete {
            return Err(
                "Safe Save target matches the new SHA but its backup is corrupt; preserving artifacts."
                    .to_owned(),
            );
        }
        File::open(target)
            .and_then(|file| file.sync_all())
            .map_err(|error| {
                format!("Could not make the recovered Safe Save commit durable: {error}")
            })?;
        cleanup_recovery_artifacts(target, &backup, &marker)?;
        return Ok(RecoveryOutcome::KeptCommitted);
    }
    if target_sha == recovery.original_sha256 {
        cleanup_recovery_artifacts(target, &backup, &marker)?;
        return Ok(RecoveryOutcome::KeptOriginal);
    }
    if !matches!(recovery.phase, RecoveryPhase::CommitStarted) {
        return Err(
            "Safe Save target changed before the commit phase; refusing automatic recovery."
                .to_owned(),
        );
    }
    let backup_contents = backup_contents.filter(|_| backup_is_complete).ok_or_else(|| {
        "Safe Save target is neither old nor new and no complete verified backup exists; preserving artifacts."
            .to_owned()
    })?;

    write_in_place(target, &backup_contents)?;
    if sha256(
        &fs::read(target)
            .map_err(|error| format!("Could not verify Safe Save recovery: {error}"))?,
    ) != recovery.original_sha256
    {
        return Err(
            "Safe Save recovery verification failed; preserving recovery artifacts.".to_owned(),
        );
    }
    cleanup_recovery_artifacts(target, &backup, &marker)?;
    Ok(RecoveryOutcome::RestoredOriginal)
}

fn write_marker(path: &Path, marker: &Path, recovery: &RecoveryMarker) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(recovery)
        .map_err(|error| format!("Could not serialize the Safe Save recovery marker: {error}"))?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("Could not create the Safe Save recovery marker: {error}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.flush())
        .and_then(|_| file.sync_all())
        .map_err(|error| {
            format!("Could not make the Safe Save recovery marker durable: {error}")
        })?;
    if marker.exists() {
        return Err(
            "Safe Save recovery marker appeared concurrently; refusing to overwrite it.".to_owned(),
        );
    }
    Ok(())
}

fn publish_marker_update(
    temporary: &Path,
    marker: &Path,
    recovery: &RecoveryMarker,
) -> Result<(), String> {
    if sidecar_exists(temporary)? {
        return Err("Safe Save marker update temporary already exists.".to_owned());
    }
    if !sidecar_exists(marker)? {
        return Err("Safe Save marker disappeared during transaction.".to_owned());
    }
    write_marker_bytes(temporary, recovery)?;
    fs::rename(temporary, marker)
        .map_err(|error| format!("Could not publish the Safe Save marker phase: {error}"))?;
    sync_parent(marker)
}

fn write_marker_bytes(path: &Path, recovery: &RecoveryMarker) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(recovery)
        .map_err(|error| format!("Could not serialize the Safe Save recovery marker: {error}"))?;
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("Could not create the Safe Save recovery marker: {error}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.flush())
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Could not make the Safe Save recovery marker durable: {error}"))
}

fn write_in_place(target: &Path, contents: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .open(target)
        .map_err(|error| format!("Could not open the Safe Save recovery target: {error}"))?;
    file.set_len(0)
        .and_then(|_| file.write_all(contents))
        .and_then(|_| file.flush())
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("Could not restore the Safe Save original in place: {error}"))
}

fn cleanup_recovery_artifacts(target: &Path, backup: &Path, marker: &Path) -> Result<(), String> {
    if backup.exists() {
        fs::remove_file(backup)
            .map_err(|error| format!("Could not remove the Safe Save recovery backup: {error}"))?;
        sync_parent(target)?;
    }
    fs::remove_file(marker)
        .map_err(|error| format!("Could not remove the Safe Save recovery marker: {error}"))?;
    sync_parent(target)
}

fn sync_parent(target: &Path) -> Result<(), String> {
    let parent = target
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| "Could not determine the Safe Save target directory.".to_owned())?;
    File::open(parent)
        .and_then(|directory| directory.sync_all())
        .map_err(|error| format!("Could not sync the Safe Save target directory: {error}"))
}

fn sha256(contents: &[u8]) -> String {
    format!("{:x}", Sha256::digest(contents))
}

fn first_half(contents: &[u8]) -> &[u8] {
    &contents[..contents.len().div_ceil(2)]
}

fn inject(actual: Option<FailurePoint>, expected: FailurePoint) -> Result<(), String> {
    if actual == Some(expected) {
        Err(format!("Injected Safe Save failure {expected:?}."))
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        os::unix::fs::MetadataExt,
        time::{SystemTime, UNIX_EPOCH},
    };

    const OLD: &[u8] = b"# Old\n\nOriginal bytes.\n";
    const NEW: &[u8] = b"# New\n\nNew bytes with UTF-8: \xe4\xb8\xad\xe6\x96\x87\n";

    fn crash_pause_test_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn fixture(label: &str) -> (PathBuf, PathBuf) {
        let directory = std::env::temp_dir().join(format!(
            "milo-safe-save-{label}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&directory).unwrap();
        let target = directory.join("note.md");
        fs::write(&target, OLD).unwrap();
        (directory, target)
    }

    #[test]
    fn successful_save_preserves_inode_and_cleans_recovery_artifacts() {
        let (directory, target) = fixture("success");
        let before = fs::metadata(&target).unwrap();

        save_inode_preserving_if_unchanged(&target, NEW, OLD, None).unwrap();

        let after = fs::metadata(&target).unwrap();
        assert_eq!(fs::read(&target).unwrap(), NEW);
        assert_eq!(after.ino(), before.ino());
        assert_eq!(after.mode(), before.mode());
        assert_eq!(after.uid(), before.uid());
        assert_eq!(after.gid(), before.gid());
        assert_eq!(after.nlink(), before.nlink());
        assert!(!backup_path(&target).unwrap().exists());
        assert!(!marker_path(&target).unwrap().exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn refuses_external_change_before_creating_recovery_artifacts() {
        let (directory, target) = fixture("external-change");
        fs::write(&target, b"Externally changed").unwrap();

        let error = save_inode_preserving_if_unchanged(&target, NEW, OLD, None).unwrap_err();

        assert!(error.contains("external change"));
        assert_eq!(fs::read(&target).unwrap(), b"Externally changed");
        assert!(!backup_path(&target).unwrap().exists());
        assert!(!marker_path(&target).unwrap().exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn recovery_marker_records_versioned_file_identity_and_sizes() {
        let (directory, target) = fixture("marker-schema");
        let metadata = fs::metadata(&target).unwrap();
        assert!(save_inode_preserving(
            &target,
            NEW,
            Some(FailurePoint::F3BackupSyncedBeforeTruncate),
        )
        .is_err());

        let marker: serde_json::Value =
            serde_json::from_slice(&fs::read(marker_path(&target).unwrap()).unwrap()).unwrap();
        assert_eq!(marker["schemaVersion"], 1);
        assert_eq!(marker["targetPath"], target.to_string_lossy().as_ref());
        assert_eq!(
            marker["backupPath"],
            backup_path(&target).unwrap().to_string_lossy().as_ref()
        );
        assert_eq!(marker["deviceId"], metadata.dev());
        assert_eq!(marker["inode"], metadata.ino());
        assert_eq!(marker["originalSize"], OLD.len());
        assert_eq!(marker["newSize"], NEW.len());
        assert!(marker["createdAt"].as_u64().is_some());

        recover_inode_preserving(&target).unwrap();
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn recovery_refuses_a_replaced_target_even_when_its_bytes_match() {
        let (directory, target) = fixture("identity-change");
        assert!(save_inode_preserving(
            &target,
            NEW,
            Some(FailurePoint::F3BackupSyncedBeforeTruncate),
        )
        .is_err());
        let replacement = directory.join("replacement.md");
        fs::write(&replacement, OLD).unwrap();
        fs::rename(&replacement, &target).unwrap();

        let error = recover_inode_preserving(&target).unwrap_err();

        assert!(error.contains("identity changed"));
        assert!(backup_path(&target).unwrap().exists());
        assert!(marker_path(&target).unwrap().exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn refuses_to_save_through_a_symlink() {
        use std::os::unix::fs::symlink;

        let (directory, real_target) = fixture("symlink");
        let symlink_target = directory.join("linked.md");
        symlink(&real_target, &symlink_target).unwrap();

        let error =
            save_inode_preserving_if_unchanged(&symlink_target, NEW, OLD, None).unwrap_err();

        assert!(error.contains("symbolic link"));
        assert_eq!(fs::read(&real_target).unwrap(), OLD);
        assert!(!backup_path(&symlink_target).unwrap().exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn refuses_to_save_a_target_with_multiple_hard_links() {
        let (directory, target) = fixture("hard-link");
        let second_name = directory.join("second-name.md");
        fs::hard_link(&target, &second_name).unwrap();

        let error = save_inode_preserving_if_unchanged(&target, NEW, OLD, None).unwrap_err();

        assert!(error.contains("multiple hard links"));
        assert_eq!(fs::read(&target).unwrap(), OLD);
        assert_eq!(fs::read(&second_name).unwrap(), OLD);
        assert!(!backup_path(&target).unwrap().exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn recovery_refuses_to_follow_a_sidecar_symlink() {
        use std::os::unix::fs::symlink;

        let (directory, target) = fixture("sidecar-symlink");
        let unrelated = directory.join("unrelated.json");
        fs::write(&unrelated, b"{}").unwrap();
        symlink(&unrelated, marker_path(&target).unwrap()).unwrap();

        let error = recover_inode_preserving(&target).unwrap_err();

        assert!(error.contains("symbolic link"));
        assert_eq!(fs::read(&unrelated).unwrap(), b"{}");
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn f1_through_f7_have_deterministic_recovery() {
        let scenarios = [
            (
                FailurePoint::F1BeforeBackupCreate,
                OLD,
                false,
                RecoveryOutcome::KeptOriginal,
            ),
            (
                FailurePoint::F2BackupHalfWritten,
                OLD,
                false,
                RecoveryOutcome::KeptOriginal,
            ),
            (
                FailurePoint::F3BackupSyncedBeforeTruncate,
                OLD,
                true,
                RecoveryOutcome::KeptOriginal,
            ),
            (
                FailurePoint::F4AfterOriginalTruncate,
                b"".as_slice(),
                true,
                RecoveryOutcome::RestoredOriginal,
            ),
            (
                FailurePoint::F5OriginalHalfWritten,
                first_half(NEW),
                true,
                RecoveryOutcome::RestoredOriginal,
            ),
            (
                FailurePoint::F6OriginalWrittenBeforeSync,
                NEW,
                true,
                RecoveryOutcome::KeptCommitted,
            ),
            (
                FailurePoint::F7OriginalSyncedBeforeCleanup,
                NEW,
                true,
                RecoveryOutcome::KeptCommitted,
            ),
        ];

        for (point, expected_interrupted_target, backup_complete, expected_recovery) in scenarios {
            let (directory, target) = fixture(&format!("{point:?}"));
            let inode = fs::metadata(&target).unwrap().ino();
            assert!(save_inode_preserving_if_unchanged(&target, NEW, OLD, Some(point)).is_err());
            assert_eq!(
                fs::read(&target).unwrap(),
                expected_interrupted_target,
                "{point:?}"
            );
            let backup = backup_path(&target).unwrap();
            assert_eq!(
                backup.exists() && fs::read(&backup).unwrap() == OLD,
                backup_complete,
                "{point:?}"
            );
            assert_eq!(
                recover_inode_preserving(&target).unwrap(),
                expected_recovery,
                "{point:?}"
            );
            let expected_final = if matches!(
                point,
                FailurePoint::F6OriginalWrittenBeforeSync
                    | FailurePoint::F7OriginalSyncedBeforeCleanup
            ) {
                NEW
            } else {
                OLD
            };
            assert_eq!(fs::read(&target).unwrap(), expected_final, "{point:?}");
            assert_eq!(fs::metadata(&target).unwrap().ino(), inode, "{point:?}");
            assert!(!backup.exists(), "{point:?}");
            assert!(!marker_path(&target).unwrap().exists(), "{point:?}");
            fs::remove_dir_all(directory).unwrap();
        }
    }

    #[test]
    fn refuses_to_overwrite_or_guess_unowned_recovery_artifacts() {
        let (directory, target) = fixture("existing-backup");
        fs::write(backup_path(&target).unwrap(), OLD).unwrap();

        assert!(save_inode_preserving(&target, NEW, None).is_err());
        assert!(recover_inode_preserving(&target).is_err());
        assert_eq!(fs::read(&target).unwrap(), OLD);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn dev_pause_stops_a_real_save_at_c1_until_resumed() {
        let _pause_test_guard = crash_pause_test_lock().lock().unwrap();
        let (directory, target) = fixture("pause-c1");
        configure_crash_pause(&target, "c1").unwrap();
        let save_target = target.clone();
        let worker = std::thread::spawn(move || {
            save_inode_preserving_if_unchanged(&save_target, NEW, OLD, None)
        });

        for _ in 0..100 {
            if crash_pause_status_path().exists() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert!(crash_pause_status_path().exists());
        assert_eq!(fs::read(&target).unwrap(), OLD);
        resume_crash_pause().unwrap();
        worker.join().unwrap().unwrap();
        assert_eq!(fs::read(&target).unwrap(), NEW);
        assert!(!crash_pause_status_path().exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn dev_pause_can_be_resumed_by_an_external_process() {
        let _pause_test_guard = crash_pause_test_lock().lock().unwrap();
        let (directory, target) = fixture("pause-external-resume");
        configure_crash_pause(&target, "c1").unwrap();
        let save_target = target.clone();
        let worker = std::thread::spawn(move || {
            save_inode_preserving_if_unchanged(&save_target, NEW, OLD, None)
        });

        for _ in 0..100 {
            if crash_pause_status_path().exists() {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(crash_pause_status_path().exists());
        fs::remove_file(crash_pause_status_path()).unwrap();
        worker.join().unwrap().unwrap();

        assert_eq!(fs::read(&target).unwrap(), NEW);
        assert!(!crash_pause_status_path().exists());
        fs::remove_dir_all(directory).unwrap();
    }
}
