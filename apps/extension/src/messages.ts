/** The messages between the extension's three scripts. */

/** Tags the interceptor's window messages (MAIN world → content script). */
export const MARKER = 'taskmint-worklog-capture';
/** Content script → service worker: `{ type, payloadText }`. */
export const WORKLOG_PAYLOAD = 'worklog-payload';
/** Service worker → content script: `{ type, url }`, a taskmint:// link to open. */
export const OPEN_DEEP_LINK = 'open-deep-link';
