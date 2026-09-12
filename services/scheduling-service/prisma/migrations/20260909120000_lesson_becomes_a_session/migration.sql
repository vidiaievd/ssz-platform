-- A lesson grows into a full session: what kind it is, what topic it covered,
-- who turned up, how the group scored, and why it did not happen. Until now a
-- lesson was only a slot occurrence with a status, and everything a manager
-- actually wants to read about it lived nowhere.

-- What kind of session. An exam is a type of lesson, not a second entity: that
-- keeps assessment in the same log as teaching.
CREATE TYPE "lesson_type" AS ENUM ('lesson', 'exam', 'make_up', 'review');

ALTER TABLE "lessons"
  ADD COLUMN "type" "lesson_type" NOT NULL DEFAULT 'lesson',
  -- The topic, referenced into the linked course. Identifies the content, not
  -- its placement in a published version, so republishing the course does not
  -- orphan the topic.
  ADD COLUMN "content_unit_id" TEXT,
  ADD COLUMN "content_lesson_id" TEXT,
  ADD COLUMN "attendance" INTEGER,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "extra" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "plan_index" INTEGER,
  ADD COLUMN "pass_mark" INTEGER;

-- A slot can be scheduled before anyone is assigned to teach it, and a session
-- taught by nobody is a fact worth recording rather than an impossible row.
ALTER TABLE "lessons" ALTER COLUMN "teacher_id" DROP NOT NULL;

-- Scores as rows keyed by student, not a blob on the lesson: a student who
-- leaves the group stops being found and drops out of the average, and one
-- student's mark can be written without rewriting the rest.
CREATE TABLE "lesson_scores" (
  "id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  -- 0..100. Null is "not graded yet" — neither a pass nor a zero.
  "score" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lesson_scores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lesson_scores_lesson_id_student_id_key"
  ON "lesson_scores"("lesson_id", "student_id");
CREATE INDEX "lesson_scores_lesson_id_idx" ON "lesson_scores"("lesson_id");

ALTER TABLE "lesson_scores"
  ADD CONSTRAINT "lesson_scores_lesson_id_fkey"
  FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Where a school's pass mark lives; a single exam may override it via
-- lessons.pass_mark.
CREATE TABLE "grading_policies" (
  "school_id" TEXT NOT NULL,
  "pass_mark" INTEGER NOT NULL DEFAULT 60,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "grading_policies_pkey" PRIMARY KEY ("school_id")
);
