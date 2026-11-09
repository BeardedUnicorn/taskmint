//! Running a command against a workspace. Each arm is the rule a desktop
//! command used to run under its own locks; the host now does the locking,
//! saving and announcing for all of them.

use super::{
    AppRecords, Backup, Command, CoreError, Ctx, Event, Executed, ResetSummary, SavedRecord,
    WorkLogs,
};
use crate::capture::payload_shape_ok;
use crate::contract::events::{
    APP_RECORDS_CHANGED, SESSIONS_CHANGED, TIMER_INSTANCE_DELETED, TIMER_INSTANCE_PAUSED,
    TIMER_INSTANCE_RESUMED, TIMER_INSTANCE_STARTED, TIMER_INSTANCE_STOPPED, WORK_LOGS_IMPORTED,
    WORK_LOG_PAYLOAD_CAPTURED,
};
use crate::contract::{ERR_RECORD_CONFLICT, ERR_UNEXPECTED_PAYLOAD_SHAPE, TASKS_RECORD_KEY};
use crate::idle::{apply_idle_choice, pause_for_idle, IdleChoice};
use crate::load::{parse_project_mappings, parse_work_log_entries};
use crate::model::{PendingCapture, Task, TimerTask};
use crate::records::{is_app_record_key, merge_imported_records, replace_records, RecordMap};
use crate::restore::{
    finalize_time, parse_section, parse_sessions_section, restore_project_mappings,
    restore_sessions, restore_work_log_entries, RestoreMode, RestoreSummary,
};
use crate::sessions::instances;
use crate::sessions::lifecycle::{clear_notes, move_instance_to_task, set_active_session};
use crate::sessions::manual::{build_manual_session, ManualEntry};
use crate::sessions::start::{
    pause_live_timer, start_task_with_handoff, stop_live_timer, StartTaskResult, TrayStart,
};
use crate::sessions::task_links::task_rate;
use crate::sessions::undo::{remove_session, restore_instance_into, restore_session_into};
use crate::worklogs::{
    apply_rewrite_groups, undo_import, upsert_entries, upsert_mappings, WorkLogImportSummary,
    WorkLogImportUndo,
};
use crate::workspace::{Parts, TaskLinks, Workspace};
use chrono::{DateTime, Utc};
use serde::Serialize;

impl Executed {
    fn event(mut self, event: Event) -> Self {
        self.events.push(event);
        self
    }

    /// `timer-instance-stopped` for timers stopped as a side effect (a
    /// deactivation, a hand-off, a delete).
    fn stopped(mut self, instance_ids: &[String], at: DateTime<Utc>) -> Self {
        for id in instance_ids {
            self.events
                .push(Event::instance(TIMER_INSTANCE_STOPPED, id, "endTime", at));
        }
        self
    }

    fn backup(mut self, backup: Backup) -> Self {
        self.backups.push(backup);
        self
    }

    /// What following the task list changed.
    fn follow(mut self, links: TaskLinks) -> Self {
        self.dirty |= links.dirty;
        if links.renamed {
            self.events.push(Event::new(SESSIONS_CHANGED, ()));
        }
        self
    }
}

/// Sessions, changed if `changed`.
fn sessions_if(reply: impl Serialize, changed: bool) -> Executed {
    Executed::new(
        reply,
        if changed {
            Parts::SESSIONS
        } else {
            Parts::NONE
        },
    )
}

/// The record commands refuse to run over records that couldn't be loaded.
fn records_readable(workspace: &Workspace) -> Result<(), CoreError> {
    match &workspace.notes.records_error {
        Some(error) => Err(CoreError::Rejected(error.clone())),
        None => Ok(()),
    }
}

/// Every record, with every key's revision.
fn all_records(workspace: &Workspace) -> AppRecords {
    AppRecords {
        records: workspace.records.clone(),
        revisions: workspace.revisions(),
    }
}

/// `work-logs-imported`: the ledger changed, and maybe the sessions
/// (`groupsApplied` days were rewritten).
fn ledger_changed(groups_applied: usize) -> Event {
    Event::new(
        WORK_LOGS_IMPORTED,
        serde_json::json!({ "groupsApplied": groups_applied }),
    )
}

/// `app-records-changed` for a saved record.
fn record_changed(key: &str, revision: u64) -> Event {
    Event::new(
        APP_RECORDS_CHANGED,
        serde_json::json!({ "key": key, "revision": revision }),
    )
}

