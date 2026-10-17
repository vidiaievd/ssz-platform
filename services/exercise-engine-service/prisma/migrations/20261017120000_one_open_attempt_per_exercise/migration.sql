-- One open attempt per learner and exercise (plan 76, 2.5).
--
-- The start handler looks for an open attempt and creates one only if there is none, but
-- the two are seconds apart — the exercise is fetched from content-service in between — so
-- two starts racing each other (React StrictMode in dev, a double click, two tabs, a retried
-- request) both found nothing and both inserted. The dev stand held 18 such pairs, created
-- 0–23 ms apart. Only the database can make the rule hold; the handler then answers the
-- loser as it answers any start that finds an open attempt.

-- Settle the pairs already there: keep the attempt that carries work, else the newest, and
-- abandon the rest — the lifecycle's own way out of IN_PROGRESS.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, exercise_id
           ORDER BY (draft_answer IS NOT NULL
                     OR answered_questions IS NOT NULL
                     OR checked_rows IS NOT NULL
                     OR picked_options IS NOT NULL
                     OR submitted_answer IS NOT NULL
                     OR recheck_count > 0) DESC,
                    COALESCE(draft_saved_at, started_at) DESC,
                    started_at DESC,
                    id DESC
         ) AS rn
    FROM attempts
   WHERE status = 'in_progress'
)
UPDATE attempts
   SET status = 'abandoned'
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Partial unique index: Prisma's schema cannot express it, so it lives here (see schema.prisma,
-- model Attempt). The repository turns a violation into OpenAttemptExistsError.
CREATE UNIQUE INDEX "attempts_one_open_per_user_exercise"
    ON "attempts" ("user_id", "exercise_id")
 WHERE "status" = 'in_progress';
