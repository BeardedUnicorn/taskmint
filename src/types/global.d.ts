// Global type declarations for the Time Tracker application

declare global {
  interface Window {
    // Tauri runtime detection
    __TAURI__?: {
      invoke: (cmd: string, args?: any) => Promise<any>;
      [key: string]: any;
    };
  }
}

export {};
