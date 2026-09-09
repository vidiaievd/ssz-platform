-- Plan 44 §44.14 — the second review system goes.
--
-- Work handed in for a person to read is an attempt in the exercise engine now, and has
-- been since plan 44 gave attempts a school, a course and a group. These tables held a
-- parallel record that nothing wrote to any more, and one route over them
-- (`GET /review/submissions/pending?schoolId=`) answered without checking that the caller
-- belonged to the school it named.

DROP TABLE IF EXISTS "submission_revisions";
DROP TABLE IF EXISTS "submissions";

DROP TYPE IF EXISTS "revision_decision";
DROP TYPE IF EXISTS "submission_status";
