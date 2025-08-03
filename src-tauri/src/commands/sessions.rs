// Session-related command handlers

use crate::state::AppState;
use crate::storage;
use crate::types::{TaskSession, TimerInstance, EnhancedTimerState, InactivitySettings, TimerActivityState};
use chrono::{DateTime, Utc};
use tauri::{AppHandle, State, Emitter};

#[tauri::command]
pub fn create_session(
    app_state: State<'_, AppState>,
    task_id: String,
    task_name: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let session_id = format!("session_{}_{}", now.timestamp_millis(), now.timestamp_micros() % 1000000);

    let new_session = TaskSession {
        id: session_id,
        task_id,
        task_name,
        timer_instances: Vec::new(),
        total_duration: 0,
        notes: None,
        is_active: false,
        date: now.format("%Y-%m-%d").to_string(),
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
    };

    app_state.with_task_sessions_mut(|sessions| {
        sessions.push(new_session.clone());
    })?;

    Ok(new_session)
}

#[tauri::command]
pub async fn create_session_with_timer(
    app: AppHandle,
    app_state: State<'_, AppState>,
    task_id: String,
    task_name: String,
) -> Result<(TaskSession, TimerInstance), String> {
    println!("Attempting to create session with timer for task: {}", task_name);
    let now = Utc::now();
    let session_id = format!("session_{}_{}", now.timestamp_millis(), now.timestamp_micros() % 1000000);
    let instance_id = format!("instance_{}_{}", now.timestamp_millis(), now.timestamp_micros() % 1000000);

    let new_instance = TimerInstance {
        id: instance_id.clone(),
        session_id: session_id.clone(),
        start_time: now,
        end_time: None,
        duration: None,
        is_running: false,  // Don't auto-start the timer
        is_paused: false,
        paused_at: None,
        paused_duration: None,
        notes: None,
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
    };

    let mut new_session = TaskSession {
        id: session_id.clone(),
        task_id,
        task_name: task_name.clone(),
        timer_instances: vec![new_instance.clone()],
        total_duration: 0,
        notes: None,
        is_active: false, // Start as inactive, will activate explicitly below
        date: now.format("%Y-%m-%d").to_string(),
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
    };

    // Add session to state and explicitly set it as the only active session
    app_state.with_task_sessions_mut(|sessions| {
        // Deactivate all other sessions
        for session in sessions.iter_mut() {
            session.is_active = false;
        }
        
        // Set the new session to active and push it
        new_session.is_active = true;
        sessions.push(new_session.clone());
        
        println!("Session {} explicitly set to active.", new_session.id);
    })?;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    // Update enhanced timer state - but don't start running
    app_state.with_enhanced_timer_state_mut(|enhanced_state| {
        enhanced_state.is_running = false;
        enhanced_state.task_name = task_name.clone();
        enhanced_state.session_id = Some(session_id.clone());
        enhanced_state.instance_id = Some(instance_id.clone());
        enhanced_state.start_time = None;
        enhanced_state.elapsed_ms = 0;
        enhanced_state.is_paused = false;
        enhanced_state.paused_due_to_inactivity = false;
    })?;

    // Don't emit timer-instance-started event since we're not starting it

    Ok((new_session, new_instance))
}


#[tauri::command]
pub fn get_sessions(app_state: State<'_, AppState>) -> Result<Vec<TaskSession>, String> {
    app_state.with_task_sessions(|sessions| sessions.clone())
}

#[tauri::command]
pub fn get_session_by_id(
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<TaskSession>, String> {
    app_state.with_task_sessions(|sessions| {
        sessions.iter().find(|s| s.id == session_id).cloned()
    })
}

#[tauri::command]
pub async fn update_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
    updates: serde_json::Value,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    
    let updated_session = app_state.with_task_sessions_mut(|sessions| {
        let session_index = sessions
            .iter()
            .position(|s| s.id == session_id)
            .ok_or_else(|| format!("Session with ID {} not found", session_id))?;

        let session = &mut sessions[session_index];
        
        // Update fields based on the updates object
        if let Some(task_name) = updates.get("task_name").and_then(|v| v.as_str()) {
            session.task_name = task_name.to_string();
        }
        if let Some(notes) = updates.get("notes").and_then(|v| v.as_str()) {
            session.notes = Some(notes.to_string());
        }
        if let Some(is_active) = updates.get("is_active").and_then(|v| v.as_bool()) {
            session.is_active = is_active;
        }
        
        session.updated_at = now.to_rfc3339();
        
        Ok(session.clone())
    })?;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    updated_session
}

