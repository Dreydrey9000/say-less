use std::time::Duration;

pub(crate) const SAMPLE_RATE: usize = 16_000;
const FRAME_SAMPLES: usize = 320;
const MAX_SAMPLES: usize = SAMPLE_RATE * 10;

pub(crate) fn validate_input(samples: usize, repeat: Option<usize>) -> Result<(), &'static str> {
    if repeat.unwrap_or(1) != 1 {
        return Err("stream replay requires exactly one run");
    }
    if samples == 0 || samples > MAX_SAMPLES {
        return Err("stream replay requires nonempty audio of at most 10 seconds");
    }
    Ok(())
}

/// Feed every chunk, including the final partial chunk, then wait until its
/// cumulative audio deadline. The caller supplies a monotonic clock wait.
pub(crate) fn feed_paced(
    samples: &[f32],
    mut feed: impl FnMut(&[f32]),
    mut wait_until: impl FnMut(Duration),
) -> usize {
    let mut fed = 0;
    let mut frames = 0;
    for frame in samples.chunks(FRAME_SAMPLES) {
        feed(frame);
        fed += frame.len();
        frames += 1;
        wait_until(Duration::from_secs_f64(fed as f64 / SAMPLE_RATE as f64));
    }
    frames
}

pub(crate) enum ReplayOutcome {
    Complete(String),
    NoStream,
    Empty,
    Error,
}

impl ReplayOutcome {
    pub(crate) fn from_result<E>(result: Result<Option<String>, E>) -> Self {
        match result {
            Ok(Some(text)) if text.trim().is_empty() => Self::Empty,
            Ok(Some(text)) => Self::Complete(text),
            Ok(None) => Self::NoStream,
            Err(_) => Self::Error,
        }
    }

    pub(crate) fn label(&self) -> &'static str {
        match self {
            Self::Complete(_) => "complete",
            Self::NoStream => "no_stream",
            Self::Empty => "empty",
            Self::Error => "error",
        }
    }

    pub(crate) fn text(&self) -> &str {
        match self {
            Self::Complete(text) => text,
            _ => "",
        }
    }

    pub(crate) fn exit_code(&self) -> i32 {
        if matches!(self, Self::Complete(_)) {
            0
        } else {
            1
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn validates_duration_and_single_run_before_loading() {
        assert!(validate_input(1, None).is_ok());
        assert!(validate_input(MAX_SAMPLES, Some(1)).is_ok());
        assert!(validate_input(0, None).is_err());
        assert!(validate_input(MAX_SAMPLES + 1, None).is_err());
        assert!(validate_input(320, Some(0)).is_err());
        assert!(validate_input(320, Some(2)).is_err());
    }

    #[test]
    fn partial_frame_uses_exact_cumulative_deadline_and_preserves_samples() {
        let samples: Vec<f32> = (0..641).map(|n| n as f32).collect();
        let received = RefCell::new(Vec::new());
        let events = RefCell::new(Vec::new());
        let frames = feed_paced(
            &samples,
            |frame| {
                received.borrow_mut().extend_from_slice(frame);
                events.borrow_mut().push(("feed", frame.len() as u64));
            },
            |deadline| {
                events
                    .borrow_mut()
                    .push(("wait", deadline.as_micros() as u64))
            },
        );
        assert_eq!(frames, 3);
        assert_eq!(*received.borrow(), samples);
        assert_eq!(
            *events.borrow(),
            vec![
                ("feed", 320),
                ("wait", 20_000),
                ("feed", 320),
                ("wait", 40_000),
                ("feed", 1),
                ("wait", 40_062)
            ]
        );
    }

    #[test]
    fn absent_empty_and_error_results_cannot_report_streaming_success() {
        let cases = [
            (Ok(None), "no_stream"),
            (Ok(Some(" \n".into())), "empty"),
            (Err(()), "error"),
        ];
        for (result, expected) in cases {
            let outcome = ReplayOutcome::from_result(result);
            assert_eq!(outcome.label(), expected);
            assert_eq!(outcome.exit_code(), 1);
            assert!(outcome.text().is_empty());
        }
        let outcome = ReplayOutcome::from_result(Ok::<_, ()>(Some("Synthetic words.".into())));
        assert_eq!(outcome.label(), "complete");
        assert_eq!(outcome.text(), "Synthetic words.");
        assert_eq!(outcome.exit_code(), 0);
    }
}
