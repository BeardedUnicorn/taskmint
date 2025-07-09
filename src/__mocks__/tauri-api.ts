/**
 * Tauri API Mocks
 * 
 * This file provides mock implementations of Tauri APIs for testing purposes.
 * These mocks allow tests to run without the actual Tauri runtime.
 */

import { vi } from 'vitest';

// Mock for @tauri-apps/api/core
export const invoke = vi.fn().mockImplementation((command: string, args?: any) => {
  switch (command) {
    case 'start_timer':
      return Promise.resolve();
    case 'stop_timer':
      return Promise.resolve();
    case 'get_timer_state':
      return Promise.resolve({
        is_running: false,
        task_name: '',
        elapsed_ms: 0,
      });
    case 'update_tray_tooltip':
      return Promise.resolve();
    case 'get_daily_total':
      return Promise.resolve({
        total_duration_ms: 0,
        task_count: 0,
      });
    case 'export_data_to_file':
      // Mock successful export with a fake file path
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      return Promise.resolve(`/mock/path/taskmint_export_${timestamp}.json`);
    default:
      return Promise.resolve();
  }
});

// Mock for @tauri-apps/api/event
export const listen = vi.fn().mockImplementation((_event: string, _handler: Function) => {
  return Promise.resolve(() => {}); // Return unsubscribe function
});

export const emit = vi.fn().mockResolvedValue(undefined);

export const once = vi.fn().mockImplementation((_event: string, _handler: Function) => {
  return Promise.resolve(() => {});
});

// Mock for @tauri-apps/api/webviewWindow
export class WebviewWindow {
  label: string;
  
  constructor(label: string, _options?: any) {
    this.label = label;
  }

  static async getByLabel(label: string) {
    return new WebviewWindow(label);
  }

  async show() {
    return Promise.resolve();
  }

  async hide() {
    return Promise.resolve();
  }

  async close() {
    return Promise.resolve();
  }

  async minimize() {
    return Promise.resolve();
  }

  async maximize() {
    return Promise.resolve();
  }

  async unmaximize() {
    return Promise.resolve();
  }

  async toggleMaximize() {
    return Promise.resolve();
  }

  async setResizable(_resizable: boolean) {
    return Promise.resolve();
  }

  async setTitle(_title: string) {
    return Promise.resolve();
  }

  async center() {
    return Promise.resolve();
  }

  async setPosition(_position: { x: number; y: number }) {
    return Promise.resolve();
  }

  async setSize(_size: { width: number; height: number }) {
    return Promise.resolve();
  }

  async setMinSize(_size: { width: number; height: number }) {
    return Promise.resolve();
  }

  async setMaxSize(_size: { width: number; height: number }) {
    return Promise.resolve();
  }

  async setAlwaysOnTop(_alwaysOnTop: boolean) {
    return Promise.resolve();
  }

  async setDecorations(_decorations: boolean) {
    return Promise.resolve();
  }

  async setShadow(_enable: boolean) {
    return Promise.resolve();
  }

  async setEffects(_effects: any) {
    return Promise.resolve();
  }

  async clearEffects() {
    return Promise.resolve();
  }

  async setFullscreen(_fullscreen: boolean) {
    return Promise.resolve();
  }

  async setFocus() {
    return Promise.resolve();
  }

  async setIcon(_icon: string) {
    return Promise.resolve();
  }

  async setSkipTaskbar(_skip: boolean) {
    return Promise.resolve();
  }

  async setCursorGrab(_grab: boolean) {
    return Promise.resolve();
  }

  async setCursorVisible(_visible: boolean) {
    return Promise.resolve();
  }

  async setCursorIcon(_icon: string) {
    return Promise.resolve();
  }

  async setCursorPosition(_position: { x: number; y: number }) {
    return Promise.resolve();
  }

  async setIgnoreCursorEvents(_ignore: boolean) {
    return Promise.resolve();
  }

  async startDragging() {
    return Promise.resolve();
  }

  async onResized(_handler: Function) {
    return Promise.resolve(() => {});
  }

  async onMoved(_handler: Function) {
    return Promise.resolve(() => {});
  }

  async onCloseRequested(_handler: Function) {
    return Promise.resolve(() => {});
  }

  async onFocusChanged(_handler: Function) {
    return Promise.resolve(() => {});
  }

  async onScaleChanged(_handler: Function) {
    return Promise.resolve(() => {});
  }

  async onMenuClicked(_handler: Function) {
    return Promise.resolve(() => {});
  }

  async onFileDropEvent(_handler: Function) {
    return Promise.resolve(() => {});
  }

