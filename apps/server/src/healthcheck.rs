//! `taskmint-server healthcheck`: the container image has no shell or curl,
//! so Docker's HEALTHCHECK runs the binary itself against `/healthz`.

use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;

use axum::body::Bytes;
use http_body_util::Empty;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;

const TIMEOUT: Duration = Duration::from_secs(5);

/// Whether the server listening on `bind` answers `/healthz` with a success.
pub async fn probe(bind: SocketAddr) -> bool {
    let target = if bind.ip().is_unspecified() {
        SocketAddr::from((Ipv4Addr::LOCALHOST, bind.port()))
    } else {
        bind
    };
    let uri = format!("http://{target}/healthz")
        .parse()
        .expect("an address and a path make a valid URI");
    let client = Client::builder(TokioExecutor::new()).build_http::<Empty<Bytes>>();
    match tokio::time::timeout(TIMEOUT, client.get(uri)).await {
        Ok(Ok(response)) => response.status().is_success(),
        _ => false,
    }
}