#[tauri::command]
pub async fn delete_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    let _ = app_state.with_task_sessions_mut(|sessions| {
        let initial_len = sessions.len();
        sessions.retain(|s| s.id != session_id);
        
        if sessions.len() == initial_len {
            return Err(format!("Session with ID {} not found", session_id));
        }
        
        Ok(())
    })?;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    Ok(())
}

#[tauri::command]
pub async fn create_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: String,
) -> Result<TimerInstance, String> {
    let now = Utc::now();
    let instance_id = format!("instance_{}_{}", now.timestamp_millis(), now.timestamp_micros() % 1000000);

    let new_instance = TimerInstance {
        id: instance_id,
        session_id: session_id.clone(),
        start_time: now,
        end_time: None,
        duration: None,
        is_running: false,
        is_paused: false,
        paused_at: None,
        paused_duration: None,
        notes: None,
        created_at: now.to_rfc3339(),
        updated_at: now.to_rfc3339(),
    };

    // Add instance to the session
    app_state.with_task_sessions_mut(|sessions| -> Result<(), String> {
        let session = sessions
            .iter_mut()
            .find(|s| s.id == session_id)
            .ok_or_else(|| format!("Session with ID {} not found", session_id))?;

        session.timer_instances.push(new_instance.clone());
        session.updated_at = now.to_rfc3339();

        Ok(())
    })??;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    Ok(new_instance)
}

#[tauri::command]
pub async fn update_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
    updates: serde_json::Value,
) -> Result<TimerInstance, String> {
    let now = Utc::now();
    
    let updated_instance = app_state.with_task_sessions_mut(|sessions| {
        for session in sessions.iter_mut() {
            if let Some(instance) = session.timer_instances.iter_mut().find(|i| i.id == instance_id) {
                // Update fields based on the updates object
                if let Some(is_running) = updates.get("is_running").and_then(|v| v.as_bool()) {
                    instance.is_running = is_running;
                }
                if let Some(is_paused) = updates.get("is_paused").and_then(|v| v.as_bool()) {
                    instance.is_paused = is_paused;
                }
                if let Some(notes) = updates.get("notes").and_then(|v| v.as_str()) {
                    instance.notes = Some(notes.to_string());
                }
                if let Some(duration) = updates.get("duration").and_then(|v| v.as_u64()) {
                    instance.duration = Some(duration);
                }
                if let Some(start_time) = updates.get("start_time").and_then(|v| v.as_str()) {
                    let parsed = DateTime::parse_from_rfc3339(start_time)
                        .map_err(|e| e.to_string())?;
                    instance.start_time = parsed.with_timezone(&Utc);
                }
                if let Some(end_time) = updates.get("end_time").and_then(|v| v.as_str()) {
                    let parsed = DateTime::parse_from_rfc3339(end_time)
                        .map_err(|e| e.to_string())?;
                    instance.end_time = Some(parsed.with_timezone(&Utc));
                }

                instance.updated_at = now.to_rfc3339();
                session.updated_at = now.to_rfc3339();

                let result = instance.clone();

                // Recalculate session total duration after we're done with the mutable borrow
                session.total_duration = session.timer_instances
                    .iter()
                    .filter_map(|i| i.duration)
                    .sum();

                return Ok(result);
            }
        }
        
        Err(format!("Timer instance with ID {} not found", instance_id))
    })?;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    Ok(updated_instance?)
}

