import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Stack,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
} from '@mui/material';
import { TimeEntry } from '../../types/timer';
import { Task } from '../../types/task';
import { formatDuration } from '../../utils/formatters';
import { formatDateString, formatDateTimeLocal } from '../../utils/dateHelpers';
import { DateNavigator, ConfirmDialog } from '../ui';
import { EditTimeEntryDialog } from '../ui/dialogs/EditTimeEntryDialog';
import { TimeEntryRow } from '../ui/tables/TimeEntryRow';
import { EditTimeEntryData } from '../../types/form';
import dayjs from 'dayjs';

interface CalendarViewProps {
  entries: TimeEntry[];
  tasks: Task[];
  onUpdateEntry: (entry: TimeEntry) => void;
  onDeleteEntry: (entryId: string) => void;
}

export function CalendarView({ entries, tasks, onUpdateEntry, onDeleteEntry }: CalendarViewProps) {
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [editingEntry, setEditingEntry] = useState<EditTimeEntryData | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // formatDuration function is now imported from utils/formatters

  const getTaskById = (taskId?: string): Task | undefined => {
    if (!taskId) return undefined;
    return tasks.find(task => task.id === taskId);
  };

  const getTaskByName = (taskName: string): Task | undefined => {
    return tasks.find(task => task.name === taskName);
  };

  const calculateEarnings = (entry: TimeEntry): number | undefined => {
    if (!entry.duration) return undefined;

    // Try to get task by ID first, then by name
    let task = getTaskById(entry.taskId);
    if (!task) {
      task = getTaskByName(entry.taskName);
    }

    if (!task?.hourlyRate || task.hourlyRate <= 0) return undefined;

    const hours = entry.duration / (1000 * 60 * 60);
    return hours * task.hourlyRate;
  };

  const formatEarnings = (earnings?: number): string => {
    if (earnings === undefined || earnings === null) return 'N/A';
    return `$${earnings.toFixed(2)}`;
  };

  // formatLocalTime and formatDateTimeLocal functions are now imported from utils/dateHelpers

  const getEntriesForDate = (date: dayjs.Dayjs) => {
    const dateString = date.format('YYYY-MM-DD');
    return entries.filter(entry => {
      const entryLocalDate = dayjs(entry.startTime).local().format('YYYY-MM-DD');
      return entryLocalDate === dateString && entry.duration && entry.duration > 0;
    });
  };

  const getTotalDurationForDate = (entries: TimeEntry[]) => {
    return entries.reduce((total, entry) => total + (entry.duration || 0), 0);
  };

  const getTotalEarningsForDate = (entries: TimeEntry[]) => {
    return entries.reduce((total, entry) => {
      const earnings = calculateEarnings(entry);
      return total + (earnings || 0);
    }, 0);
  };

  const handleEditStart = (entry: TimeEntry) => {
    setEditingEntry({
      id: entry.id,
      taskName: entry.taskName,
      startTime: formatDateTimeLocal(entry.startTime),
      endTime: entry.endTime ? formatDateTimeLocal(entry.endTime) : '',
    });
  };

  const handleEditSave = (data: EditTimeEntryData) => {
    const originalEntry = entries.find(e => e.id === data.id);
    if (!originalEntry) return;

    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    const updatedEntry: TimeEntry = {
      ...originalEntry,
      taskName: data.taskName.trim(),
      startTime,
      endTime,
      duration: data.duration,
      date: formatDateString(startTime),
      isRunning: false,
    };

    onUpdateEntry(updatedEntry);
    setEditingEntry(null);
  };

  const selectedDateEntries = getEntriesForDate(selectedDate);
  const totalDuration = getTotalDurationForDate(selectedDateEntries);
  const totalEarnings = getTotalEarningsForDate(selectedDateEntries);

  return (
    <>
      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          p: 2,
          '&:last-child': { pb: 2 }
        }}>
          {/* Header */}
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">
              Daily Time Entries
            </Typography>
            <DateNavigator
              selectedDate={selectedDate.toDate()}
              onDateChange={(date: Date) => setSelectedDate(dayjs(date))}
              onPrevious={() => setSelectedDate(prev => prev.subtract(1, 'day'))}
              onNext={() => setSelectedDate(prev => prev.add(1, 'day'))}
              onToday={() => setSelectedDate(dayjs())}
              format="MMM DD"
            />
          </Stack>

          <Typography variant="subtitle1" color="text.secondary" gutterBottom>
            {selectedDate.format('dddd, MMMM DD, YYYY')}
          </Typography>

          {totalDuration > 0 && (
            <Box mb={2} display="flex" gap={1} flexWrap="wrap">
              <Chip
                label={`Total Time: ${formatDuration(totalDuration)}`}
                color="primary"
                variant="filled"
                size="medium"
              />
              {totalEarnings > 0 && (
                <Chip
                  label={`Total Earnings: ${formatEarnings(totalEarnings)}`}
                  color="success"
                  variant="filled"
                  size="medium"
                />
              )}
            </Box>
          )}

          <Divider sx={{ my: 2 }} />

          {/* Table */}
          <TableContainer
            component={Paper}
            sx={{
              flex: 1,
              backgroundColor: 'transparent',
              backgroundImage: 'none',
              overflow: 'auto'
            }}
          >
            <Table stickyHeader size="medium">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Task</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Start Time</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>End Time</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Duration</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Earnings</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedDateEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography variant="subtitle1" color="text.secondary">
                        No time entries for this date
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  selectedDateEntries
                    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                    .map((entry) => (
                      <TimeEntryRow
                        key={entry.id}
                        entry={entry}
                        tasks={tasks}
                        onEdit={handleEditStart}
                        onDelete={(entryId: string) => setDeleteConfirm(entryId)}
                        showEarnings={true}
                      />
                    ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EditTimeEntryDialog
        open={!!editingEntry}
        onClose={() => setEditingEntry(null)}
        onSave={handleEditSave}
        entry={editingEntry}
        tasks={tasks}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            onDeleteEntry(deleteConfirm);
            setDeleteConfirm(null);
          }
        }}
        title="Delete Time Entry"
        message="Are you sure you want to delete this time entry? This action cannot be undone."
        confirmLabel="Delete"
        severity="error"
      />
    </>
  );
}
