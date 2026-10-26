use tracing_subscriber::EnvFilter;

use crate::config::LogFormat;

/// Installs the global log subscriber; a second call leaves the first one.
pub fn init(format: LogFormat, filter: &str) {
    let builder = tracing_subscriber::fmt().with_env_filter(EnvFilter::new(filter));
    let _already_set = match format {
        LogFormat::Json => builder.json().try_init(),
        LogFormat::Text => builder.try_init(),
    };
}
