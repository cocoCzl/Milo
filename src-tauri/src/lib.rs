mod draft_recovery;
mod file_system;
#[cfg(target_os = "macos")]
mod macos_safe_save;
#[cfg(target_os = "macos")]
mod macos_termination;
mod settings;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    Emitter, Manager,
};

#[derive(Default)]
struct CloseCoordinator(std::sync::Mutex<CloseState>);
#[derive(Default)]
struct CloseState {
    pending: Option<String>,
    approved_exit: bool,
    frontend_ready: bool,
}

fn request_close(app: &tauri::AppHandle, kind: &str) {
    let state = app.state::<CloseCoordinator>();
    let mut state = state.0.lock().unwrap();
    if state.pending.is_some() {
        return;
    }
    state.pending = Some(kind.to_owned());
    if state.frontend_ready {
        let _ = app.emit("milo://request-close", kind);
    }
    drop(state);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn close_coordinator_ready(app: tauri::AppHandle) {
    let coordinator = app.state::<CloseCoordinator>();
    let mut state = coordinator.0.lock().unwrap();
    state.frontend_ready = true;
    if let Some(kind) = &state.pending {
        let _ = app.emit("milo://request-close", kind);
    }
}

#[tauri::command]
fn cancel_close(state: tauri::State<'_, CloseCoordinator>) {
    state.0.lock().unwrap().pending = None;
}

#[tauri::command]
fn complete_close(app: tauri::AppHandle, kind: String) -> Result<(), String> {
    let coordinator = app.state::<CloseCoordinator>();
    let mut state = coordinator.0.lock().unwrap();
    if state.pending.as_deref() != Some(kind.as_str()) {
        return Err("No matching close request.".into());
    }
    state.pending = None;
    if kind == "quit" {
        state.approved_exit = true;
        drop(state);
        app.exit(0);
    } else if let Some(window) = app.get_webview_window("main") {
        drop(state);
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

struct LaunchMarkdownFile(Option<String>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(CloseCoordinator::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                request_close(window.app_handle(), "window");
            }
        })
        .manage(LaunchMarkdownFile(launch_markdown_file()))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            macos_termination::install(app.handle()).map_err(std::io::Error::other)?;
            let file = SubmenuBuilder::new(app, "File")
                .item(&menu_item(
                    app,
                    "new-document",
                    "New Document",
                    "CmdOrCtrl+N",
                )?)
                .item(&menu_item(app, "open-document", "Open…", "CmdOrCtrl+O")?)
                .item(&menu_item(app, "save-document", "Save", "CmdOrCtrl+S")?)
                .item(&menu_item(app, "save-as", "Save As…", "CmdOrCtrl+Shift+S")?)
                .item(&PredefinedMenuItem::close_window(
                    app,
                    Some("Close Window"),
                )?)
                .separator()
                .item(&menu_item(
                    app,
                    "open-folder",
                    "Open Folder…",
                    "CmdOrCtrl+Shift+O",
                )?)
                .build()?;
            let edit = SubmenuBuilder::new(app, "Edit")
                .item(&menu_item(
                    app,
                    "find-document",
                    "Find in Document…",
                    "CmdOrCtrl+F",
                )?)
                .separator()
                .item(&PredefinedMenuItem::undo(app, None)?)
                .item(&PredefinedMenuItem::redo(app, None)?)
                .separator()
                .item(&PredefinedMenuItem::cut(app, None)?)
                .item(&PredefinedMenuItem::copy(app, None)?)
                .item(&PredefinedMenuItem::paste(app, None)?)
                .item(&PredefinedMenuItem::select_all(app, None)?)
                .build()?;
            let view = SubmenuBuilder::new(app, "View")
                .item(&menu_item(
                    app,
                    "toggle-sidebar",
                    "Toggle Sidebar",
                    "CmdOrCtrl+\\",
                )?)
                .item(&menu_item(
                    app,
                    "toggle-focus-mode",
                    "Focus Mode",
                    "CmdOrCtrl+Shift+F",
                )?)
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
            let application = SubmenuBuilder::new(app, "Milo")
                .item(&PredefinedMenuItem::about(app, Some("About Milo"), None)?)
                .separator()
                .item(&PredefinedMenuItem::quit(app, Some("Quit Milo"))?)
                .build()?;
            let menu = MenuBuilder::new(app)
                .item(&application)
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
            close_coordinator_ready,
            cancel_close,
            complete_close,
            draft_recovery::read_draft_recovery,
            draft_recovery::write_draft_recovery,
            file_system::read_markdown_document,
            file_system::write_markdown_document,
            file_system::write_markdown_document_safe_v2,
            file_system::recover_markdown_document_safe_v2,
            file_system::browse_markdown_folder,
            file_system::write_image_asset,
            settings::load_application_settings,
            settings::save_application_settings,
            initial_launch_markdown_file
        ])
        .build(tauri::generate_context!())
        .expect("error while building Milo");

    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { ref api, .. } = event {
            if !app
                .state::<CloseCoordinator>()
                .0
                .lock()
                .unwrap()
                .approved_exit
            {
                api.prevent_exit();
                request_close(app, "quit");
            }
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Some(path) = markdown_path_from_file_url(&url) {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    let _ = app.emit("milo://open-file", path);
                }
            }
        }
    });
}

#[tauri::command]
fn initial_launch_markdown_file(file: tauri::State<'_, LaunchMarkdownFile>) -> Option<String> {
    file.0.clone()
}

fn launch_markdown_file() -> Option<String> {
    launch_markdown_file_from_arguments(std::env::args().skip(1))
}

fn launch_markdown_file_from_arguments(
    arguments: impl IntoIterator<Item = String>,
) -> Option<String> {
    arguments.into_iter().find(|argument| {
        std::path::Path::new(argument)
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
            })
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
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        });

    is_markdown.then(|| path.to_string_lossy().into_owned())
}

fn menu_item<R: tauri::Runtime, M: Manager<R>>(
    app: &M,
    id: &str,
    text: &str,
    accelerator: &str,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    MenuItemBuilder::with_id(id, text)
        .accelerator(accelerator)
        .build(app)
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

        assert_eq!(
            markdown_path_from_file_url(&markdown_url).as_deref(),
            Some("/Users/milo/Notes/with spaces.md")
        );
        assert_eq!(markdown_path_from_file_url(&remote_url), None);
    }
}
