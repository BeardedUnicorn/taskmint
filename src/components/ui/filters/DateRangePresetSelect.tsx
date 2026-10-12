/**
 * A "Range" picker of quick date ranges, shown beside a pair of date
 * pickers. It shows "Custom" when the dates don't match a preset.
 */

import { MenuItem, TextField } from '@mui/material';
import { Dayjs } from 'dayjs';
import {
  DATE_RANGE_PRESETS,
  DateRange,
  DateRangePreset,
  matchPreset,
  presetRange,
} from '../../../utils/dateRanges';

interface DateRangePresetSelectProps {
  start: Dayjs | null;
  end: Dayjs | null;
  onChange: (range: DateRange, preset: DateRangePreset) => void;
  /** For tests; defaults to now. */
  today?: Dayjs;
  fullWidth?: boolean;
}

const CUSTOM = 'custom';

export function DateRangePresetSelect({
  start,
  end,
  onChange,
  today,
  fullWidth = false,
}: DateRangePresetSelectProps) {
  const value = matchPreset(start, end, today) ?? CUSTOM;

  return (
    <TextField
      select
      size="small"
      label="Range"
      value={value}
      onChange={event => {
        const preset = event.target.value as DateRangePreset;
        onChange(presetRange(preset, today), preset);
      }}
      fullWidth={fullWidth}
      sx={fullWidth ? undefined : { minWidth: 160 }}
    >
      {DATE_RANGE_PRESETS.map(preset => (
        <MenuItem key={preset.value} value={preset.value}>
          {preset.label}
        </MenuItem>
      ))}
      {/* Shown (not choosable) while the dates are edited by hand */}
      <MenuItem value={CUSTOM} disabled sx={{ display: value === CUSTOM ? undefined : 'none' }}>
        Custom
      </MenuItem>
    </TextField>
  );
}
