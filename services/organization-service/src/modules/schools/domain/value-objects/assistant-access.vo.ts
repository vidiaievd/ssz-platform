import { InvalidAssistantAccessException } from '../exceptions/invalid-assistant-access.exception.js';

/**
 * Which of a school's students its assistant answers on the school's account (plan 83, Q6):
 *  - `off` — none; every student asks on their own plan;
 *  - `all_students` — every active student (the default, for existing and new schools);
 *  - `selected_groups` — the active members of the chosen groups;
 *  - `selected_students` — the chosen students (later tied to paid seats).
 *
 * A student outside the choice is not refused: they ask on their own plan.
 */
export const AssistantMode = {
  OFF: 'off',
  ALL_STUDENTS: 'all_students',
  SELECTED_GROUPS: 'selected_groups',
  SELECTED_STUDENTS: 'selected_students',
} as const;

export type AssistantMode = (typeof AssistantMode)[keyof typeof AssistantMode];

/** The subscription feature key a school needs to pay for its students' questions. */
export const STUDENT_ASSIST_FEATURE_KEY = 'ai.student_assist';

/** Far above any school's roster; a guard against a runaway body, not a seat limit. */
const MAX_SELECTED = 5000;

/**
 * The school's choice, kept whole. Both lists are kept whatever the mode, like the review
 * policy's hours, so a school that tries the groups and goes back to the students finds
 * each list where it left it.
 */
export class AssistantAccess {
  private constructor(
    readonly mode: AssistantMode,
    readonly groupIds: readonly string[],
    readonly studentIds: readonly string[],
  ) {}

  static default(): AssistantAccess {
    return new AssistantAccess(AssistantMode.ALL_STUDENTS, [], []);
  }

  static create(props: { mode: AssistantMode; groupIds: string[]; studentIds: string[] }): AssistantAccess {
    if (!Object.values(AssistantMode).includes(props.mode)) {
      throw new InvalidAssistantAccessException(`Unknown assistant mode "${String(props.mode)}"`);
    }
    const groupIds = [...new Set(props.groupIds)];
    const studentIds = [...new Set(props.studentIds)];
    if (groupIds.length > MAX_SELECTED || studentIds.length > MAX_SELECTED) {
      throw new InvalidAssistantAccessException(`At most ${MAX_SELECTED} groups and ${MAX_SELECTED} students`);
    }
    return new AssistantAccess(props.mode, groupIds, studentIds);
  }

  /** Rebuilt from a row, which the checks above were already applied to. */
  static rehydrate(props: { mode: AssistantMode; groupIds: string[]; studentIds: string[] }): AssistantAccess {
    return new AssistantAccess(props.mode, props.groupIds, props.studentIds);
  }

  /** The same choice with the lists cut to what is still the school's. */
  keeping(groupIds: readonly string[], studentIds: readonly string[]): AssistantAccess {
    const groups = new Set(groupIds);
    const students = new Set(studentIds);
    return new AssistantAccess(
      this.mode,
      this.groupIds.filter((id) => groups.has(id)),
      this.studentIds.filter((id) => students.has(id)),
    );
  }

  /** Whether the school pays for anyone at all — the part the feature key sells. */
  get paysForAnyone(): boolean {
    return this.mode !== AssistantMode.OFF;
  }
}
