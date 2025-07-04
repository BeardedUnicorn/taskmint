/**
 * Google Drive API Client
 * 
 * Handles OAuth 2.0 authentication and file operations with Google Drive API.
 */

use crate::config::get_config;
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use url::Url;

// OAuth 2.0 client configuration
#[derive(Debug, Clone)]
pub struct GoogleDriveConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: String,
}

// OAuth 2.0 tokens
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleDriveTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub token_type: String,
}

// Google Drive file metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveFileMetadata {
    pub id: String,
    pub name: String,
    #[serde(rename = "modifiedTime")]
    pub modified_time: String,
    pub size: Option<String>,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
}

// Token response from Google
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
    token_type: String,
}

// Google Drive API client
#[derive(Clone)]
pub struct GoogleDriveClient {
    client: Client,
    config: GoogleDriveConfig,
    tokens: Option<GoogleDriveTokens>,
}

impl GoogleDriveClient {
    pub fn new(config: GoogleDriveConfig) -> Self {
        Self {
            client: Client::new(),
            config,
            tokens: None,
        }
    }

    /// Generate OAuth 2.0 authorization URL
    pub fn get_auth_url(&self, state: &str) -> Result<String> {
        let app_config = get_config();
        let mut url = Url::parse(&app_config.google_drive_oauth_url)?;
        
        url.query_pairs_mut()
            .append_pair("client_id", &self.config.client_id)
            .append_pair("redirect_uri", &self.config.redirect_uri)
            .append_pair("scope", &app_config.google_drive_scope)
            .append_pair("response_type", "code")
            .append_pair("access_type", "offline")
            .append_pair("prompt", "consent")
            .append_pair("state", state);

        Ok(url.to_string())
    }

    /// Exchange authorization code for tokens
    pub async fn exchange_code_for_tokens(&mut self, code: &str) -> Result<GoogleDriveTokens> {
        let app_config = get_config();
        let mut params = HashMap::new();
        params.insert("client_id", self.config.client_id.as_str());
        params.insert("client_secret", self.config.client_secret.as_str());
        params.insert("code", code);
        params.insert("grant_type", "authorization_code");
        params.insert("redirect_uri", self.config.redirect_uri.as_str());

        let response = self.client
            .post(&app_config.google_drive_token_url)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Token exchange failed: {}", error_text));
        }

        let token_response: TokenResponse = response.json().await?;
        
