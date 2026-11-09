-- The accountSettings record: the settings that change the numbers
-- (funds-release days, the withdrawal interval), kept with the data so
-- every device computes the same release and withdrawal dates.
-- Forward-only.

ALTER TABLE app_records DROP CONSTRAINT app_records_key_check;

ALTER TABLE app_records ADD CONSTRAINT app_records_key_check CHECK (key IN (
    'predefinedTasks', 'taskNotes', 'noteTemplates', 'dailyGoal', 'dailyGoalAchievements',
    'withdrawals', 'accountSettings'
));
