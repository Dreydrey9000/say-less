use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

/// A content-free clock shared by the worker and the queued paste callback.
#[derive(Clone, Copy)]
pub(crate) struct DictationTiming {
    pub(crate) id: u64,
    started: Instant,
}

impl DictationTiming {
    pub(crate) fn new(started: Instant) -> Self {
        Self {
            id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
            started,
        }
    }

    pub(crate) fn elapsed(&self) -> Duration {
        self.elapsed_at(Instant::now())
    }

    fn elapsed_at(&self, now: Instant) -> Duration {
        now.duration_since(self.started)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queued_callback_keeps_original_clock_and_correlation() {
        let started = Instant::now();
        let worker = DictationTiming::new(started);
        let paste_callback = worker;
        assert_eq!(worker.id, paste_callback.id);
        assert_eq!(
            worker.elapsed_at(started + Duration::from_secs(2)),
            Duration::from_secs(2)
        );
        assert_eq!(
            paste_callback.elapsed_at(started + Duration::from_secs(5)),
            Duration::from_secs(5)
        );
    }

    #[test]
    fn operations_have_distinct_ids_even_with_same_start_time() {
        let started = Instant::now();
        assert_ne!(
            DictationTiming::new(started).id,
            DictationTiming::new(started).id
        );
    }

    #[test]
    fn elapsed_includes_work_before_callback_begins() {
        let timing = DictationTiming::new(Instant::now() - Duration::from_secs(1));
        assert!(timing.elapsed() >= Duration::from_secs(1));
    }
}
