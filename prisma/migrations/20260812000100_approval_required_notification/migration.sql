-- "Waiting on your decision" is a different event from "your work was approved",
-- and the notification list should be able to say which one it is showing.
--
-- Adding a value to an enum touches no existing row: everything already stored
-- keeps its value, and nothing reads this one until the new code ships.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'APPROVAL_REQUIRED' AFTER 'REVISION_REQUEST';