/// A task's id and name as given, trimmed; an error when either is blank.
fn chosen_task<'a>(
    task_id: &'a str,
    task_name: &'a str,
    blank: &str,
) -> Result<(&'a str, &'a str), CoreError> {
    let (task_id, task_name) = (task_id.trim(), task_name.trim());
    if task_id.is_empty() || task_name.is_empty() {
        return Err(CoreError::Rejected(blank.to_string()));
    }
    Ok((task_id, task_name))
}

/// A task picked for a timer, checked against the task list, with the rate
/// the timer earns at.
fn known_timer_task(
    tasks: &[Task],
    task_id: &str,
    task_name: &str,
    blank: &str,
) -> Result<TimerTask, CoreError> {
    let (task_id, task_name) = chosen_task(task_id, task_name, blank)?;
    if !tasks.iter().any(|t| t.id == task_id) {
        return Err("That task no longer exists".to_string().into());
    }
    Ok(TimerTask {
        task_id: task_id.to_string(),
        task_name: task_name.to_string(),
        hourly_rate: task_rate(tasks, task_id),
    })
}

pub fn execute(
    command: Command,
    workspace: &mut Workspace,
    ctx: &Ctx,
) -> Result<Executed, CoreError> {
    let Ctx { now, zone } = *ctx;
    let sessions = &mut workspace.sessions;
    Ok(match command {
        Command::GetAppRecords(_) => {
            records_readable(workspace)?;
            Executed::read(all_records(workspace))
        }
        Command::SetAppRecord(args) => {
            if !is_app_record_key(&args.key) {
                return Err(format!("Unknown record \"{}\"", args.key).into());
            }
            records_readable(workspace)?;
            if args
                .base_revision
                .is_some_and(|base| base != workspace.revision(&args.key))
            {
                return Err(CoreError::Conflict(ERR_RECORD_CONFLICT.to_string()));
            }
            if args.value.is_null() {
                workspace.records.remove(&args.key);
            } else {
                workspace.records.insert(args.key.clone(), args.value);
            }
            let revision = workspace.bump_revision(&args.key);
            let done = Executed::new(SavedRecord { revision }, Parts::RECORDS)
                .event(record_changed(&args.key, revision));
            if args.key == TASKS_RECORD_KEY {
                done.follow(workspace.sync_task_links())
            } else {
                done
            }
        }
        Command::ImportAppRecords(args) => {
            records_readable(workspace)?;
            let incoming: RecordMap = args
                .records
                .into_iter()
                .filter(|(key, value)| is_app_record_key(key) && !value.is_null())
                .collect();
            let mut done = Executed::read(());
            if !incoming.is_empty() {
                done = done.backup(Backup::Incoming {
                    records: incoming.clone(),
                    failure: "Moving the records in was cancelled",
                });
            }
            let changed = merge_imported_records(&mut workspace.records, incoming);
            if !changed.is_empty() {
                done.dirty |= Parts::RECORDS;
            }
            for key in &changed {
                let revision = workspace.bump_revision(key);
                done = done.event(record_changed(key, revision));
            }
            if changed.iter().any(|key| key == TASKS_RECORD_KEY) {
                done = done.follow(workspace.sync_task_links());
            }
            done.reply = super::to_value(all_records(workspace));
            done
        }

        Command::GetSessions(_) => Executed::read(&*sessions),
        Command::GetSessionLoadWarning(_) => Executed::read(&workspace.notes.session_warning),
        Command::StartTask(args) => {
            let (task_id, task_name) =
                chosen_task(&args.task_id, &args.task_name, "Choose a task to start")?;
            let rate = task_rate(&workspace.tasks(), task_id);
            let (outcome, stopped, handoff) = start_task_with_handoff(
                &mut workspace.sessions,
                task_id,
                task_name,
                rate,
                now,
                zone,
            )?;
            let started = match &outcome {
                TrayStart::Started(id) => Some(Event::instance(
                    TIMER_INSTANCE_STARTED,
                    id,
                    "startTime",
                    now,
                )),
                TrayStart::Resumed(id) => Some(Event::instance(
                    TIMER_INSTANCE_RESUMED,
                    id,
                    "resumedAt",
                    now,
                )),
                TrayStart::AlreadyRunning => None,
            };
            let mut done = sessions_if(StartTaskResult::new(outcome, handoff), started.is_some())
                .stopped(&stopped, now);
            done.events.extend(started);
            done
        }
        Command::AddManualTime(args) => {
            let start = DateTime::parse_from_rfc3339(&args.start_time)
                .map_err(|e| format!("Invalid start time: {}", e))?
                .with_timezone(&Utc);
            let task_id = args.task_id.trim();
            let entry = ManualEntry {
                task_id,
                task_name: args.task_name.trim(),
                hourly_rate: task_rate(&workspace.tasks(), task_id),
                start,
                duration_ms: args.duration_ms,
            };
            let session = build_manual_session(&workspace.sessions, &entry, now, zone)?;
            workspace.sessions.push(session.clone());
            // The frontend reloads on it; the timer is finished already.
            let logged: Vec<String> = session
                .timer_instances
                .iter()
                .take(1)
                .map(|i| i.id.clone())
                .collect();
            sessions_if(session, true).stopped(&logged, now)
        }
        Command::SetActiveSession(args) => {
            let stopped = set_active_session(sessions, args.session_id.as_deref(), now)?;
            sessions_if(&*sessions, true).stopped(&stopped, now)
        }
        Command::ClearSessionNotes(args) => {
            let cleared = clear_notes(sessions, &args.session_ids);
            sessions_if(cleared, cleared > 0)
        }
        Command::DeleteSession(args) => {
            let (removed, stopped) = remove_session(sessions, &args.session_id, now)?;
            sessions_if(removed, true)
                .stopped(&stopped, now)
                .event(Event::new(SESSIONS_CHANGED, ()))
        }
        Command::RestoreSession(args) => {
            let restored = restore_session_into(sessions, args.session, now)?;
            sessions_if(restored, true).event(Event::new(SESSIONS_CHANGED, ()))
        }
        Command::RestoreTimerInstance(args) => {
            let restored =
                restore_instance_into(sessions, &args.session_id, args.instance, args.index, now)?;
            sessions_if(restored, true).event(Event::new(SESSIONS_CHANGED, ()))
        }

        Command::CreateTimerInstance(args) => {
            let tasks = workspace.tasks();
            let task = args
                .task
                .as_ref()
                .map(|task| {
                    known_timer_task(
                        &tasks,
                        &task.task_id,
                        &task.task_name,
                        "Choose a task for this timer",
                    )
                })
                .transpose()?;
            let created =
                instances::create(&mut workspace.sessions, &args.session_id, task, &tasks, now)?;
            sessions_if(created, true)
        }
        Command::UpdateTimerInstance(args) => sessions_if(
            instances::update(sessions, &args.instance_id, &args.updates, now)?,
            true,
        ),
        Command::StartTimerInstance(args) => {
            sessions_if(instances::start(sessions, &args.instance_id, now)?, true).event(
                Event::instance(TIMER_INSTANCE_STARTED, &args.instance_id, "startTime", now),
            )
        }
        Command::StopTimerInstance(args) => {
            sessions_if(instances::stop(sessions, &args.instance_id, now)?, true).event(
                Event::instance(TIMER_INSTANCE_STOPPED, &args.instance_id, "endTime", now),
            )
        }
        Command::PauseTimerInstance(args) => {
            sessions_if(instances::pause(sessions, &args.instance_id, now)?, true).event(
                Event::instance(TIMER_INSTANCE_PAUSED, &args.instance_id, "pausedAt", now),
            )
        }
        Command::ResumeTimerInstance(args) => {
            sessions_if(instances::resume(sessions, &args.instance_id, now)?, true).event(
                Event::instance(TIMER_INSTANCE_RESUMED, &args.instance_id, "resumedAt", now),
            )
        }
        Command::DeleteTimerInstance(args) => {
            sessions_if(instances::delete(sessions, &args.instance_id, now)?, true).event(
                Event::instance(TIMER_INSTANCE_DELETED, &args.instance_id, "deletedAt", now),
            )
        }
        Command::MoveTimerInstance(args) => {
            let task = known_timer_task(
                &workspace.tasks(),
                &args.task_id,
                &args.task_name,
                "Choose a task to move this time to",
            )?;
            let (session_id, changed) = move_instance_to_task(
                &mut workspace.sessions,
                &args.instance_id,
                &task.task_id,
                &task.task_name,
                task.hourly_rate,
                now,
            )?;
            let done = sessions_if(session_id, changed);
            if changed {
                done.event(Event::new(SESSIONS_CHANGED, ()))
            } else {
                done
            }
        }

        Command::StopLiveTimer(_) => {
            let stopped = stop_live_timer(sessions, now);
            sessions_if(&stopped, stopped.is_some()).stopped(stopped.as_slice(), now)
        }
        Command::PauseLiveTimer(_) => {
            let paused = pause_live_timer(sessions, now);
            let done = sessions_if(&paused, paused.is_some());
            match &paused {
                Some(id) => done.event(Event::instance(TIMER_INSTANCE_PAUSED, id, "pausedAt", now)),
                None => done,
            }
        }
        Command::PauseTimerAt(args) => {
            let paused = pause_for_idle(sessions, &args.instance_id, args.idle_since, now);
            let done = sessions_if(paused, paused);
            if paused {
                // The pause starts when input stopped, not when it was noticed.
                done.event(Event::instance(
                    TIMER_INSTANCE_PAUSED,
                    &args.instance_id,
                    "pausedAt",
                    args.idle_since,
                ))
            } else {
                done
            }
        }
        Command::ApplyIdleChoice(args) => {
            let choice = IdleChoice::parse(&args.choice)?;
            let resumed = apply_idle_choice(sessions, &args.instance_id, choice, now)?;
            let done = sessions_if(resumed, resumed);
            if resumed {
                done.event(Event::instance(
                    TIMER_INSTANCE_RESUMED,
                    &args.instance_id,
                    "resumedAt",
                    now,
                ))
            } else {
                done
            }
        }

        Command::GetWorkLogs(_) => Executed::read(WorkLogs {
            entries: workspace.work_log_entries.clone(),
            mappings: workspace.work_log_mappings.clone(),
            load_warning: workspace.notes.work_log_warning.clone(),
        }),
        Command::ApplyWorkLogImport(args) => {
            let payload = args.payload;
            let now_iso = now.to_rfc3339();
            // What Undo puts back
            let before = Workspace {
                sessions: workspace.sessions.clone(),
                work_log_entries: workspace.work_log_entries.clone(),
                work_log_mappings: workspace.work_log_mappings.clone(),
                ..Workspace::default()
            };
            let (entries_added, entries_updated) = upsert_entries(
                &mut workspace.work_log_entries,
                payload.entries,
                &now_iso,
                payload.is_remap,
            );
            let mappings_saved =
                upsert_mappings(&mut workspace.work_log_mappings, payload.mappings, &now_iso);
            let mut done = Executed::read(());
            done.dirty = Parts::WORK_LOGS;
            // The rewrite deletes tracked time. A copy is kept first, but an
            // import mustn't fail because one couldn't be written.
            if !payload.rewrite_groups.is_empty() {
                done = done.backup(Backup::Saved {
                    parts: Parts::SESSIONS,
                    failure: "Failed to back up sessions before import",
                    required: false,
                });
            }
            let (groups_applied, groups_skipped) =
                apply_rewrite_groups(&mut workspace.sessions, payload.rewrite_groups, now);
            if !groups_applied.is_empty() {
                // The replacement sessions take today's task names and rates.
                // work-logs-imported reloads the sessions, so a rename needs
                // no event of its own.
                let links = workspace.sync_task_links();
                done.dirty |= Parts::SESSIONS | links.dirty;
            }
            done = done.event(ledger_changed(groups_applied.len()));
            done.reply = super::to_value(WorkLogImportSummary {
                entries_added,
                entries_updated,
                mappings_saved,
                groups_applied,
                groups_skipped,
                undo: WorkLogImportUndo::between(&before, workspace),
            });
            done
        }
        Command::UndoWorkLogImport(args) => {
            undo_import(workspace, args.undo)?;
            // The import's result goes. It can be imported again, so a copy
            // that can't be written doesn't stop the undo.
            Executed::new((), Parts::SESSIONS | Parts::WORK_LOGS)
                .backup(Backup::Saved {
                    parts: Parts::SESSIONS | Parts::WORK_LOGS,
                    failure: "Failed to back up before undoing the import",
                    required: false,
                })
                .event(Event::new(SESSIONS_CHANGED, ()))
                .event(ledger_changed(0))
        }
        Command::AcceptCapture(args) => {
            if !payload_shape_ok(&args.payload) {
                return Err(ERR_UNEXPECTED_PAYLOAD_SHAPE.to_string().into());
            }
            let received_at = now.to_rfc3339();
            workspace.pending_capture = Some(PendingCapture {
                payload: args.payload,
                received_at: received_at.clone(),
                source: args.source,
            });
            Executed::new((), Parts::CAPTURE).event(Event::new(
                WORK_LOG_PAYLOAD_CAPTURED,
                serde_json::json!({ "receivedAt": received_at }),
            ))
        }
        Command::TakePendingWorkLogCapture(_) => {
            // Taken once: a payload is processed at most once.
            let taken = workspace.pending_capture.take();
            let dirty = if taken.is_some() {
                Parts::CAPTURE
            } else {
                Parts::NONE
            };
            Executed::new(taken, dirty)
        }

        Command::RestoreBackupData(args) => restore(args.payload, workspace, now)?,
        Command::ResetAllAppData(_) => {
            *workspace = Workspace::default();
            let mut done = Executed::new(ResetSummary::default(), Parts::ALL);
            done.purge_backups = true;
            done
        }
    })
}

