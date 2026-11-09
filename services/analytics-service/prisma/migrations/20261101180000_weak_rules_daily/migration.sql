-- Grammar rules a check named as the ground of a learner's mistake, per day × learner × exercise × atom × source (plan 85, step 10).

CREATE TABLE "weak_rules_daily" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "user_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "atom_type" TEXT NOT NULL,
    "atom_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "school_id" TEXT,
    "group_id" TEXT,
    "container_id" TEXT,
    "in_exercise_targets" BOOLEAN NOT NULL,
    "flagged_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weak_rules_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "weak_rules_daily_key"
  ON "weak_rules_daily" ("day", "user_id", "exercise_id", "atom_type", "atom_id", "source");
CREATE INDEX "weak_rules_daily_user_id_day_idx" ON "weak_rules_daily" ("user_id", "day");
CREATE INDEX "weak_rules_daily_container_id_day_idx" ON "weak_rules_daily" ("container_id", "day");
