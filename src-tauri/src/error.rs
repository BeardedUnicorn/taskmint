// Error handling utilities for the application

use std::fmt;

#[derive(Debug, Clone)]
pub struct AppError {
    pub message: String,
    pub source: Option<String>,
}

impl AppError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            source: None,
        }
    }

    pub fn with_source(message: impl Into<String>, source: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            source: Some(source.into()),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)?;
        if let Some(ref source) = self.source {
            write!(f, " (source: {})", source)?;
        }
        Ok(())
    }
}

impl std::error::Error for AppError {}

impl From<String> for AppError {
    fn from(message: String) -> Self {
        Self::new(message)
    }
}

impl From<&str> for AppError {
    fn from(message: &str) -> Self {
        Self::new(message)
    }
}

impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.to_string()
    }
}

// Retry mechanism for operations that may fail temporarily
pub fn retry_operation<T, F>(
    operation: F,
    max_retries: u32,
    delay_ms: u64,
) -> Result<T, AppError>
where
    F: Fn() -> Result<T, AppError>,
{
    let mut attempts = 0;
    loop {
        match operation() {
            Ok(result) => return Ok(result),
            Err(e) if attempts < max_retries => {
                attempts += 1;
                eprintln!(
                    "Operation failed (attempt {}/{}): {}",
                    attempts,
                    max_retries + 1,
                    e
                );
                std::thread::sleep(std::time::Duration::from_millis(delay_ms * attempts as u64));
            }
            Err(e) => {
                return Err(AppError::with_source(
                    format!("Operation failed after {} attempts", max_retries + 1),
                    e.to_string(),
                ))
            }
        }
    }
}
