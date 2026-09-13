/** A lesson a learner is to be reminded of. */
export interface RemindableLesson {
  id: string;
  groupId: string;
  schoolId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
}

export interface Reminder {
  userId: string;
  lessonId: string;
  date: string;
  startTime: string;
  endTime: string;
  isExam: boolean;
}

/**
 * Who hears about what, and who does not hear twice.
 *
 * Cancelled lessons are already gone by the time this runs — the timetable does not return
 * them — but a lesson somebody has already been told about can come back on the next run,
 * after a redeploy or an hour caught up late. `alreadyTold` is what keeps the second run
 * quiet, and it is checked here rather than in the loop so the rule has one place and a
 * test of its own.
 */
export function composeReminders(input: {
  lessons: readonly RemindableLesson[];
  membersByGroup: ReadonlyMap<string, readonly string[]>;
  alreadyTold: ReadonlySet<string>;
}): Reminder[] {
  const reminders: Reminder[] = [];

  for (const lesson of input.lessons) {
    const members = input.membersByGroup.get(lesson.groupId);
    // A group whose roster could not be read is skipped, not guessed at: a reminder to
    // nobody is better than a reminder to the wrong person.
    if (!members) continue;

    for (const userId of members) {
      if (input.alreadyTold.has(key(lesson.id, userId))) continue;
      reminders.push({
        userId,
        lessonId: lesson.id,
        date: lesson.date,
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        isExam: lesson.type === 'exam',
      });
    }
  }

  return reminders;
}

/** The pair a reminder is remembered by. */
export function key(lessonId: string, userId: string): string {
  return `${lessonId}:${userId}`;
}

/** The day after a given one, as an ISO date — the day a reminder is about. */
export function tomorrowOf(now: Date): string {
  return new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
}
