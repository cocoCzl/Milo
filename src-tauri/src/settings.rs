use serde::{Deserialize, Deserializer, Serialize};
use std::{fs, io::Write, path::{Path, PathBuf}};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE_NAME: &str = "settings.json";
const CURRENT_SETTINGS_VERSION: u8 = 4;

#[derive(Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppearancePreference {
    System,
    Light,
    Dark,
    Warm,
}

impl Default for AppearancePreference {
    fn default() -> Self {
        Self::System
    }
}

// Appearance is intentionally decoded independently from the enclosing
// settings struct. A future/invalid appearance value must not erase unrelated
// persisted state such as recent files or the startup session.
impl<'de> Deserialize<'de> for AppearancePreference {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer).unwrap_or(serde_json::Value::Null);
        Ok(match value.as_str() {
            Some("light") => Self::Light,
            Some("dark") => Self::Dark,
            Some("warm") => Self::Warm,
            _ => Self::System,
        })
    }
}

#[derive(Clone, Deserialize, Serialize)]
pub enum InterfaceLocale {
    #[serde(rename = "system")]
    System,
    #[serde(rename = "en")]
    English,
    #[serde(rename = "zh-CN")]
    SimplifiedChinese,
}

#[derive(Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StartupSession {
    pub active_document_path: Option<String>,
    pub open_document_paths: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct ApplicationSettings {
    pub settings_version: u8,
    pub appearance: AppearancePreference,
    pub locale: InterfaceLocale,
    pub document_zoom: u8,
    pub interface_zoom: u8,
    pub current_folder: Option<String>,
    pub recent_files: Vec<String>,
    pub recent_folders: Vec<String>,
    pub sidebar_visible: bool,
    pub sidebar_width: u16,
    pub startup_session: StartupSession,
}

impl Default for ApplicationSettings {
    fn default() -> Self {
        Self {
            settings_version: CURRENT_SETTINGS_VERSION,
            appearance: AppearancePreference::System,
            locale: InterfaceLocale::System,
            document_zoom: 100,
            interface_zoom: 120,
            current_folder: None,
            recent_files: Vec::new(),
            recent_folders: Vec::new(),
            sidebar_visible: true,
            sidebar_width: 240,
            startup_session: StartupSession::default(),
        }
    }
}

impl ApplicationSettings {
    fn normalized(mut self) -> Self {
        self.settings_version = CURRENT_SETTINGS_VERSION;
        self.document_zoom = self.document_zoom.clamp(80, 160);
        self.interface_zoom = self.interface_zoom.clamp(90, 140);
        self.sidebar_width = self.sidebar_width.clamp(220, 420);
        self.recent_files.truncate(12);
        self.recent_folders.truncate(8);
        self.startup_session.open_document_paths.retain(|path| is_markdown_document_path(path));
        self.startup_session.open_document_paths.truncate(12);
        if self.startup_session.active_document_path.as_ref().is_some_and(|path| !self.startup_session.open_document_paths.contains(path)) {
            self.startup_session.active_document_path = None;
        }
        self
    }
}

#[tauri::command]
pub fn load_application_settings(app: AppHandle) -> Result<ApplicationSettings, String> {
    read_settings(&settings_path(&app)?)
}

#[tauri::command]
pub fn save_application_settings(
    app: AppHandle,
    settings: ApplicationSettings,
) -> Result<ApplicationSettings, String> {
    let settings = settings.normalized();
    write_settings(&settings_path(&app)?, &settings)?;
    Ok(settings)
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(SETTINGS_FILE_NAME))
        .map_err(|error| format!("Could not locate Milo application settings: {error}"))
}

