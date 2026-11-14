//! Ordered, cancellation-safe disk transactions outside the native/event loop.
//! A single document lane also covers path aliases and recovery sidecars. Keep
//! the guard in the worker: cancelling an IPC future must not unlock live I/O.
use std::sync::{Arc, OnceLock};
use tauri::async_runtime::Mutex;

pub enum Lane {
    Documents,
    Settings,
    Drafts,
}

fn lane(kind: Lane) -> Arc<Mutex<()>> {
    static DOCUMENTS: OnceLock<Arc<Mutex<()>>> = OnceLock::new();
    static SETTINGS: OnceLock<Arc<Mutex<()>>> = OnceLock::new();
    static DRAFTS: OnceLock<Arc<Mutex<()>>> = OnceLock::new();
    let slot = match kind {
        Lane::Documents => &DOCUMENTS,
        Lane::Settings => &SETTINGS,
        Lane::Drafts => &DRAFTS,
    };
    slot.get_or_init(|| Arc::new(Mutex::new(()))).clone()
}

pub async fn run<T: Send + 'static>(
    kind: Lane,
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let guard = lane(kind).lock_owned().await;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = guard;
        operation()
    })
    .await
    .map_err(|error| format!("Disk task could not complete: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn queued_transactions_never_overlap_and_failures_release_the_lane() {
        tauri::async_runtime::block_on(async {
            let active = Arc::new(AtomicUsize::new(0));
            let mut jobs = Vec::new();
            for i in 0..12 {
                let active = active.clone();
                jobs.push(tauri::async_runtime::spawn(async move {
                    run(Lane::Documents, move || {
                        assert_eq!(active.fetch_add(1, Ordering::SeqCst), 0);
                        std::thread::sleep(std::time::Duration::from_millis(2));
                        assert_eq!(active.fetch_sub(1, Ordering::SeqCst), 1);
                        if i == 3 {
                            Err("injected I/O failure".into())
                        } else {
                            Ok(i)
                        }
                    })
                    .await
                }));
            }
            let mut failed = 0;
            for job in jobs {
                failed += usize::from(job.await.unwrap().is_err());
            }
            assert_eq!(failed, 1);
            assert_eq!(active.load(Ordering::SeqCst), 0);
            assert_eq!(run(Lane::Documents, || Ok(42)).await.unwrap(), 42);
        });
    }
}