#[tauri::command]
pub async fn start_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    println!("Attempting to start timer instance: {}", instance_id);
    let now = Utc::now();
    let mut updated_session: Option<TaskSession> = None;
    
    // Update the timer instance
    app_state.with_task_sessions_mut(|sessions| {
        for session in sessions.iter_mut() {
            if let Some(instance) = session.timer_instances.iter_mut().find(|i| i.id == instance_id) {
                instance.is_running = true;
                instance.is_paused = false;
                instance.start_time = now;
                instance.updated_at = now.to_rfc3339();
                session.updated_at = now.to_rfc3339();
                
                // Update enhanced timer state
                app_state.with_enhanced_timer_state_mut(|enhanced_state| {
                    enhanced_state.is_running = true;
                    enhanced_state.task_name = session.task_name.clone();
                    enhanced_state.session_id = Some(session.id.clone());
                    enhanced_state.instance_id = Some(instance_id.clone());
                    enhanced_state.start_time = Some(now);
                    enhanced_state.elapsed_ms = 0;
                    enhanced_state.is_paused = false;
                    enhanced_state.paused_due_to_inactivity = false;
                })?;

                updated_session = Some(session.clone());
                return Ok(());
            }
        }
        
        Err(format!("Timer instance with ID {} not found", instance_id))
    })??;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    // Emit event to frontend
    app.emit("timer-instance-started", serde_json::json!({
        "instanceId": instance_id,
        "startTime": now.to_rfc3339()
    })).map_err(|e| format!("Failed to emit timer instance started event: {}", e))?;

    updated_session.ok_or_else(|| "Failed to retrieve updated session".to_string())
}

#[tauri::command]
pub async fn stop_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    println!("Attempting to stop timer instance: {}", instance_id);
    let now = Utc::now();
    let mut updated_session: Option<TaskSession> = None;
    
    // Update the timer instance
    app_state.with_task_sessions_mut(|sessions| {
        for session in sessions.iter_mut() {
            if let Some(instance) = session.timer_instances.iter_mut().find(|i| i.id == instance_id) {
                // Store the current pause state before modifying it
                let was_paused = instance.is_paused;
                let paused_at = instance.paused_at;
                
                instance.is_running = false;
                instance.is_paused = false;
                instance.end_time = Some(now);

                // Calculate duration, accounting for current pause state
                let total_elapsed = now.timestamp_millis() - instance.start_time.timestamp_millis();
                let mut total_paused_duration = instance.paused_duration.unwrap_or(0) as i64;

                // If was currently paused, add the current pause duration
                if was_paused {
                    if let Some(paused_at) = paused_at {
                        let current_pause_duration = now.timestamp_millis() - paused_at.timestamp_millis();
                        total_paused_duration += current_pause_duration;
                    }
                }

                instance.duration = Some((total_elapsed - total_paused_duration).max(0) as u64);

                instance.updated_at = now.to_rfc3339();
                session.updated_at = now.to_rfc3339();

                // Store the duration value before ending the mutable borrow
                let final_duration = instance.duration.unwrap_or(0);

                // Recalculate session total duration
                session.total_duration = session.timer_instances
                    .iter()
                    .filter_map(|i| i.duration)
                    .sum();

                // Update enhanced timer state
                app_state.with_enhanced_timer_state_mut(|enhanced_state| {
                    enhanced_state.is_running = false;
                    enhanced_state.is_paused = false;
                    enhanced_state.paused_due_to_inactivity = false;
                    enhanced_state.elapsed_ms = final_duration;
                })?;
                
                updated_session = Some(session.clone());
                return Ok(());
            }
        }
        
        Err(format!("Timer instance with ID {} not found", instance_id))
    })??;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    // Emit event to frontend
    app.emit("timer-instance-stopped", serde_json::json!({
        "instanceId": instance_id,
        "endTime": now.to_rfc3339()
    })).map_err(|e| format!("Failed to emit timer instance stopped event: {}", e))?;

    updated_session.ok_or_else(|| "Failed to retrieve updated session".to_string())
}

