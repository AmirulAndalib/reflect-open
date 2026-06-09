use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, State};

/// Quit-time flush handshake (the save pipeline's last line of defense).
///
/// macOS ⌘Q requests app termination without closing the window first, so the
/// frontend's close-requested flush never runs and a debounced note save still
/// inside its window would be lost. The run loop (lib.rs) defers that exit
/// once and emits `app:quit-requested`; the frontend flushes dirty buffers and
/// calls `quit_confirm`, which marks the flush done and exits for real.
#[derive(Default)]
pub struct QuitState {
    flushed: AtomicBool,
}

impl QuitState {
    pub fn flushed(&self) -> bool {
        self.flushed.load(Ordering::SeqCst)
    }
}

/// Confirm a deferred quit: the frontend has flushed, exit immediately.
#[tauri::command]
pub fn quit_confirm(app: AppHandle, state: State<'_, QuitState>) {
    state.flushed.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_unflushed_and_latches() {
        let state = QuitState::default();
        assert!(!state.flushed());
        state.flushed.store(true, Ordering::SeqCst);
        assert!(state.flushed());
    }
}
