/**
 * One day's breakdown as stacked rows, for the phone's agenda (a day opens
 * in place): each task's time and amount, the money released that day, the
 * withdrawals, the next withdrawal's opening, and how the day did against
 * the goal. The desktop shows the same breakdown as tables, in a dialog.
 */

import { ReactNode, useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Savings as SavingsIcon } from '@mui/icons-material';
import { usePayoutData } from '../../../hooks/usePayoutData';
import { useWithdrawals } from '../../../hooks/useWithdrawals';
import { Withdrawal } from '../../../types/withdrawal';
import { formatCents, formatPayoutAmount } from '../../../utils/payoutCalculator';
import { formatDurationCompact } from '../../../utils/formatters';
import { formatClockTime, formatWeekdayDate } from '../../../utils/locale';
import { parseDateStringLocal } from '../../../utils/dateHelpers';
import { MONO } from '../payouts/payoutStyles';
import { RecordWithdrawalDialog } from '../payouts/withdrawals/RecordWithdrawalDialog';
import { buildDayBreakdown, CalendarDay } from './calendarMonth';
import { goalText } from './calendarText';
import { NOTHING_ON_DAY, OpeningAlert, Section, StatusChips, sumBy } from './dayBreakdownParts';

/** "2h 1m tracked · 1h 58m reported", leaving out what's zero. */
function timesText(trackedMs: number, reportedMs: number): string {
  return [
    trackedMs > 0 && `${formatDurationCompact(trackedMs)} tracked`,
    reportedMs > 0 && `${formatDurationCompact(reportedMs)} reported`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** A row: what it is on the left (wrapping), its amount on the right, more below. */
function Row({ title, amount, children }: { title: ReactNode; amount: ReactNode; children?: ReactNode }) {
  return (
    <Box
      role="listitem"
      sx={{
        py: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        '& + &': { borderTop: 1, borderColor: 'divider' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
        <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={{ ...MONO, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {amount}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

/** What's under a row's title: a line of text and the site's statuses. */
function Details({ text, statuses = [] }: { text: string; statuses?: string[] }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      {text && (
        <Typography variant="caption" color="text.secondary">
          {text}
        </Typography>
      )}
      {statuses.length > 0 && <StatusChips statuses={statuses} />}
    </Box>
  );
}

export function DayDetails({ day }: { day: CalendarDay }) {
  const { cells, events, plan, nowMs, today } = usePayoutData();
  const { withdrawals, deleteWithdrawal } = useWithdrawals();
  const [editing, setEditing] = useState<Withdrawal | 'new' | null>(null);
  const { worked, released, withdrawn, opening } = buildDayBreakdown(day.date, { cells, events, withdrawals, plan });
  const goal = goalText(day);

  return (
    <Box sx={{ px: 2, pt: 0.5, pb: 2 }}>
      {opening && <OpeningAlert opening={opening} />}

      {worked.length === 0 && released.length === 0 && withdrawn.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {NOTHING_ON_DAY}
        </Typography>
      )}

      {worked.length > 0 && (
        <Section title="Worked">
          <Box role="list" aria-label="Worked">
            {worked.map(cell => (
              <Row
                key={cell.taskId}
                title={cell.taskName}
                amount={formatPayoutAmount(cell.actualCents, cell.estimatedCents)}
              >
                <Details
                  text={timesText(cell.trackedMs, cell.importedMinutes * 60_000)}
                  statuses={cell.isEstimate ? ['Estimate'] : cell.statuses}
                />
              </Row>
            ))}
            {worked.length > 1 && (
              <Row
                title="Total"
                amount={formatPayoutAmount(
                  sumBy(worked, cell => cell.actualCents),
                  sumBy(worked, cell => cell.estimatedCents)
                )}
              >
                <Details
                  text={timesText(
                    sumBy(worked, cell => cell.trackedMs),
                    sumBy(worked, cell => cell.importedMinutes * 60_000)
                  )}
                />
              </Row>
            )}
          </Box>
          {goal && (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 0.5 }}>
              {goal}
            </Typography>
          )}
        </Section>
      )}

      {released.length > 0 && (
        <Section title="Released">
          <Box role="list" aria-label="Released">
            {released.map((event, index) => (
              <Row
                key={`${event.taskId}-${event.releaseMs}-${index}`}
                title={`${event.releaseTime ? `${formatClockTime(event.releaseMs)} · ` : ''}${event.taskName}`}
                amount={formatPayoutAmount(event.actualCents, event.estimatedCents)}
              >
                <Details
                  text={`Worked on ${formatWeekdayDate(parseDateStringLocal(event.workDay))}${
                    event.releaseMs > nowMs ? ' · upcoming' : ''
                  }`}
                  statuses={[event.status ?? 'Estimate']}
                />
              </Row>
            ))}
          </Box>
        </Section>
      )}

      {withdrawn.length > 0 && (
        <Section title="Withdrawals">
          <Box role="list" aria-label="Withdrawals">
            {withdrawn.map(withdrawal => {
              const at = formatClockTime(withdrawal.takenAt);
              return (
                <Box
                  role="listitem"
                  key={withdrawal.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    '& + &': { borderTop: 1, borderColor: 'divider' },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {at}
                    </Typography>
                    {withdrawal.note && (
                      <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {withdrawal.note}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="body2" sx={{ ...MONO, fontWeight: 600 }}>
                    {formatCents(withdrawal.amountCents)}
                  </Typography>
                  <IconButton aria-label={`Edit the withdrawal at ${at}`} onClick={() => setEditing(withdrawal)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    aria-label={`Delete the withdrawal at ${at}`}
                    onClick={() => deleteWithdrawal(withdrawal.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              );
            })}
          </Box>
        </Section>
      )}

      {day.date <= today && (
        <Button variant="outlined" startIcon={<SavingsIcon />} onClick={() => setEditing('new')} sx={{ mt: 2 }}>
          Record withdrawal on this day
        </Button>
      )}

      {editing && (
        <RecordWithdrawalDialog
          withdrawal={editing === 'new' ? undefined : editing}
          initialDay={day.date}
          onClose={() => setEditing(null)}
        />
      )}
    </Box>
  );
}