fn is_markdown_document_path(path: &str) -> bool {
    matches!(Path::new(path).extension().and_then(|extension| extension.to_str()), Some(extension) if extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown"))
}

fn read_settings(path: &Path) -> Result<ApplicationSettings, String> {
    if !path.exists() {
        return Ok(ApplicationSettings::default());
    }

    let contents = fs::read_to_string(path)
        .map_err(|error| format!("Could not read Milo application settings: {error}"))?;

    let Ok(value) = serde_json::from_str::<serde_json::Value>(&contents) else {
        return Ok(ApplicationSettings::default());
    };
    let settings_version = value.get("settingsVersion").and_then(|version| version.as_u64());
    let mut settings = serde_json::from_value::<ApplicationSettings>(value).unwrap_or_default();

    if settings_version.is_none() {
        if settings.interface_zoom == 110 {
            settings.interface_zoom = 120;
        }
    }
    if matches!(settings_version, Some(2)) && settings.document_zoom == 110 {
        settings.document_zoom = 100;
    }

    Ok(settings.normalized())
}

fn write_settings(path: &Path, settings: &ApplicationSettings) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "Could not locate Milo application settings directory.".to_owned())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create Milo application settings directory: {error}"))?;
    let temporary = parent.join(format!(".{SETTINGS_FILE_NAME}.tmp"));
    let serialized = serde_json::to_vec_pretty(settings)
        .map_err(|error| format!("Could not encode Milo application settings: {error}"))?;
    let mut file = fs::File::create(&temporary)
        .map_err(|error| format!("Could not prepare Milo application settings: {error}"))?;

    let result = (|| -> Result<(), String> {
        file.write_all(&serialized)
            .map_err(|error| format!("Could not write Milo application settings: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Could not finish writing Milo application settings: {error}"))?;
        drop(file);
        fs::rename(&temporary, path)
            .map_err(|error| format!("Could not replace Milo application settings safely: {error}"))
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::{read_settings, write_settings, ApplicationSettings, AppearancePreference, InterfaceLocale, StartupSession, CURRENT_SETTINGS_VERSION};
    use std::{fs, time::{SystemTime, UNIX_EPOCH}};

    #[test]
    fn settings_round_trip_outside_document_directories() {
        let directory = std::env::temp_dir().join(format!(
            "milo-settings-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let settings_path = directory.join("settings.json");
        let settings = ApplicationSettings {
            settings_version: CURRENT_SETTINGS_VERSION,
            appearance: AppearancePreference::Dark,
            locale: InterfaceLocale::SimplifiedChinese,
            document_zoom: 140,
            interface_zoom: 120,
            current_folder: Some("/tmp/milo".to_owned()),
            recent_files: vec!["/tmp/milo/note.md".to_owned()],
            recent_folders: vec!["/tmp/milo".to_owned()],
            sidebar_visible: false,
            sidebar_width: 280,
            startup_session: StartupSession {
                active_document_path: Some("/tmp/milo/note.md".to_owned()),
                open_document_paths: vec!["/tmp/milo/note.md".to_owned()],
            },
        };

        write_settings(&settings_path, &settings).unwrap();
        let restored = read_settings(&settings_path).unwrap();

        assert!(matches!(restored.appearance, AppearancePreference::Dark));
        assert!(matches!(restored.locale, InterfaceLocale::SimplifiedChinese));
        assert_eq!(restored.document_zoom, 140);
        assert_eq!(restored.interface_zoom, 120);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn missing_or_invalid_settings_use_safe_defaults() {
        let directory = std::env::temp_dir().join(format!(
            "milo-settings-default-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let settings_path = directory.join("settings.json");

        assert_eq!(read_settings(&settings_path).unwrap().document_zoom, 100);
        assert_eq!(read_settings(&settings_path).unwrap().interface_zoom, 120);
        fs::create_dir_all(&directory).unwrap();
        fs::write(&settings_path, "not settings").unwrap();
        assert_eq!(read_settings(&settings_path).unwrap().document_zoom, 100);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn prior_typography_default_is_migrated_once() {
        let directory = std::env::temp_dir().join(format!(
            "milo-settings-migration-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let settings_path = directory.join("settings.json");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            &settings_path,
            r#"{"settingsVersion":2,"appearance":"system","locale":"system","documentZoom":110,"interfaceZoom":120}"#,
        ).unwrap();

        let migrated = read_settings(&settings_path).unwrap();
        assert_eq!(migrated.settings_version, CURRENT_SETTINGS_VERSION);
        assert_eq!(migrated.document_zoom, 100);
        assert_eq!(migrated.interface_zoom, 120);

        write_settings(&settings_path, &migrated).unwrap();
        let restored = read_settings(&settings_path).unwrap();
        assert_eq!(restored.document_zoom, 100);
        assert_eq!(restored.interface_zoom, 120);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn version_three_settings_keep_all_existing_fields_when_upgraded() {
        let directory = std::env::temp_dir().join(format!(
            "milo-settings-v3-migration-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let settings_path = directory.join("settings.json");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            &settings_path,
            r#"{"settingsVersion":3,"appearance":"dark","locale":"zh-CN","documentZoom":130,"interfaceZoom":125,"currentFolder":"/tmp/milo","recentFiles":["/tmp/milo/a.md"],"recentFolders":["/tmp/milo"],"sidebarVisible":false,"sidebarWidth":300,"startupSession":{"activeDocumentPath":"/tmp/milo/a.md","openDocumentPaths":["/tmp/milo/a.md"]}}"#,
        ).unwrap();

        let migrated = read_settings(&settings_path).unwrap();
        assert_eq!(migrated.settings_version, CURRENT_SETTINGS_VERSION);
        assert!(matches!(migrated.appearance, AppearancePreference::Dark));
        assert_eq!(migrated.recent_files, vec!["/tmp/milo/a.md"]);
        assert_eq!(migrated.recent_folders, vec!["/tmp/milo"]);
        assert_eq!(migrated.startup_session.active_document_path.as_deref(), Some("/tmp/milo/a.md"));
        assert_eq!(migrated.sidebar_width, 300);
        assert!(!migrated.sidebar_visible);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn unknown_appearance_falls_back_without_resetting_other_settings() {
        let directory = std::env::temp_dir().join(format!(
            "milo-settings-appearance-fallback-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let settings_path = directory.join("settings.json");
        fs::create_dir_all(&directory).unwrap();
        fs::write(
            &settings_path,
            r#"{"settingsVersion":3,"appearance":"future-theme","locale":"en","documentZoom":130,"interfaceZoom":125,"currentFolder":"/tmp/milo","recentFiles":["/tmp/milo/a.md"],"recentFolders":["/tmp/milo"],"sidebarVisible":false,"sidebarWidth":300,"startupSession":{"activeDocumentPath":"/tmp/milo/a.md","openDocumentPaths":["/tmp/milo/a.md"]}}"#,
        ).unwrap();

        let restored = read_settings(&settings_path).unwrap();
        assert!(matches!(restored.appearance, AppearancePreference::System));
        assert_eq!(restored.recent_files, vec!["/tmp/milo/a.md"]);
        assert_eq!(restored.startup_session.open_document_paths, vec!["/tmp/milo/a.md"]);
        assert_eq!(restored.document_zoom, 130);
        assert_eq!(restored.sidebar_width, 300);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn warm_appearance_round_trips() {
        let directory = std::env::temp_dir().join(format!(
            "milo-settings-warm-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let settings_path = directory.join("settings.json");
        let mut settings = ApplicationSettings::default();
        settings.appearance = AppearancePreference::Warm;

        write_settings(&settings_path, &settings).unwrap();
        let restored = read_settings(&settings_path).unwrap();
        assert!(matches!(restored.appearance, AppearancePreference::Warm));
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn startup_session_stores_paths_not_markdown_bodies() {
        let directory = std::env::temp_dir().join(format!(
            "milo-session-settings-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        let settings_path = directory.join("settings.json");
        let mut settings = ApplicationSettings::default();
        settings.startup_session = StartupSession {
            active_document_path: Some("/tmp/essay.md".to_owned()),
            open_document_paths: vec!["/tmp/essay.md".to_owned()],
        };

        write_settings(&settings_path, &settings).unwrap();
        let stored = fs::read_to_string(&settings_path).unwrap();

        assert!(stored.contains("openDocumentPaths"));
        assert!(!stored.contains("An unpublished Markdown body must never be stored here."));
        assert!(!stored.contains("markdown\""));
        fs::remove_dir_all(directory).unwrap();
    }
}
