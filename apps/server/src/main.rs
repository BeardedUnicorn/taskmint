//! Process wiring only (excluded from coverage): everything else is in the
//! tested `cli::run`.

use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    let env = |name: &str| std::env::var(name).ok();
    let code = taskmint_server::cli::run(
        std::env::args_os().collect(),
        &env,
        Box::pin(shutdown_signal()),
        &mut std::io::stdout(),
        &mut std::io::stderr(),
    )
    .await;
    ExitCode::from(code)
}

/// Ctrl-C, or SIGTERM from `docker stop`.
async fn shutdown_signal() {
    let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        .expect("SIGTERM can be handled");
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = terminate.recv() => {}
    }
}
