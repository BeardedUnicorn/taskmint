import { useState } from 'react';
import { sentence, serverMode } from '../server';

/**
 * On the startup error in server mode, beside "Try again": back to the data
 * on this computer. Like the error, it renders outside the app's theme.
 */
export function UseLocalData() {
  const [problem, setProblem] = useState<string | null>(null);

  const useLocal = async () => {
    try {
      await serverMode.disconnect();
      await serverMode.restart();
    } catch (failure) {
      setProblem(sentence(failure));
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={useLocal}
        style={{ marginTop: 8, marginLeft: 8, padding: '8px 16px', fontSize: 14, cursor: 'pointer' }}
      >
        Disconnect and use this computer's data
      </button>
      {problem && <p role="status">{problem}</p>}
    </>
  );
}
