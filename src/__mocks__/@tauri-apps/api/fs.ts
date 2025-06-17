/**
 * Mock for @tauri-apps/api/fs
 */

export const readTextFile = jest.fn().mockResolvedValue('');
export const writeTextFile = jest.fn().mockResolvedValue(undefined);
export const readBinaryFile = jest.fn().mockResolvedValue(new Uint8Array());
export const writeBinaryFile = jest.fn().mockResolvedValue(undefined);
export const exists = jest.fn().mockResolvedValue(false);
export const createDir = jest.fn().mockResolvedValue(undefined);
export const removeDir = jest.fn().mockResolvedValue(undefined);
export const removeFile = jest.fn().mockResolvedValue(undefined);
export const renameFile = jest.fn().mockResolvedValue(undefined);
export const copyFile = jest.fn().mockResolvedValue(undefined);
