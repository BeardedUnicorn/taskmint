//! Each user's open event streams (`GET /api/v1/events`). A change's events
//! are published once it's committed, to every stream of the user who made
//! it. Streams live in this process: one server instance serves them all.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

use taskmint_core::command::Event;
use taskmint_core::contract::events::RESYNC;
use tokio::sync::broadcast;
use uuid::Uuid;

/// Events a stream may fall behind by before it's told to resync.
const BUFFER: usize = 64;

#[derive(Default)]
pub struct EventHub {
    streams: Mutex<Streams>,
}

#[derive(Default)]
struct Streams {
    by_user: HashMap<Uuid, broadcast::Sender<Event>>,
    /// The server is shutting down: no stream opens again.
    closed: bool,
}

/// `resync`: the stream may have missed events, so the client reads
/// everything again.
pub fn resync() -> Event {
    Event::new(RESYNC, serde_json::json!({}))
}

impl EventHub {
    pub fn subscribe(&self, user: Uuid) -> broadcast::Receiver<Event> {
        let mut streams = self.streams();
        if streams.closed {
            // Its sender is gone, so it ends at once
            return broadcast::channel(1).1;
        }
        streams
            .by_user
            .entry(user)
            .or_insert_with(|| broadcast::channel(BUFFER).0)
            .subscribe()
    }

    pub fn publish(&self, user: Uuid, events: &[Event]) {
        let mut streams = self.streams();
        let Some(sender) = streams.by_user.get(&user) else {
            return;
        };
        if sender.receiver_count() == 0 {
            // Every stream has closed
            streams.by_user.remove(&user);
            return;
        }
        for event in events {
            // Fails only if the last stream closed just now
            let _ = sender.send(event.clone());
        }
    }

    /// Ends the user's streams, after who may act as them changed (they
    /// were disabled, or signed out, or a password or token was revoked).
    /// A client still signed in reconnects; one that isn't can't.
    pub fn disconnect(&self, user: Uuid) {
        self.streams().by_user.remove(&user);
    }

    /// Ends every stream, and any opened later, as the server shuts down:
    /// a stream never ends by itself, so it would hold the graceful
    /// shutdown open until the process is killed.
    pub fn close(&self) {
        let mut streams = self.streams();
        streams.closed = true;
        streams.by_user.clear();
    }

    /// How many users have a stream open, for tests.
    pub fn users(&self) -> usize {
        self.streams().by_user.len()
    }

    /// The streams. A thread that panicked while holding the lock left them
    /// whole (every change to them is a single call).
    fn streams(&self) -> MutexGuard<'_, Streams> {
        self.streams.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::sync::broadcast::error::TryRecvError;

    fn event(name: &'static str) -> Event {
        Event::new(name, serde_json::json!({}))
    }

    #[test]
    fn events_reach_only_their_users_streams() {
        let hub = EventHub::default();
        let (alice, bob) = (Uuid::new_v4(), Uuid::new_v4());
        let mut first = hub.subscribe(alice);
        let mut second = hub.subscribe(alice);
        let mut other = hub.subscribe(bob);

        hub.publish(alice, &[event("a"), event("b")]);

        for stream in [&mut first, &mut second] {
            assert_eq!(stream.try_recv().unwrap().name, "a");
            assert_eq!(stream.try_recv().unwrap().name, "b");
        }
        assert_eq!(other.try_recv(), Err(TryRecvError::Empty));
        // Nobody listening: nothing to do
        hub.publish(Uuid::new_v4(), &[event("a")]);
    }

    #[test]
    fn a_user_whose_streams_closed_is_forgotten_at_the_next_event() {
        let hub = EventHub::default();
        let user = Uuid::new_v4();
        drop(hub.subscribe(user));
        assert_eq!(hub.users(), 1);
        hub.publish(user, &[event("a")]);
        assert_eq!(hub.users(), 0);
    }

    #[test]
    fn disconnecting_ends_the_users_streams() {
        let hub = EventHub::default();
        let user = Uuid::new_v4();
        let mut stream = hub.subscribe(user);
        hub.publish(user, &[event("a")]);
        hub.disconnect(user);
        // What was sent still arrives, then the stream ends
        assert_eq!(stream.try_recv().unwrap().name, "a");
        assert_eq!(stream.try_recv(), Err(TryRecvError::Closed));
        assert_eq!(resync().name, "resync");
    }

    #[test]
    fn closing_ends_every_stream_for_good() {
        let hub = EventHub::default();
        let user = Uuid::new_v4();
        let mut open = hub.subscribe(user);
        hub.close();
        assert_eq!(open.try_recv(), Err(TryRecvError::Closed));
        assert_eq!(hub.users(), 0);

        // A stream opened while the server stops ends at once
        let mut late = hub.subscribe(user);
        hub.publish(user, &[event("a")]);
        assert_eq!(late.try_recv(), Err(TryRecvError::Closed));
        assert_eq!(hub.users(), 0);
    }

    #[test]
    fn a_poisoned_lock_still_works() {
        let hub = std::sync::Arc::new(EventHub::default());
        let poisoner = hub.clone();
        let _ = std::thread::spawn(move || {
            let _held = poisoner.streams.lock().unwrap();
            panic!("poison the lock");
        })
        .join();
        assert!(hub.streams.is_poisoned());
        hub.subscribe(Uuid::new_v4());
        assert_eq!(hub.users(), 1);
    }
}
