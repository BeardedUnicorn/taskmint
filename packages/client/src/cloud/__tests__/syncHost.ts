import type { OutgoingDoc, SyncAccount } from '@taskmint/contracts';
import { createFakeBackend } from '../../testing';

/** The backend's sync commands, scripted: what core would answer. */
export function syncHost(
  start: { account?: SyncAccount; hasData?: boolean; outgoing?: OutgoingDoc[]; held?: number } = {}
) {
  const state = {
    account: start.account ?? null,
    cursor: null as string | null,
    hasData: start.hasData ?? false,
    outgoing: start.outgoing ?? [],
    held: start.held ?? 0,
    linkedWith: null as string | null,
    applied: [] as unknown[],
  };
  const backend = createFakeBackend();
  backend.call.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    const status = () => ({
      account: state.account,
      deviceId: 'desk',
      cursor: state.cursor,
      pending: state.outgoing.length,
      held: state.held,
      hasData: state.hasData,
    });
    switch (command) {
      case 'get_sync_status':
        return status();
      case 'link_sync_account':
        state.account = { uid: args!.uid as string, epoch: args!.epoch as number };
        state.linkedWith = args!.mode as string;
        return status();
      case 'unlink_sync_account':
        state.account = null;
        state.cursor = null;
        return null;
      case 'get_sync_outgoing':
        return state.outgoing;
      default: {
        // apply_sync_incoming: an echo is what was sent coming back
        const { docs, cursor } = args as { docs: { docId: string }[]; cursor: string | null };
        state.applied.push(args);
        state.outgoing = state.outgoing.filter(out => !docs.some(doc => doc.docId === out.docId));
        if (cursor) state.cursor = cursor;
        return { applied: docs.length, merged: 0, skipped: 0, held: 0 };
      }
    }
  });
  return { backend, state };
}
