import { describe, it, expect, vi } from 'vitest';
import { deliverDesktop } from '../desktop';
import { fakeBackend } from '../../testing';

const show = () => fakeBackend().platform.notifications.show;

describe('deliverDesktop', () => {
  it('goes through the platform, which reports whether it showed', async () => {
    show().mockResolvedValue(true);

    await expect(deliverDesktop('backupFailure', 'Backup failed', 'Disk full')).resolves.toBe(true);
    expect(show()).toHaveBeenCalledWith('backupFailure', 'Backup failed', 'Disk full');
  });

  it('is false when the platform declines (the category is off)', async () => {
    show().mockResolvedValue(false);
    await expect(deliverDesktop('goalMilestone', 't', 'b')).resolves.toBe(false);
  });

  it('is false, not an error, when the platform fails', async () => {
    show().mockRejectedValue('no such command');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(deliverDesktop('general', 't', 'b')).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith('Failed to show an OS notification:', 'no such command');
    error.mockRestore();
  });
});
