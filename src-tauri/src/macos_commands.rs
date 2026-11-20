//! Route Save/Quit before WKWebView's text input context sees the command key.
//! Forward every other event to Tao's original sendEvent: implementation.
use std::{
    ffi::{c_char, c_void},
    sync::OnceLock,
};
use tauri::{AppHandle, Emitter, Manager};

type SendEvent = unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void);
static ORIGINAL: OnceLock<SendEvent> = OnceLock::new();
static APP: OnceLock<AppHandle> = OnceLock::new();
static MAIN_WINDOW: OnceLock<usize> = OnceLock::new();

const COMMAND: usize = 1 << 20;
const OTHER_MODIFIERS: usize = (1 << 17) | (1 << 18) | (1 << 19);

fn command(character: u16, modifiers: usize) -> Option<&'static str> {
    if modifiers & COMMAND == 0 || modifiers & OTHER_MODIFIERS != 0 {
        return None;
    }
    match character {
        0x73 | 0x53 => Some("save-document"),
        0x71 | 0x51 => Some("quit"),
        _ => None,
    }
}

#[link(name = "objc")]
extern "C" {
    fn objc_getClass(name: *const c_char) -> *mut c_void;
    fn object_getClass(object: *mut c_void) -> *mut c_void;
    fn sel_registerName(name: *const c_char) -> *mut c_void;
    fn objc_msgSend();
    fn class_getInstanceMethod(class: *mut c_void, selector: *mut c_void) -> *mut c_void;
    fn method_getImplementation(method: *mut c_void) -> SendEvent;
    fn method_getTypeEncoding(method: *mut c_void) -> *const c_char;
    fn class_replaceMethod(
        class: *mut c_void,
        selector: *mut c_void,
        implementation: SendEvent,
        types: *const c_char,
    ) -> *mut c_void;
}

unsafe extern "C" fn send_event(
    application: *mut c_void,
    selector: *mut c_void,
    event: *mut c_void,
) {
    // Cocoa invokes this on its main thread. These selectors/signatures are
    // public AppKit APIs; object pointers are borrowed only for this dispatch.
    let object: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
        std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
    let number: unsafe extern "C" fn(*mut c_void, *mut c_void) -> usize =
        std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
    let boolean: unsafe extern "C" fn(*mut c_void, *mut c_void) -> bool =
        std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
    let sel = |name: &std::ffi::CStr| sel_registerName(name.as_ptr());
    #[cfg(feature = "diagnostics")]
    if [10, 11, 12].contains(&number(event, sel(c"type"))) {
        let window = object(application, sel(c"keyWindow"));
        if !window.is_null() && MAIN_WINDOW.get() == Some(&(window as usize)) {
            let responder = object(window, sel(c"firstResponder"));
            let responds: unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> bool =
                std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
            let supports_marked = !responder.is_null()
                && responds(
                    responder,
                    sel(c"respondsToSelector:"),
                    sel(c"hasMarkedText"),
                );
            crate::open_profile::input_event(
                "appkit:key-dispatch",
                serde_json::json!({
                    "type": number(event, sel(c"type")), "flags": number(event, sel(c"modifierFlags")),
                    "markedSupported": supports_marked,
                    "marked": supports_marked && boolean(responder, sel(c"hasMarkedText")),
                }),
            );
        }
    }
    if number(event, sel(c"type")) == 10 {
        let flags = number(event, sel(c"modifierFlags"));
        if flags & COMMAND != 0 && flags & OTHER_MODIFIERS == 0 {
            let window = object(event, sel(c"window"));
            // File/save panels keep their own native shortcuts. Do not route
            // commands from another window, a sheet, or a background app.
            if !window.is_null()
                && MAIN_WINDOW.get() == Some(&(window as usize))
                && object(application, sel(c"keyWindow")) == window
                && object(window, sel(c"attachedSheet")).is_null()
            {
                let characters = object(event, sel(c"charactersIgnoringModifiers"));
                if !characters.is_null() && number(characters, sel(c"length")) == 1 {
                    let character: unsafe extern "C" fn(*mut c_void, *mut c_void, usize) -> u16 =
                        std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
                    if let Some(command) =
                        command(character(characters, sel(c"characterAtIndex:"), 0), flags)
                    {
                        if !boolean(event, sel(c"isARepeat")) {
                            if let Some(app) = APP.get() {
                                if command == "quit" {
                                    crate::request_close(app, "quit", "appkit-command");
                                } else {
                                    let _ = app.emit("milo://command", command);
                                }
                            }
                        }
                        // Consumed once. Never also forward s/q to the IME or
                        // dispatch the same command through the native menu.
                        return;
                    }
                }
            }
        }
    }
    if let Some(original) = ORIGINAL.get() {
        original(application, selector, event);
    }
}

pub fn install(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window unavailable for native commands.")?;
    let window = window.ns_window().map_err(|error| error.to_string())?;
    APP.set(app.clone())
        .map_err(|_| "Native commands already installed.")?;
    MAIN_WINDOW
        .set(window as usize)
        .map_err(|_| "Native command window already installed.")?;
    // setup is on the main thread. Replace only the concrete application
    // class's implementation, preserving Tao's Cmd-keyup handling in ORIGINAL.
    unsafe {
        let object: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        let application = object(
            objc_getClass(c"NSApplication".as_ptr()),
            sel_registerName(c"sharedApplication".as_ptr()),
        );
        let class = object_getClass(application);
        let selector = sel_registerName(c"sendEvent:".as_ptr());
        let method = class_getInstanceMethod(class, selector);
        if method.is_null() {
            return Err("Cocoa sendEvent: unavailable.".into());
        }
        ORIGINAL
            .set(method_getImplementation(method))
            .map_err(|_| "Original event dispatcher already installed.")?;
        class_replaceMethod(class, selector, send_event, method_getTypeEncoding(method));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_only_save_and_quit_with_command() {
        assert_eq!(command('s' as u16, COMMAND), Some("save-document"));
        assert_eq!(command('q' as u16, COMMAND), Some("quit"));
        assert_eq!(
            command('S' as u16, COMMAND | (1 << 16)),
            Some("save-document")
        );
        for modifier in [1 << 17, 1 << 18, 1 << 19] {
            assert_eq!(command('s' as u16, COMMAND | modifier), None);
            assert_eq!(command('q' as u16, COMMAND | modifier), None);
        }
        for character in ['s', 'q', 'z', 'v', '中'] {
            assert_eq!(command(character as u16, 0), None);
        }
        assert_eq!(command('z' as u16, COMMAND), None);
        assert_eq!(command('v' as u16, COMMAND), None);
    }
}