  async onThemeChanged(_handler: Function) {
    return Promise.resolve(() => {});
  }
}

// Mock for @tauri-apps/api/window (legacy)
export const appWindow = new WebviewWindow('main');

// Mock for @tauri-apps/api/app
export const getName = vi.fn().mockResolvedValue('TaskMint');
export const getVersion = vi.fn().mockResolvedValue('1.0.0');
export const getTauriVersion = vi.fn().mockResolvedValue('2.0.0');

// Mock for @tauri-apps/api/os
export const platform = vi.fn().mockResolvedValue('darwin');
export const version = vi.fn().mockResolvedValue('13.0.0');
export const type = vi.fn().mockResolvedValue('Darwin');
export const arch = vi.fn().mockResolvedValue('x86_64');
export const tempdir = vi.fn().mockResolvedValue('/tmp');

// Mock for @tauri-apps/api/path
export const appDir = vi.fn().mockResolvedValue('/app');
export const appConfigDir = vi.fn().mockResolvedValue('/app/config');
export const appDataDir = vi.fn().mockResolvedValue('/app/data');
export const appLocalDataDir = vi.fn().mockResolvedValue('/app/local-data');
export const appCacheDir = vi.fn().mockResolvedValue('/app/cache');
export const appLogDir = vi.fn().mockResolvedValue('/app/logs');
export const audioDir = vi.fn().mockResolvedValue('/audio');
export const cacheDir = vi.fn().mockResolvedValue('/cache');
export const configDir = vi.fn().mockResolvedValue('/config');
export const dataDir = vi.fn().mockResolvedValue('/data');
export const desktopDir = vi.fn().mockResolvedValue('/desktop');
export const documentDir = vi.fn().mockResolvedValue('/documents');
export const downloadDir = vi.fn().mockResolvedValue('/downloads');
export const executableDir = vi.fn().mockResolvedValue('/executable');
export const fontDir = vi.fn().mockResolvedValue('/fonts');
export const homeDir = vi.fn().mockResolvedValue('/home');
export const localDataDir = vi.fn().mockResolvedValue('/local-data');
export const pictureDir = vi.fn().mockResolvedValue('/pictures');
export const publicDir = vi.fn().mockResolvedValue('/public');
export const resourceDir = vi.fn().mockResolvedValue('/resources');
export const runtimeDir = vi.fn().mockResolvedValue('/runtime');
export const templateDir = vi.fn().mockResolvedValue('/templates');
export const videoDir = vi.fn().mockResolvedValue('/videos');
export const logDir = vi.fn().mockResolvedValue('/logs');

// Mock for @tauri-apps/api/fs
export const readTextFile = vi.fn().mockResolvedValue('');
export const writeTextFile = vi.fn().mockResolvedValue(undefined);
export const readBinaryFile = vi.fn().mockResolvedValue(new Uint8Array());
export const writeBinaryFile = vi.fn().mockResolvedValue(undefined);
export const exists = vi.fn().mockResolvedValue(true);
export const createDir = vi.fn().mockResolvedValue(undefined);
export const removeDir = vi.fn().mockResolvedValue(undefined);
export const removeFile = vi.fn().mockResolvedValue(undefined);
export const renameFile = vi.fn().mockResolvedValue(undefined);
export const copyFile = vi.fn().mockResolvedValue(undefined);

// Mock for @tauri-apps/api/dialog
export const open = vi.fn().mockResolvedValue(null);
export const save = vi.fn().mockResolvedValue(null);
export const message = vi.fn().mockResolvedValue(undefined);
export const ask = vi.fn().mockResolvedValue(false);
export const confirm = vi.fn().mockResolvedValue(false);

// Mock for @tauri-apps/api/notification and @tauri-apps/plugin-notification
export const sendNotification = vi.fn().mockResolvedValue(undefined);
export const requestPermission = vi.fn().mockResolvedValue('granted');
export const isPermissionGranted = vi.fn().mockResolvedValue(true);

// Mock for @tauri-apps/api/clipboard
export const writeText = vi.fn().mockResolvedValue(undefined);
export const readText = vi.fn().mockResolvedValue('');

// Mock for @tauri-apps/api/shell
export const shellOpen = vi.fn().mockResolvedValue(undefined);

// Default export for the entire module
export default {
  invoke,
  listen,
  emit,
  once,
  WebviewWindow,
  appWindow,
  getName,
  getVersion,
  getTauriVersion,
  platform,
  version,
  type,
  arch,
  tempdir,
  // ... other exports
};
