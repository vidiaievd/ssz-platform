-- Plan 44 §44.14 — one review system, and this was the other one.
--
-- The projection existed to count work waiting for a teacher. Since plan 44 the only
-- record of that is the exercise engine's `attempts` table, which analytics now asks
-- directly: a copy that lags by a second shows a school a number the teacher's own queue
-- disagrees with.

DROP TABLE IF EXISTS "submission_projection";
