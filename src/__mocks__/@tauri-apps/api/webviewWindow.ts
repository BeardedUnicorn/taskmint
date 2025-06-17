/**
 * Mock for @tauri-apps/api/webviewWindow
 */

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

  async once(_event: string, _handler: Function) {
    return Promise.resolve(() => {});
  }
}

// Mock for @tauri-apps/api/window (legacy)
export const appWindow = new WebviewWindow('main');
