/**
 * Shown instead of the app when its data file can't be read at startup.
 * Nothing has been written at that point, so trying again is safe.
 */

interface StartupErrorProps {
  message: string;
}

export function StartupError({ message }: StartupErrorProps) {
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
        Your tasks, notes and goal are kept in <code>appdata.json</code> in the app's data
        folder, and it couldn't be read. Nothing has been changed.
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
        onClick={() => window.location.reload()}
        style={{ marginTop: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
      >
        Try again
      </button>
    </div>
  );
}