        let tokens = GoogleDriveTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_at: chrono::Utc::now() + chrono::Duration::seconds(token_response.expires_in as i64),
            token_type: token_response.token_type,
        };

        self.tokens = Some(tokens.clone());
        Ok(tokens)
    }

    /// Refresh access token using refresh token
    pub async fn refresh_tokens(&mut self) -> Result<GoogleDriveTokens> {
        let app_config = get_config();
        let current_tokens = self.tokens.as_ref()
            .ok_or_else(|| anyhow!("No tokens available"))?;
        
        let refresh_token = current_tokens.refresh_token.as_ref()
            .ok_or_else(|| anyhow!("No refresh token available"))?;

        let mut params = HashMap::new();
        params.insert("client_id", self.config.client_id.as_str());
        params.insert("client_secret", self.config.client_secret.as_str());
        params.insert("refresh_token", refresh_token.as_str());
        params.insert("grant_type", "refresh_token");

        let response = self.client
            .post(&app_config.google_drive_token_url)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Token refresh failed: {}", error_text));
        }

        let token_response: TokenResponse = response.json().await?;
        
        let tokens = GoogleDriveTokens {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token.or_else(|| current_tokens.refresh_token.clone()),
            expires_at: chrono::Utc::now() + chrono::Duration::seconds(token_response.expires_in as i64),
            token_type: token_response.token_type,
        };

        self.tokens = Some(tokens.clone());
        Ok(tokens)
    }

    /// Ensure we have a valid access token
    async fn ensure_valid_token(&mut self) -> Result<()> {
        let app_config = get_config();
        let tokens = self.tokens.as_ref()
            .ok_or_else(|| anyhow!("No tokens available"))?;

        // Check if token is expired (with configured buffer)
        let now = chrono::Utc::now();
        let expires_soon = tokens.expires_at - app_config.google_drive_token_refresh_buffer_duration();
        
        if now >= expires_soon {
            self.refresh_tokens().await?;
        }

        Ok(())
    }

    /// Get authorization header value
    fn get_auth_header(&self) -> Result<String> {
        let tokens = self.tokens.as_ref()
            .ok_or_else(|| anyhow!("No tokens available"))?;
        
        Ok(format!("Bearer {}", tokens.access_token))
    }

    /// List files in Google Drive
    pub async fn list_files(&mut self, query: Option<&str>) -> Result<Vec<DriveFileMetadata>> {
        let app_config = get_config();
        self.ensure_valid_token().await?;

        let mut url = format!("{}/files", app_config.google_drive_api_url);
        
        if let Some(q) = query {
            url = format!("{}?q={}", url, urlencoding::encode(q));
        }

        let response = self.client
            .get(&url)
            .header("Authorization", self.get_auth_header()?)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Failed to list files: {}", error_text));
        }

        #[derive(Deserialize)]
        struct ListResponse {
            files: Vec<DriveFileMetadata>,
        }

        let list_response: ListResponse = response.json().await?;
        Ok(list_response.files)
    }

    /// Get file metadata
    pub async fn get_file_metadata(&mut self, file_id: &str) -> Result<DriveFileMetadata> {
        let app_config = get_config();
        self.ensure_valid_token().await?;

        let url = format!("{}/files/{}", app_config.google_drive_api_url, file_id);

        let response = self.client
            .get(&url)
            .header("Authorization", self.get_auth_header()?)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Failed to get file metadata: {}", error_text));
        }

        let metadata: DriveFileMetadata = response.json().await?;
        Ok(metadata)
    }

    /// Download file content
    pub async fn download_file(&mut self, file_id: &str) -> Result<String> {
        let app_config = get_config();
        self.ensure_valid_token().await?;

        let url = format!("{}/files/{}?alt=media", app_config.google_drive_api_url, file_id);

        let response = self.client
            .get(&url)
            .header("Authorization", self.get_auth_header()?)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Failed to download file: {}", error_text));
        }

        let content = response.text().await?;
        Ok(content)
    }

    /// Upload file content
    pub async fn upload_file(&mut self, filename: &str, content: &str, parent_folder_id: Option<&str>) -> Result<DriveFileMetadata> {
        let app_config = get_config();
        self.ensure_valid_token().await?;

        // Create metadata
        let mut metadata = serde_json::json!({
            "name": filename,
            "mimeType": "application/json"
        });

        if let Some(parent_id) = parent_folder_id {
            metadata["parents"] = serde_json::json!([parent_id]);
        }

        // Use multipart upload
        let boundary = uuid::Uuid::new_v4().to_string();
        let mut body = String::new();
        
        body.push_str(&format!("--{}\r\n", boundary));
        body.push_str("Content-Type: application/json\r\n\r\n");
        body.push_str(&metadata.to_string());
        body.push_str(&format!("\r\n--{}\r\n", boundary));
        body.push_str("Content-Type: application/json\r\n\r\n");
        body.push_str(content);
        body.push_str(&format!("\r\n--{}--\r\n", boundary));

        let url = format!("{}/files?uploadType=multipart", app_config.google_drive_api_url);

        let response = self.client
            .post(&url)
            .header("Authorization", self.get_auth_header()?)
            .header("Content-Type", format!("multipart/related; boundary={}", boundary))
            .body(body)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Failed to upload file: {}", error_text));
        }

        let file_metadata: DriveFileMetadata = response.json().await?;
        Ok(file_metadata)
    }

    /// Update existing file content
    pub async fn update_file(&mut self, file_id: &str, content: &str) -> Result<DriveFileMetadata> {
        let app_config = get_config();
        self.ensure_valid_token().await?;

        let url = format!("{}/files/{}?uploadType=media", app_config.google_drive_api_url, file_id);

        let response = self.client
            .patch(&url)
            .header("Authorization", self.get_auth_header()?)
            .header("Content-Type", "application/json")
            .body(content.to_string())
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Failed to update file: {}", error_text));
        }

        let file_metadata: DriveFileMetadata = response.json().await?;
        Ok(file_metadata)
    }
}