/// Restores an export's sessions and work logs, and in an exact restore
/// (replace mode) the frontend's records with them, in one change. A merge
/// leaves the records to the frontend, which merges them item by item. The
/// frontend reloads afterwards.
fn restore(
    payload: crate::restore::RestorePayload,
    workspace: &mut Workspace,
    now: DateTime<Utc>,
) -> Result<Executed, CoreError> {
    let records = match payload.records {
        Some(_) if payload.mode == RestoreMode::Merge => {
            return Err(CoreError::InvalidArgs(
                "Records are restored this way only when replacing".to_string(),
            ))
        }
        Some(records) => {
            records_readable(workspace)?;
            Some(records)
        }
        None => None,
    };
    let finalize_at = finalize_time(payload.exported_at.as_deref(), now);
    // Everything is read before anything changes: a malformed section
    // refuses the restore.
    let (sessions, sessions_skipped) = parse_section(&payload.sessions, parse_sessions_section)?;
    let (entries, entries_skipped) =
        parse_section(&payload.work_log_entries, parse_work_log_entries)?;
    let (mappings, mappings_skipped) =
        parse_section(&payload.work_log_mappings, parse_project_mappings)?;

    let mut summary = RestoreSummary {
        records_skipped: sessions_skipped + entries_skipped + mappings_skipped,
        ..RestoreSummary::default()
    };
    let mut dirty = Parts::NONE;
    if let Some(sessions) = sessions {
        let (restored, already_present) =
            restore_sessions(&mut workspace.sessions, sessions, payload.mode, finalize_at);
        summary.sessions_restored = restored;
        summary.sessions_already_present = already_present;
        dirty |= Parts::SESSIONS;
    }
    if let Some(entries) = entries {
        summary.work_log_entries_restored =
            restore_work_log_entries(&mut workspace.work_log_entries, entries, payload.mode);
        dirty |= Parts::WORK_LOGS;
    }
    if let Some(mappings) = mappings {
        summary.work_log_mappings_restored =
            restore_project_mappings(&mut workspace.work_log_mappings, mappings, payload.mode);
        dirty |= Parts::WORK_LOGS;
    }
    let mut copied = Parts::SESSIONS | Parts::WORK_LOGS;
    let mut record_events = Vec::new();
    if let Some(records) = records {
        copied |= Parts::RECORDS;
        dirty |= Parts::RECORDS;
        for key in replace_records(&mut workspace.records, records) {
            let revision = workspace.bump_revision(&key);
            record_events.push(record_changed(&key, revision));
            summary.app_records_restored += 1;
        }
        // The sessions and the ledger follow the restored task list
        dirty |= workspace.sync_task_links().dirty;
    }
    // Never without a copy of what's being replaced.
    let mut done = Executed::new(summary, dirty).backup(Backup::Saved {
        parts: copied,
        failure: "Restore cancelled",
        required: true,
    });
    done.events = record_events;
    // Every view of what was restored reads it again
    if dirty.contains(Parts::SESSIONS) {
        done = done.event(Event::new(SESSIONS_CHANGED, ()));
    }
    if dirty.contains(Parts::WORK_LOGS) {
        done = done.event(ledger_changed(0));
    }
    Ok(done)
}
