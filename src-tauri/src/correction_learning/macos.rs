//! A bounded observer for the exact text field receiving a paste. All AX objects
//! stay on one worker thread; no global keyboard listener or clipboard polling.
use super::{observe, spelling_edit};
use std::{
    ffi::{c_void, CString},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc,
    },
    time::Duration,
};
use tauri::AppHandle;
type Ref = *const c_void;
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXUIElementCreateSystemWide() -> Ref;
    fn AXUIElementCopyAttributeValue(element: Ref, attribute: Ref, value: *mut Ref) -> i32;
    fn AXUIElementSetMessagingTimeout(element: Ref, timeout: f32) -> i32;
    fn AXUIElementGetPid(element: Ref, pid: *mut i32) -> i32;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(value: Ref);
    fn CFEqual(a: Ref, b: Ref) -> u8;
    fn CFGetTypeID(value: Ref) -> usize;
    fn CFStringGetTypeID() -> usize;
    fn CFStringCreateWithCString(allocator: Ref, text: *const i8, encoding: u32) -> Ref;
    fn CFStringGetLength(value: Ref) -> isize;
    fn CFStringGetCString(value: Ref, buffer: *mut i8, size: isize, encoding: u32) -> u8;
}
struct Owned(Ref);
impl Drop for Owned {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe { CFRelease(self.0) }
        }
    }
}
impl Owned {
    fn attribute(&self, name: &str) -> Option<Self> {
        let name = CString::new(name).ok()?;
        let key = Owned(unsafe {
            CFStringCreateWithCString(std::ptr::null(), name.as_ptr(), 0x08000100)
        });
        let mut value = std::ptr::null();
        if unsafe { AXUIElementCopyAttributeValue(self.0, key.0, &mut value) } != 0
            || value.is_null()
        {
            return None;
        }
        Some(Owned(value))
    }
    fn string(&self, name: &str) -> Option<String> {
        let value = self.attribute(name)?;
        if unsafe { CFGetTypeID(value.0) != CFStringGetTypeID() } {
            return None;
        }
        let len = unsafe { CFStringGetLength(value.0) };
        if !(0..=16384).contains(&len) {
            return None;
        }
        let mut bytes = vec![0u8; len as usize * 4 + 1];
        if unsafe {
            CFStringGetCString(
                value.0,
                bytes.as_mut_ptr().cast(),
                bytes.len() as isize,
                0x08000100,
            )
        } == 0
        {
            return None;
        }
        let end = bytes.iter().position(|b| *b == 0)?;
        String::from_utf8(bytes[..end].to_vec()).ok()
    }
}
static GENERATION: AtomicU64 = AtomicU64::new(0);
fn enabled(app: &AppHandle) -> bool {
    crate::studio::get_studio_settings(app.clone())
        .map(|s| s.learn_corrections)
        .unwrap_or(false)
}
pub fn prepare(app: &AppHandle) -> Option<mpsc::Sender<String>> {
    let generation = GENERATION.fetch_add(1, Ordering::Relaxed) + 1;
    if !enabled(app) {
        return None;
    }
    let (sender, pasted) = mpsc::channel::<String>();
    let (ready, captured) = mpsc::channel();
    let app = app.clone();
    std::thread::spawn(move || {
        let system = Owned(unsafe { AXUIElementCreateSystemWide() });
        if system.0.is_null() {
            return;
        }
        unsafe {
            AXUIElementSetMessagingTimeout(system.0, 0.15);
        }
        let Some(field) = system.attribute("AXFocusedUIElement") else {
            return;
        };
        unsafe {
            AXUIElementSetMessagingTimeout(field.0, 0.15);
        }
        let mut pid = 0;
        if unsafe { AXUIElementGetPid(field.0, &mut pid) } != 0 || pid == std::process::id() as i32
        {
            return;
        }
        let Some(role) = field.string("AXRole") else {
            return;
        };
        if !["AXTextField", "AXTextArea"].contains(&role.as_str())
            || field.string("AXSubrole").as_deref() == Some("AXSecureTextField")
        {
            return;
        }
        if field.string("AXValue").is_none() {
            return;
        }
        if ready.send(()).is_err() {
            return;
        }
        let Ok(original) = pasted.recv_timeout(Duration::from_secs(3)) else {
            return;
        };
        let original = original.trim();
        if original.is_empty() || original.len() > 8192 {
            return;
        }
        std::thread::sleep(Duration::from_millis(300));
        let Some(baseline) = field.string("AXValue") else {
            return;
        };
        let matches = baseline.match_indices(original).take(2).collect::<Vec<_>>();
        if matches.len() != 1 {
            return;
        }
        let start = matches[0].0;
        let prefix = &baseline[..start];
        let suffix = &baseline[start + original.len()..];
        let mut previous = None;
        let mut stable = 0;
        for _ in 0..90 {
            std::thread::sleep(Duration::from_secs(1));
            if GENERATION.load(Ordering::Relaxed) != generation || !enabled(&app) {
                return;
            }
            let Some(focus) = system.attribute("AXFocusedUIElement") else {
                return;
            };
            if unsafe { CFEqual(focus.0, field.0) } == 0 {
                return;
            }
            let Some(value) = field.string("AXValue") else {
                return;
            };
            let Some(segment) = value
                .strip_prefix(prefix)
                .and_then(|s| s.strip_suffix(suffix))
            else {
                return;
            };
            let candidate = spelling_edit(original, segment);
            if candidate == previous {
                stable += 1;
            } else {
                previous = candidate.clone();
                stable = 0;
            }
            if stable >= 3 {
                if let Some((from, to)) = candidate {
                    if observe(&app, from, to).is_err() {
                        log::warn!("Could not save local spelling observation");
                    }
                    return;
                }
            }
        }
    });
    captured.recv_timeout(Duration::from_millis(250)).ok()?;
    Some(sender)
}
