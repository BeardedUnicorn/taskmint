import { FormControl, FormHelperText, InputLabel, MenuItem, Select } from '@mui/material';
import { AccountBalanceWallet as PayoutsIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useFundsReleaseSettings } from '../../../hooks/useFundsReleaseSettings';

/** How long the payment site holds earnings before they can be transferred. */
export function PayoutSettingsSection() {
  const { days, updateDays } = useFundsReleaseSettings();
  return (
    <SettingsSection title="Payouts" icon={<PayoutsIcon color="primary" />}>
      <FormControl sx={{ minWidth: 250 }}>
        <InputLabel id="funds-release-label">Days Before Funds Released</InputLabel>
        <Select
          labelId="funds-release-label"
          value={days}
          label="Days Before Funds Released"
          onChange={event => updateDays(Number(event.target.value))}
          aria-describedby="funds-release-help"
        >
          {[...Array(31).keys()].map(day => (
            <MenuItem key={day} value={day}>
              {day}
            </MenuItem>
          ))}
        </Select>
        <FormHelperText id="funds-release-help">
          How many days after a work day its earnings can be transferred. Payouts uses it for
          what's available now and what's pending.
        </FormHelperText>
      </FormControl>
    </SettingsSection>
  );
}
