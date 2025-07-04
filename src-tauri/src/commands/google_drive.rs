// Google Drive-related command handlers

use crate::google_drive::{DriveFileMetadata, GoogleDriveClient, GoogleDriveConfig};
use crate::state::AppState;
use crate::types::GoogleDriveAuthResult;
use tauri::State;

#[tauri::command]
pub async fn get_auth_url(
    client_id: String,
    redirect_uri: String,
) -> Result<String, String> {
    let config = GoogleDriveConfig {
        client_id,
        client_secret: String::new(), // Not needed for auth URL
        redirect_uri,
    };

    let client = GoogleDriveClient::new(config);
    let state = uuid::Uuid::new_v4().to_string();

    client
        .get_auth_url(&state)
        .map_err(|e| format!("Failed to generate auth URL: {}", e))
}

#[tauri::command]
pub async fn authenticate(
    client_id: String,
    client_secret: String,
    redirect_uri: String,
    auth_code: String,
    app_state: State<'_, AppState>,
) -> Result<GoogleDriveAuthResult, String> {
    let config = GoogleDriveConfig {
        client_id,
        client_secret,
        redirect_uri,
    };

    let mut client = GoogleDriveClient::new(config);

    match client.exchange_code_for_tokens(&auth_code).await {
        Ok(tokens) => {
            // Store the client with tokens in shared state
            app_state.with_google_drive_client_mut(|client_option| {
                *client_option = Some(client);
            })?;

            Ok(GoogleDriveAuthResult {
                success: true,
                access_token: Some(tokens.access_token),
                refresh_token: tokens.refresh_token,
                expires_at: Some(tokens.expires_at.to_rfc3339()),
                error: None,
            })
        }
        Err(e) => Ok(GoogleDriveAuthResult {
            success: false,
            access_token: None,
            refresh_token: None,
            expires_at: None,
            error: Some(format!("Authentication failed: {}", e)),
        }),
    }
}

#[tauri::command]
pub async fn list_files(
    query: Option<String>,
    app_state: State<'_, AppState>,
) -> Result<Vec<DriveFileMetadata>, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = app_state
        .with_google_drive_client_mut(|client_option| {
            client_option
                .as_mut()
                .ok_or_else(|| "Google Drive client not authenticated".to_string())
                .map(|c| c.clone())
        })?
        .map_err(|e| e.to_string())?;

    client
        .list_files(query.as_deref())
        .await
        .map_err(|e| format!("Failed to list files: {}", e))
}

#[tauri::command]
pub async fn get_file_metadata(
    file_id: String,
    app_state: State<'_, AppState>,
) -> Result<DriveFileMetadata, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = app_state
        .with_google_drive_client_mut(|client_option| {
            client_option
                .as_mut()
                .ok_or_else(|| "Google Drive client not authenticated".to_string())
                .map(|c| c.clone())
        })?
        .map_err(|e| e.to_string())?;

    client
        .get_file_metadata(&file_id)
        .await
        .map_err(|e| format!("Failed to get file metadata: {}", e))
}

#[tauri::command]
pub async fn download_file(
    file_id: String,
    app_state: State<'_, AppState>,
) -> Result<String, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = app_state
        .with_google_drive_client_mut(|client_option| {
            client_option
                .as_mut()
                .ok_or_else(|| "Google Drive client not authenticated".to_string())
                .map(|c| c.clone())
        })?
        .map_err(|e| e.to_string())?;

    client
        .download_file(&file_id)
        .await
        .map_err(|e| format!("Failed to download file: {}", e))
}

#[tauri::command]
pub async fn upload_file(
    filename: String,
    content: String,
    parent_folder_id: Option<String>,
    app_state: State<'_, AppState>,
) -> Result<DriveFileMetadata, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = app_state
        .with_google_drive_client_mut(|client_option| {
            client_option
                .as_mut()
                .ok_or_else(|| "Google Drive client not authenticated".to_string())
                .map(|c| c.clone())
        })?
        .map_err(|e| e.to_string())?;

    client
        .upload_file(&filename, &content, parent_folder_id.as_deref())
        .await
        .map_err(|e| format!("Failed to upload file: {}", e))
}

#[tauri::command]
pub async fn update_file(
    file_id: String,
    content: String,
    app_state: State<'_, AppState>,
) -> Result<DriveFileMetadata, String> {
    // Clone the client to avoid holding the mutex guard across await
    let mut client = app_state
        .with_google_drive_client_mut(|client_option| {
            client_option
                .as_mut()
                .ok_or_else(|| "Google Drive client not authenticated".to_string())
                .map(|c| c.clone())
        })?
        .map_err(|e| e.to_string())?;

    client
        .update_file(&file_id, &content)
        .await
        .map_err(|e| format!("Failed to update file: {}", e))
}
