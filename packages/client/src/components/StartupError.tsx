/**
 * Shown instead of the app when its data (the desktop's file, or the
 * server's records) can't be read at startup. Nothing has been written at
 * that point, so trying again is safe.
 */

import type { ComponentType } from 'react';
import { getBackend } from '../backend';
import { reloadApp } from '../utils/appReload';

interface StartupErrorProps {
  message: string;
  /** The shell's other ways out (AppExtensions.StartupErrorActions). */
  Actions?: ComponentType;
}

export function StartupError({ message, Actions }: StartupErrorProps) {
  return (
    <div
      role="alert"
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        maxWidth: 520,
        margin: '15vh auto 0',
        padding: '0 24px',
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
        TaskMint couldn't open your data
      </h1>
      <p style={{ marginTop: 0 }}>
        {getBackend().capabilities.dataLocation === 'server' ? (
          <>Your tasks, notes and goal are kept on your TaskMint server, and they couldn't be read.</>
        ) : (
          <>
            Your tasks, notes and goal are kept in <code>appdata.json</code> in the app's data
            folder, and it couldn't be read.
          </>
        )}{' '}
        Nothing has been changed.
      </p>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          padding: 12,
          borderRadius: 6,
          background: 'rgba(127, 127, 127, 0.15)',
          fontSize: 13,
        }}
      >
        {message}
      </pre>
      <button
        type="button"
        onClick={reloadApp}
        style={{ marginTop: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
      >
        Try again
      </button>
      {Actions && <Actions />}
    </div>
  );
}
