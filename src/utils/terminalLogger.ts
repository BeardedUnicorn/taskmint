import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class TerminalLogger {
  private async logToTerminal(level: LogLevel, message: string) {
    try {
      await invoke('log_to_terminal', { level, message });
    } catch (error) {
      // Fallback to console if Tauri command fails
      console.error('Failed to log to terminal:', error);
      console.log(`[${level.toUpperCase()}] ${message}`);
    }
  }

  debug(message: string) {
    console.log(message); // Also log to browser console
    this.logToTerminal('debug', message);
  }

  info(message: string) {
    console.log(message); // Also log to browser console
    this.logToTerminal('info', message);
  }

  warn(message: string) {
    console.warn(message); // Also log to browser console
    this.logToTerminal('warn', message);
  }

  error(message: string) {
    console.error(message); // Also log to browser console
    this.logToTerminal('error', message);
  }

  log(message: string) {
    console.log(message); // Also log to browser console
    this.logToTerminal('info', message);
  }
}

// Create a singleton instance
export const terminalLogger = new TerminalLogger();

// Export individual functions for convenience
export const debugLog = (message: string) => terminalLogger.debug(message);
export const infoLog = (message: string) => terminalLogger.info(message);
export const warnLog = (message: string) => terminalLogger.warn(message);
export const errorLog = (message: string) => terminalLogger.error(message);
export const log = (message: string) => terminalLogger.log(message);