-- The withdrawals record: the withdrawals the user took from the payment
-- site, which the Calendar and Payouts count the next one from.
-- Forward-only.

ALTER TABLE app_records DROP CONSTRAINT app_records_key_check;

ALTER TABLE app_records ADD CONSTRAINT app_records_key_check CHECK (key IN (
    'predefinedTasks', 'taskNotes', 'noteTemplates', 'dailyGoal', 'dailyGoalAchievements',
    'withdrawals'
));