#[tauri::command]
pub fn get_enhanced_timer_state(app_state: State<'_, AppState>) -> Result<EnhancedTimerState, String> {
    app_state.with_enhanced_timer_state(|state| state.clone())
}

#[tauri::command]
pub fn update_inactivity_settings(
    app_state: State<'_, AppState>,
    settings: InactivitySettings,
) -> Result<(), String> {
    app_state.with_inactivity_settings_mut(|current_settings| {
        *current_settings = settings;
    })?;
    
    Ok(())
}

#[tauri::command]
pub fn get_inactivity_settings(app_state: State<'_, AppState>) -> Result<InactivitySettings, String> {
    app_state.with_inactivity_settings(|settings| settings.clone())
}

#[tauri::command]
pub fn update_timer_activity_state(
    app_state: State<'_, AppState>,
    activity_state: TimerActivityState,
) -> Result<(), String> {
    app_state.with_timer_activity_state_mut(|current_state| {
        *current_state = activity_state;
    })?;
    
    Ok(())
}

#[tauri::command]
pub fn get_timer_activity_state(app_state: State<'_, AppState>) -> Result<TimerActivityState, String> {
    app_state.with_timer_activity_state(|state| state.clone())
}

#[tauri::command]
pub async fn clear_all_sessions(
    app: AppHandle,
    app_state: State<'_, AppState>,
) -> Result<(), String> {
    // Clear sessions from memory
    app_state.with_task_sessions_mut(|sessions| {
        sessions.clear();
    })?;

    // Clear sessions from storage
    storage::clear_all_sessions(&app)?;

    Ok(())
}

#[tauri::command]
pub async fn pause_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let mut updated_session: Option<TaskSession> = None;

    // Update the timer instance to paused state
    app_state.with_task_sessions_mut(|sessions| {
        for session in sessions.iter_mut() {
            if let Some(instance) = session.timer_instances.iter_mut().find(|i| i.id == instance_id) {
                // Can only pause a running timer
                if !instance.is_running {
                    return Err("Cannot pause timer: timer is not running".to_string());
                }

                // Update instance state
                instance.is_running = false;
                instance.is_paused = true;
                instance.paused_at = Some(now);
                instance.updated_at = now.to_rfc3339();
                session.updated_at = now.to_rfc3339();

                // Update enhanced timer state
                app_state.with_enhanced_timer_state_mut(|enhanced_state| {
                    enhanced_state.is_running = false;
                    enhanced_state.is_paused = true;
                    // Calculate elapsed time up to pause point
                    if let Some(start_time) = enhanced_state.start_time {
                        enhanced_state.elapsed_ms = (now.timestamp_millis() - start_time.timestamp_millis()) as u64;
                    }
                })?;

                updated_session = Some(session.clone());
                return Ok(());
            }
        }

        Err(format!("Timer instance with ID {} not found", instance_id))
    })??;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    // Emit event to frontend
    app.emit("timer-instance-paused", serde_json::json!({
        "instanceId": instance_id,
        "pausedAt": now.to_rfc3339()
    })).map_err(|e| format!("Failed to emit timer instance paused event: {}", e))?;

    updated_session.ok_or_else(|| "Failed to retrieve updated session".to_string())
}

