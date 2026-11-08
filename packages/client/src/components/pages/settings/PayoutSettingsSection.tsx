import { FormControl, FormHelperText, InputLabel, MenuItem, Select, Stack } from '@mui/material';
import { AccountBalanceWallet as PayoutsIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { useFundsReleaseSettings } from '../../../hooks/useFundsReleaseSettings';
import { useWithdrawalIntervalSetting } from '../../../hooks/useWithdrawalIntervalSetting';

/** The payment site's rules: how long it holds earnings, and how often it allows a withdrawal. */
export function PayoutSettingsSection() {
  const { days, updateDays } = useFundsReleaseSettings();
  const interval = useWithdrawalIntervalSetting();
  return (
    <SettingsSection title="Payouts" icon={<PayoutsIcon color="primary" />}>
      <Stack spacing={3}>
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
            How many days after a work day its earnings can be transferred. Payouts uses it for what's available now and
            what's pending.
          </FormHelperText>
        </FormControl>

        <FormControl sx={{ minWidth: 250 }}>
          <InputLabel id="withdrawal-interval-label">Days Between Withdrawals</InputLabel>
          <Select
            labelId="withdrawal-interval-label"
            value={interval.days}
            label="Days Between Withdrawals"
            onChange={event => interval.updateDays(Number(event.target.value))}
            aria-describedby="withdrawal-interval-help"
          >
            {[...Array(15).keys()].map(day => (
              <MenuItem key={day} value={day}>
                {day}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText id="withdrawal-interval-help">
            How long the payment site makes you wait after a withdrawal, counted to the minute (3 days is 72 hours). The
            Calendar and Payouts show when the next one opens.
          </FormHelperText>
        </FormControl>
      </Stack>
    </SettingsSection>
  );
}
