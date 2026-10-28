use serde::Serialize;
use std::sync::Mutex;

#[derive(Clone, Serialize)]
pub struct OpenRequest {
    id: u64,
    path: String,
}

#[derive(Default)]
pub struct OpenQueue(Mutex<Pending>);

#[derive(Default)]
struct Pending {
    next_id: u64,
    requests: Vec<OpenRequest>,
}

impl OpenQueue {
    fn pending(&self) -> Vec<OpenRequest> {
        self.0.lock().unwrap().requests.clone()
    }

    fn acknowledge(&self, id: u64) {
        self.0.lock().unwrap().requests.retain(|r| r.id != id);
    }

    pub fn enqueue(&self, path: String) {
        let mut state = self.0.lock().unwrap();
        if state.requests.iter().any(|request| request.path == path) {
            return;
        }
        state.next_id += 1;
        let id = state.next_id;
        state.requests.push(OpenRequest { id, path });
    }
}

// Reads do not remove requests. Registration/recovery can outlive wake-up events.
#[tauri::command]
pub fn pending_markdown_open_requests(queue: tauri::State<'_, OpenQueue>) -> Vec<OpenRequest> {
    queue.pending()
}

#[tauri::command]
pub fn acknowledge_markdown_open_request(queue: tauri::State<'_, OpenQueue>, id: u64) {
    queue.acknowledge(id);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retains_early_and_multiple_opens_until_each_is_acknowledged() {
        let queue = OpenQueue::default();
        queue.enqueue("/notes/a.md".into());
        queue.enqueue("/notes/b.md".into());
        queue.enqueue("/notes/a.md".into());
        let snapshot = queue.pending();
        assert_eq!(snapshot.len(), 2);
        assert_eq!(snapshot[0].path, "/notes/a.md");
        assert_eq!(queue.pending().len(), 2);
        queue.acknowledge(snapshot[0].id);
        queue.enqueue("/notes/a.md".into());
        queue.acknowledge(snapshot[0].id);
        let pending = queue.pending();
        assert_eq!(pending.len(), 2);
        assert_eq!(pending[0].path, "/notes/b.md");
        assert_eq!(pending[1].path, "/notes/a.md");
        assert_ne!(pending[1].id, snapshot[0].id);
    }
}