#[tauri::command]
pub async fn resume_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    let now = Utc::now();
    let mut updated_session: Option<TaskSession> = None;

    // Update the timer instance to resume from paused state
    app_state.with_task_sessions_mut(|sessions| {
        for session in sessions.iter_mut() {
            if let Some(instance) = session.timer_instances.iter_mut().find(|i| i.id == instance_id) {
                // Can only resume a paused timer
                if !instance.is_paused {
                    return Err("Cannot resume timer: timer is not paused".to_string());
                }

                // Calculate paused duration and add to total
                if let Some(paused_at) = instance.paused_at {
                    let pause_duration = (now.timestamp_millis() - paused_at.timestamp_millis()) as u64;
                    instance.paused_duration = Some(
                        instance.paused_duration.unwrap_or(0) + pause_duration
                    );
                }

                // Update instance state
                instance.is_running = true;
                instance.is_paused = false;
                instance.paused_at = None;
                instance.updated_at = now.to_rfc3339();
                session.updated_at = now.to_rfc3339();

                // Update enhanced timer state
                app_state.with_enhanced_timer_state_mut(|enhanced_state| {
                    enhanced_state.is_running = true;
                    enhanced_state.is_paused = false;
                    enhanced_state.start_time = Some(now); // Reset start time for resumed timer
                })?;

                updated_session = Some(session.clone());
                return Ok(());
            }
        }

        Err(format!("Timer instance with ID {} not found", instance_id))
    })??;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    // Emit event to frontend
    app.emit("timer-instance-resumed", serde_json::json!({
        "instanceId": instance_id,
        "resumedAt": now.to_rfc3339()
    })).map_err(|e| format!("Failed to emit timer instance resumed event: {}", e))?;

    updated_session.ok_or_else(|| "Failed to retrieve updated session".to_string())
}

#[tauri::command]
pub async fn delete_timer_instance(
    app: AppHandle,
    app_state: State<'_, AppState>,
    instance_id: String,
) -> Result<TaskSession, String> {
    println!("Attempting to delete timer instance: {}", instance_id);
    let now = Utc::now();
    let mut updated_session: Option<TaskSession> = None;
    
    // Remove the timer instance from the session
    app_state.with_task_sessions_mut(|sessions| {
        for session in sessions.iter_mut() {
            let initial_len = session.timer_instances.len();
            session.timer_instances.retain(|i| i.id != instance_id);
            
            if session.timer_instances.len() < initial_len {
                // Instance was found and removed
                session.updated_at = now.to_rfc3339();
                
                // Recalculate session total duration
                session.total_duration = session.timer_instances
                    .iter()
                    .filter_map(|i| i.duration)
                    .sum();
                
                updated_session = Some(session.clone());
                return Ok(());
            }
        }
        
        Err(format!("Timer instance with ID {} not found", instance_id))
    })??;

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    // Emit event to frontend
    app.emit("timer-instance-deleted", serde_json::json!({
        "instanceId": instance_id,
        "deletedAt": now.to_rfc3339()
    })).map_err(|e| format!("Failed to emit timer instance deleted event: {}", e))?;

    updated_session.ok_or_else(|| "Failed to retrieve updated session".to_string())
}

#[tauri::command]
pub async fn set_active_session(
    app: AppHandle,
    app_state: State<'_, AppState>,
    session_id: Option<String>,
) -> Result<Vec<TaskSession>, String> {
    let sessions: Result<Vec<TaskSession>, String> = app_state.with_task_sessions_mut(|sessions| {
        for session in sessions.iter_mut() {
            session.is_active = match &session_id {
                Some(id) => &session.id == id,
                None => false,
            };
        }
        Ok(sessions.clone())
    })?;

    // Update enhanced timer state to reflect the newly active session
    if let Some(id) = session_id {
        let active_session = app_state.with_task_sessions(|sessions| {
            sessions.iter().find(|s| s.id == id).cloned()
        })?;

        if let Some(session) = active_session {
            app_state.with_enhanced_timer_state_mut(|enhanced_state| {
                // Reset enhanced timer state when switching sessions
                enhanced_state.is_running = false;
                enhanced_state.task_name = session.task_name.clone();
                enhanced_state.session_id = Some(session.id.clone());
                enhanced_state.instance_id = None;
                enhanced_state.start_time = None;
                enhanced_state.elapsed_ms = 0;
                enhanced_state.is_paused = false;
                enhanced_state.paused_due_to_inactivity = false;
            })?;
        }
    } else {
        // No active session, clear enhanced timer state
        app_state.with_enhanced_timer_state_mut(|enhanced_state| {
            *enhanced_state = EnhancedTimerState::default();
        })?;
    }

    // Save sessions to store
    let sessions_clone = app_state.with_task_sessions(|sessions| sessions.clone())?;
    storage::save_sessions(&app, &sessions_clone)?;

    Ok(sessions?)
}
