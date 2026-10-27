//! Work that repeats on an interval (the tray's clock, the idle monitor), on
//! a thread of its own that stops when asked.

use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread::JoinHandle;
use std::time::Duration;

pub struct Ticker {
    stop: mpsc::Sender<()>,
    thread: JoinHandle<()>,
}

impl Ticker {
    /// Calls `tick` every `interval`, starting one interval from now.
    pub fn start(
        name: &str,
        interval: Duration,
        mut tick: impl FnMut() + Send + 'static,
    ) -> Ticker {
        let (stop, stopped) = mpsc::channel();
        let thread = std::thread::Builder::new()
            .name(format!("taskmint-{}", name))
            .spawn(move || {
                while let Err(RecvTimeoutError::Timeout) = stopped.recv_timeout(interval) {
                    tick();
                }
            })
            .expect("the OS can start a thread");
        Ticker { stop, thread }
    }

    /// Stops ticking and waits for a tick in progress to finish.
    pub fn stop(self) {
        let _ = self.stop.send(());
        let _ = self.thread.join();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn it_ticks_until_stopped() {
        let ticks = Arc::new(AtomicUsize::new(0));
        let counter = ticks.clone();
        let ticker = Ticker::start("test", Duration::from_millis(1), move || {
            counter.fetch_add(1, Ordering::SeqCst);
        });
        while ticks.load(Ordering::SeqCst) < 3 {
            std::thread::sleep(Duration::from_millis(1));
        }
        ticker.stop();
        let after = ticks.load(Ordering::SeqCst);
        std::thread::sleep(Duration::from_millis(10));
        assert_eq!(ticks.load(Ordering::SeqCst), after);
    }
}
