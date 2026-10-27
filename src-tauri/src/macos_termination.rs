//! Cocoa's terminate: (Quit menu, Dock Quit, OS termination request) does not
//! pass through Tao's ExitRequested. Install applicationShouldTerminate: on
//! the existing delegate, without replacing Tao's other application methods.
use std::{
    ffi::{c_char, c_void, CString},
    sync::OnceLock,
};
use tauri::AppHandle;
static APP: OnceLock<AppHandle> = OnceLock::new();

#[link(name = "objc")]
extern "C" {
    fn objc_getClass(name: *const c_char) -> *mut c_void;
    fn object_getClass(object: *mut c_void) -> *mut c_void;
    fn sel_registerName(name: *const c_char) -> *mut c_void;
    fn objc_msgSend();
    fn class_addMethod(
        class: *mut c_void,
        selector: *mut c_void,
        implementation: unsafe extern "C" fn(),
        types: *const c_char,
    ) -> bool;
}

unsafe extern "C" fn should_terminate(
    _delegate: *mut c_void,
    _selector: *mut c_void,
    _sender: *mut c_void,
) -> usize {
    if let Some(app) = APP.get() {
        crate::request_close(app, "quit");
    }
    0 // NSTerminateCancel; approved completion uses AppHandle::exit instead.
}

pub fn install(app: &AppHandle) -> Result<(), String> {
    APP.set(app.clone())
        .map_err(|_| "Termination delegate already installed.")?;
    // setup executes on the Cocoa main thread. All selectors below return
    // Objective-C objects, and should_terminate matches NSUInteger @:@ on 64-bit macOS.
    unsafe {
        let send: unsafe extern "C" fn(*mut c_void, *mut c_void) -> *mut c_void =
            std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        let selector = |name: &str| sel_registerName(CString::new(name).unwrap().as_ptr());
        let class = objc_getClass(c"NSApplication".as_ptr());
        let application = send(class, selector("sharedApplication"));
        let delegate = send(application, selector("delegate"));
        if delegate.is_null() {
            return Err("Cocoa application delegate unavailable.".into());
        }
        let implementation = std::mem::transmute::<
            unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> usize,
            unsafe extern "C" fn(),
        >(should_terminate);
        if !class_addMethod(
            object_getClass(delegate),
            selector("applicationShouldTerminate:"),
            implementation,
            c"Q@:@".as_ptr(),
        ) {
            return Err(
                "Cocoa termination delegate already defines applicationShouldTerminate:.".into(),
            );
        }
    }
    Ok(())
}
