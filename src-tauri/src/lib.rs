mod file_system;
mod settings;

const LINK_P0_DIAGNOSTIC_LOG: &str = "/tmp/milo-link-p0.jsonl";

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter, Manager,
};

struct LaunchMarkdownFile(Option<String>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(LaunchMarkdownFile(launch_markdown_file()))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let file = SubmenuBuilder::new(app, "File")
                .item(&menu_item(app, "new-document", "New Document", "CmdOrCtrl+N")?)
                .item(&menu_item(app, "open-document", "Open…", "CmdOrCtrl+O")?)
                .item(&menu_item(app, "save-document", "Save", "CmdOrCtrl+S")?)
                .item(&menu_item(app, "save-as", "Save As…", "CmdOrCtrl+Shift+S")?)
                .separator()
                .item(&menu_item(app, "open-folder", "Open Folder…", "CmdOrCtrl+Shift+O")?)
                .build()?;
            let edit = SubmenuBuilder::new(app, "Edit")
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;
            let view = SubmenuBuilder::new(app, "View")
                .item(&menu_item(app, "toggle-sidebar", "Toggle Sidebar", "CmdOrCtrl+\\")?)
                .item(&menu_item(app, "toggle-focus-mode", "Focus Mode", "CmdOrCtrl+Shift+F")?)
                .separator()
                .item(&menu_item(app, "zoom-in", "Zoom In", "CmdOrCtrl++")?)
                .item(&menu_item(app, "zoom-out", "Zoom Out", "CmdOrCtrl+-")?)
                .item(&menu_item(app, "zoom-reset", "Actual Size", "CmdOrCtrl+0")?)
                .build()?;
            let format = SubmenuBuilder::new(app, "Format")
                .item(&menu_item(app, "format-bold", "Bold", "CmdOrCtrl+B")?)
                .item(&menu_item(app, "format-italic", "Italic", "CmdOrCtrl+I")?)
                .build()?;
            let help = SubmenuBuilder::new(app, "Help")
                .item(&PredefinedMenuItem::about(app, Some("About Milo"), None)?)
                .build()?;
            let menu = MenuBuilder::new(app)
                .item(&file)
                .item(&edit)
                .item(&view)
                .item(&format)
                .item(&help)
                .build()?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                let _ = app.emit("milo://command", event.id().0.clone());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            file_system::read_markdown_document,
            file_system::write_markdown_document,
            file_system::browse_markdown_folder,
            file_system::write_image_asset,
            settings::load_application_settings,
            settings::save_application_settings,
            append_link_p0_diagnostic_log,
            clear_link_p0_diagnostic_log,
            initial_launch_markdown_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building Milo");

    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Some(path) = markdown_path_from_file_url(&url) {
                    let _ = app.emit("milo://open-file", path);
                }
            }
        }
    });
}

#[tauri::command]
fn clear_link_p0_diagnostic_log() -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        std::fs::write(LINK_P0_DIAGNOSTIC_LOG, "")
            .map_err(|error| format!("Could not clear diagnostic log: {error}"))
    }
    #[cfg(not(debug_assertions))]
    Err("Link P0 diagnostics are only available in development builds.".to_owned())
}

#[tauri::command]
fn append_link_p0_diagnostic_log(entry: String) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        if entry.len() > 1_000_000 {
            return Err("Diagnostic entry exceeds the development safety limit.".to_owned());
        }
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(LINK_P0_DIAGNOSTIC_LOG)
            .map_err(|error| format!("Could not open diagnostic log: {error}"))?;
        file.write_all(entry.as_bytes())
            .and_then(|_| file.write_all(b"\n"))
            .map_err(|error| format!("Could not write diagnostic log: {error}"))
    }
    #[cfg(not(debug_assertions))]
    Err("Link P0 diagnostics are only available in development builds.".to_owned())
}

#[tauri::command]
fn initial_launch_markdown_file(file: tauri::State<'_, LaunchMarkdownFile>) -> Option<String> {
    file.0.clone()
}

fn launch_markdown_file() -> Option<String> {
    launch_markdown_file_from_arguments(std::env::args().skip(1))
}

fn launch_markdown_file_from_arguments(arguments: impl IntoIterator<Item = String>) -> Option<String> {
    arguments.into_iter().find(|argument| {
        std::path::Path::new(argument)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown"))
    })
}

fn markdown_path_from_file_url(url: &tauri::Url) -> Option<String> {
    if url.scheme() != "file" {
        return None;
    }

    let path = url.to_file_path().ok()?;
    let is_markdown = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown"));

    is_markdown.then(|| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{launch_markdown_file_from_arguments, markdown_path_from_file_url};

    #[test]
    fn accepts_markdown_launch_arguments_case_insensitively() {
        let file = launch_markdown_file_from_arguments([
            "--activate".to_owned(),
            "/Users/milo/Notes/Welcome.MARKDOWN".to_owned(),
        ]);

        assert_eq!(file.as_deref(), Some("/Users/milo/Notes/Welcome.MARKDOWN"));
    }

    #[test]
    fn ignores_non_markdown_launch_arguments() {
        let file = launch_markdown_file_from_arguments([
            "--activate".to_owned(),
            "/Users/milo/assets/logo.png".to_owned(),
            "/Users/milo/readme.txt".to_owned(),
        ]);

        assert_eq!(file, None);
    }

    #[test]
    fn accepts_only_local_markdown_file_urls() {
        let markdown_url = tauri::Url::parse("file:///Users/milo/Notes/with%20spaces.md").unwrap();
        let remote_url = tauri::Url::parse("https://milo.example/welcome.md").unwrap();

        assert_eq!(markdown_path_from_file_url(&markdown_url).as_deref(), Some("/Users/milo/Notes/with spaces.md"));
        assert_eq!(markdown_path_from_file_url(&remote_url), None);
    }
}

fn menu_item<R: tauri::Runtime, M: Manager<R>>(app: &M, id: &str, text: &str, accelerator: &str) -> tauri::Result<tauri::menu::MenuItem<R>> {
    MenuItemBuilder::with_id(id, text).accelerator(accelerator).build(app)
}
