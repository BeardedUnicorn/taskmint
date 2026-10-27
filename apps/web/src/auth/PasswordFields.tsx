import { TextField } from '@mui/material';

/** The server's rule (accounts::password). */
export const PASSWORD_MIN = 8;

/** Why a new password can't be used yet, if it can't. */
export function passwordProblem(password: string, confirmation: string): string | null {
  if ([...password].length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password !== confirmation) return "The passwords don't match.";
  return null;
}

/** A new password, typed twice. */
export function PasswordFields({
  password,
  confirmation,
  onPassword,
  onConfirmation,
  label = 'New password',
}: {
  password: string;
  confirmation: string;
  onPassword: (value: string) => void;
  onConfirmation: (value: string) => void;
  label?: string;
}) {
  return (
    <>
      <TextField
        label={label}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={event => onPassword(event.target.value)}
        helperText={`At least ${PASSWORD_MIN} characters`}
        required
        fullWidth
      />
      <TextField
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={event => onConfirmation(event.target.value)}
        required
        fullWidth
      />
    </>
  );
}
