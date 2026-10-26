import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  APP_RECORD_KEYS,
  CAPTURE,
  COMMAND_NAMES,
  CORE_ERROR_PARTS,
  CORE_ERRORS,
  EVENTS,
  TASKS_RECORD_KEY,
  type CommandArgs,
  type CommandName,
  type CommandReply,
  type TaskSession,
} from '../index';

describe('the generated contracts', () => {
  it('name every command the CommandMap types', () => {
    expectTypeOf<(typeof COMMAND_NAMES)[number]>().toEqualTypeOf<CommandName>();
    expect(new Set(COMMAND_NAMES).size).toBe(COMMAND_NAMES.length);
  });

  it('type each command by its arguments and reply', () => {
    expectTypeOf<CommandArgs<'start_task'>>().toEqualTypeOf<{ taskId: string; taskName: string }>();
    expectTypeOf<CommandArgs<'get_sessions'>>().toBeVoid();
    expectTypeOf<CommandReply<'get_sessions'>>().toEqualTypeOf<TaskSession[]>();
    expectTypeOf<CommandReply<'stop_live_timer'>>().toEqualTypeOf<string | null>();
  });

  it('carry the errors with the parts clients match in them', () => {
    expect(CORE_ERRORS.START_INACTIVE_SESSION).toContain(CORE_ERROR_PARTS.INACTIVE_SESSION);
    expect(CORE_ERRORS.ANOTHER_TIMER_RUNNING).toContain(CORE_ERROR_PARTS.ANOTHER_TIMER_RUNNING);
    expect(CORE_ERRORS.STOP_NOT_RUNNING).toContain(CORE_ERROR_PARTS.NOT_RUNNING);
    expect(CORE_ERRORS.INVALID_JSON_FILE).toContain(CORE_ERROR_PARTS.INVALID_JSON);
  });

  it('keep the values clients already depend on', () => {
    expect(EVENTS.SESSIONS_CHANGED).toBe('sessions-changed');
    expect(APP_RECORD_KEYS).toContain(TASKS_RECORD_KEY);
    expect(CAPTURE.SERVER_PORT).toBe(43117);
  });
});
