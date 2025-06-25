/**
 * Tauri API Mocks
 * 
 * This file provides mock implementations of Tauri APIs for testing purposes.
 * These mocks allow tests to run without the actual Tauri runtime.
 */

// Mock for @tauri-apps/api/core
export const invoke = jest.fn().mockImplementation((command: string, _args?: any) => {
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
    default:
      return Promise.resolve();
  }
});

// Mock for @tauri-apps/api/event
export const listen = jest.fn().mockImplementation((_event: string, _handler: Function) => {
  return Promise.resolve(() => {}); // Return unsubscribe function
});

export const emit = jest.fn().mockResolvedValue(undefined);

export const once = jest.fn().mockImplementation((_event: string, _handler: Function) => {
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
export const getName = jest.fn().mockResolvedValue('TaskMint');
export const getVersion = jest.fn().mockResolvedValue('1.0.0');
export const getTauriVersion = jest.fn().mockResolvedValue('2.0.0');

// Mock for @tauri-apps/api/os
export const platform = jest.fn().mockResolvedValue('darwin');
export const version = jest.fn().mockResolvedValue('13.0.0');
export const type = jest.fn().mockResolvedValue('Darwin');
export const arch = jest.fn().mockResolvedValue('x86_64');
export const tempdir = jest.fn().mockResolvedValue('/tmp');

// Mock for @tauri-apps/api/path
export const appDir = jest.fn().mockResolvedValue('/app');
export const appConfigDir = jest.fn().mockResolvedValue('/app/config');
export const appDataDir = jest.fn().mockResolvedValue('/app/data');
export const appLocalDataDir = jest.fn().mockResolvedValue('/app/local-data');
export const appCacheDir = jest.fn().mockResolvedValue('/app/cache');
export const appLogDir = jest.fn().mockResolvedValue('/app/logs');
export const audioDir = jest.fn().mockResolvedValue('/audio');
export const cacheDir = jest.fn().mockResolvedValue('/cache');
export const configDir = jest.fn().mockResolvedValue('/config');
export const dataDir = jest.fn().mockResolvedValue('/data');
export const desktopDir = jest.fn().mockResolvedValue('/desktop');
export const documentDir = jest.fn().mockResolvedValue('/documents');
export const downloadDir = jest.fn().mockResolvedValue('/downloads');
export const executableDir = jest.fn().mockResolvedValue('/executable');
export const fontDir = jest.fn().mockResolvedValue('/fonts');
export const homeDir = jest.fn().mockResolvedValue('/home');
export const localDataDir = jest.fn().mockResolvedValue('/local-data');
export const pictureDir = jest.fn().mockResolvedValue('/pictures');
export const publicDir = jest.fn().mockResolvedValue('/public');
export const resourceDir = jest.fn().mockResolvedValue('/resources');
export const runtimeDir = jest.fn().mockResolvedValue('/runtime');
export const templateDir = jest.fn().mockResolvedValue('/templates');
export const videoDir = jest.fn().mockResolvedValue('/videos');
export const logDir = jest.fn().mockResolvedValue('/logs');

// Mock for @tauri-apps/api/fs
export const readTextFile = jest.fn().mockResolvedValue('');
export const writeTextFile = jest.fn().mockResolvedValue(undefined);
export const readBinaryFile = jest.fn().mockResolvedValue(new Uint8Array());
export const writeBinaryFile = jest.fn().mockResolvedValue(undefined);
export const exists = jest.fn().mockResolvedValue(true);
export const createDir = jest.fn().mockResolvedValue(undefined);
export const removeDir = jest.fn().mockResolvedValue(undefined);
export const removeFile = jest.fn().mockResolvedValue(undefined);
export const renameFile = jest.fn().mockResolvedValue(undefined);
export const copyFile = jest.fn().mockResolvedValue(undefined);

// Mock for @tauri-apps/api/dialog
export const open = jest.fn().mockResolvedValue(null);
export const save = jest.fn().mockResolvedValue(null);
export const message = jest.fn().mockResolvedValue(undefined);
export const ask = jest.fn().mockResolvedValue(false);
export const confirm = jest.fn().mockResolvedValue(false);

// Mock for @tauri-apps/api/notification and @tauri-apps/plugin-notification
export const sendNotification = jest.fn().mockResolvedValue(undefined);
export const requestPermission = jest.fn().mockResolvedValue('granted');
export const isPermissionGranted = jest.fn().mockResolvedValue(true);

// Mock for @tauri-apps/api/clipboard
export const writeText = jest.fn().mockResolvedValue(undefined);
export const readText = jest.fn().mockResolvedValue('');

// Mock for @tauri-apps/api/shell
export const shellOpen = jest.fn().mockResolvedValue(undefined);

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
