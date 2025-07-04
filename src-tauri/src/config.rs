use serde::{Deserialize, Serialize};

include!(concat!(env!("OUT_DIR"), "/generated_config.rs"));
use std::time::Duration;


#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Config {
    /// Interval in seconds for updating the tray tooltip status
    pub tray_status_update_interval: u64,
    
    /// Interval in seconds for refreshing the tray menu
    pub tray_menu_refresh_interval: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            tray_status_update_interval: TRAY_STATUS_UPDATE_INTERVAL,
            tray_menu_refresh_interval: TRAY_MENU_REFRESH_INTERVAL,
        }
    }
}

impl Config {
    pub fn tray_status_update_duration(&self) -> Duration {
        Duration::from_secs(self.tray_status_update_interval)
    }
    
    pub fn tray_menu_refresh_duration(&self) -> Duration {
        Duration::from_secs(self.tray_menu_refresh_interval)
    }
}