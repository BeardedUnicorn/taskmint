//! `GET /api/v1/events`: the signed-in user's events, as server-sent events
//! named as the desktop app names its events, with their JSON payloads as
//! data. A stream that falls behind gets `resync`; one whose access ends is
//! closed (see `EventHub::disconnect`).

use std::convert::Infallible;
use std::time::Duration;

use axum::extract::State;
use axum::response::sse::{self, KeepAlive, Sse};
use futures_util::stream::{self, Stream};
use taskmint_core::command::Event;
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;

use super::extract::Caller;
use crate::events::resync;
use crate::state::AppState;

/// Often enough that proxies keep an idle stream open.
const KEEP_ALIVE: Duration = Duration::from_secs(15);

type Next = (Result<sse::Event, Infallible>, Receiver<Event>);

pub async fn events(
    caller: Caller,
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<sse::Event, Infallible>>> {
    let receiver = state.events.subscribe(caller.user().id);
    Sse::new(stream::unfold(receiver, next)).keep_alive(KeepAlive::new().interval(KEEP_ALIVE))
}

/// The stream's next event; none once it's closed.
async fn next(mut receiver: Receiver<Event>) -> Option<Next> {
    let event = match receiver.recv().await {
        Ok(event) => event,
        Err(RecvError::Lagged(missed)) => {
            tracing::debug!(missed, "an event stream fell behind");
            resync()
        }
        Err(RecvError::Closed) => return None,
    };
    let sent = sse::Event::default()
        .event(event.name)
        .data(event.payload.to_string());
    Some((Ok(sent), receiver))
}
