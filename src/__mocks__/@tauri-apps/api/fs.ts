/**
 * Mock for @tauri-apps/api/fs
 */

export const readTextFile = vi.fn().mockResolvedValue('');
export const writeTextFile = vi.fn().mockResolvedValue(undefined);
export const readBinaryFile = vi.fn().mockResolvedValue(new Uint8Array());
export const writeBinaryFile = vi.fn().mockResolvedValue(undefined);
export const exists = vi.fn().mockResolvedValue(false);
export const createDir = vi.fn().mockResolvedValue(undefined);
export const removeDir = vi.fn().mockResolvedValue(undefined);
export const removeFile = vi.fn().mockResolvedValue(undefined);
export const renameFile = vi.fn().mockResolvedValue(undefined);
export const copyFile = vi.fn().mockResolvedValue(undefined);
