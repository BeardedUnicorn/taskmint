/**
 * A "Range" picker of quick date ranges, shown beside a pair of date
 * pickers. It shows "Custom" when the dates don't match a preset, and the
 * chosen preset when two cover the same days (see matchPreset).
 */

import { MenuItem, TextField } from '@mui/material';
import { Dayjs } from 'dayjs';
import { DATE_RANGE_PRESETS, DateRange, DateRangePreset, matchPreset, presetRange } from '../../../utils/dateRanges';

interface DateRangePresetSelectProps {
  start: Dayjs | null;
  end: Dayjs | null;
  /** The preset chosen last, if any: it keeps its name when another matches too. */
  preset?: DateRangePreset | null;
  onChange: (range: DateRange, preset: DateRangePreset) => void;
}

const CUSTOM = 'custom';

export function DateRangePresetSelect({ start, end, preset, onChange }: DateRangePresetSelectProps) {
  const value = matchPreset(start, end, preset) ?? CUSTOM;

  return (
    <TextField
      select
      size="small"
      label="Range"
      value={value}
      onChange={event => {
        const chosen = event.target.value as DateRangePreset;
        onChange(presetRange(chosen), chosen);
      }}
      fullWidth
    >
      {DATE_RANGE_PRESETS.map(option => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
      {/* Shown (not choosable) while the dates are edited by hand */}
      <MenuItem value={CUSTOM} disabled sx={{ display: value === CUSTOM ? undefined : 'none' }}>
        Custom
      </MenuItem>
    </TextField>
  );
}
