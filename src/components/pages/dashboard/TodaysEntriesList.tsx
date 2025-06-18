import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Box,
  Button,
  Stack,
} from '@mui/material';
import { TimeEntry } from '../../../types/timer';
import { Task } from '../../../types/task';
import { EditTimeEntryDialog } from '../../ui/dialogs/EditTimeEntryDialog';
import { ConfirmDialog } from '../../ui';
import { EditTimeEntryData } from '../../../types/form';
import { formatLocalTime } from '../../../utils/dateHelpers';
import { formatDuration } from '../../../utils/formatters';
import { EarningsDisplay } from '../../ui/display/EarningsDisplay';

interface TodaysEntriesListProps {
  entries: TimeEntry[];
  tasks: Task[];
  onUpdateEntry: (entry: TimeEntry) => void;
  onDeleteEntry: (entryId: string) => void;
}

export function TodaysEntriesList({
  entries,
  tasks,
  onUpdateEntry,
  onDeleteEntry,
}: TodaysEntriesListProps) {
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
  };

  const handleDeleteEntry = (entryId: string) => {
    setDeletingEntryId(entryId);
  };

  const handleSaveEdit = (data: EditTimeEntryData) => {
    if (!editingEntry) return;

    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    const updatedEntry: TimeEntry = {
      ...editingEntry,
      taskName: data.taskName,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      date: startTime.toISOString().split('T')[0],
    };

    onUpdateEntry(updatedEntry);
    setEditingEntry(null);
  };

  const handleConfirmDelete = () => {
    if (deletingEntryId) {
      onDeleteEntry(deletingEntryId);
      setDeletingEntryId(null);
    }
  };

  const getTaskById = (taskId?: string) => {
    if (!taskId) return undefined;
    return tasks.find(task => task.id === taskId);
  };

  const getTaskByName = (taskName: string) => {
    return tasks.find(task => task.name === taskName);
  };

  if (entries.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          No time entries for today yet.
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <TableContainer
        component={Paper}
        sx={{
          mt: 2,
          backgroundColor: 'transparent',
          backgroundImage: 'none',
          boxShadow: 'none',
        }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                <Typography variant="subtitle2" fontWeight={600}>
                  Task
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight={600}>
                  Start Time
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight={600}>
                  End Time
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight={600}>
                  Duration
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="subtitle2" fontWeight={600}>
                  Earnings
                </Typography>
              </TableCell>
              <TableCell align="right">
                <Typography variant="subtitle2" fontWeight={600}>
                  Actions
                </Typography>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry) => {
              // Find task for earnings calculation
              let task = getTaskById(entry.taskId);
              if (!task) {
                task = getTaskByName(entry.taskName);
              }

              const earnings = task?.hourlyRate && entry.duration
                ? (entry.duration / (1000 * 60 * 60)) * task.hourlyRate
                : 0;

              return (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {entry.taskName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatLocalTime(entry.startTime)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {entry.endTime ? formatLocalTime(entry.endTime) : 'Running'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {entry.duration ? formatDuration(entry.duration) : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <EarningsDisplay amount={earnings} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => handleEditEntry(entry)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => handleDeleteEntry(entry.id)}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit Dialog */}
      {editingEntry && (
        <EditTimeEntryDialog
          open={true}
          entry={{
            id: editingEntry.id,
            taskName: editingEntry.taskName,
            startTime: editingEntry.startTime.toISOString().slice(0, 16),
            endTime: editingEntry.endTime?.toISOString().slice(0, 16) || '',
          }}
          tasks={tasks}
          onSave={handleSaveEdit}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deletingEntryId !== null}
        title="Delete Time Entry"
        message="Are you sure you want to delete this time entry? This action cannot be undone."
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingEntryId(null)}
      />
    </>
  );
}
