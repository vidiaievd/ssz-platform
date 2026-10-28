/**
 * What the student assistant's tools read (plan 83, step 2), one port per service. Every
 * read is learner-safe by the route it calls: content-service answers only what is
 * published in the named course, with exercises as title and template; exercise-engine
 * only the learner's own attempt after its verdict; scheduling-service a session without
 * notes or scores. A reader answers null for "not there" and throws for "could not ask".
 */

export interface UnitMaterial {
  courseId: string;
  unit: { id: string; title: string };
  lessons: { id: string; title: string; text: string; truncated: boolean }[];
  grammarRules: GrammarRuleSummary[];
  vocabulary: { id: string; word: string; partOfSpeech: string | null; translation: string | null }[];
  exercises: { id: string; title: string | null; template: string }[];
}

export interface GrammarRuleSummary {
  id: string;
  title: string;
  summary: string | null;
  examples: { sentence: string; correct: boolean; note: string | null }[];
}

export interface GrammarRuleText extends GrammarRuleSummary {
  text: string;
  truncated: boolean;
}

export interface WordLookup {
  lemma: string;
  course: {
    id: string;
    word: string;
    partOfSpeech: string | null;
    translation: string | null;
    alternatives: string[];
    definition: string | null;
    usageNotes: string | null;
    falseFriendWarning: string | null;
    examples: string[];
  }[];
  personal: {
    vocabularyItemId: string;
    word: string;
    surfaceForm: string;
    contextSentence: string | null;
    translation: string | null;
  }[];
}

export const COURSE_MATERIAL_READER = Symbol('COURSE_MATERIAL_READER');

export interface ICourseMaterialReader {
  unitMaterial(courseId: string, unitId: string, language: string): Promise<UnitMaterial | null>;
  grammarRule(courseId: string, ruleId: string, language: string): Promise<GrammarRuleText | null>;
  lookupWord(lemma: string, userId: string, language: string, courseId: string | null): Promise<WordLookup>;
}

export const COURSE_LANGUAGE_READER = Symbol('COURSE_LANGUAGE_READER');

/** The language a course teaches — what the assistant's prompt names (plan 83, step 4e). */
export interface ICourseLanguageReader {
  /** A language code (`nb`), or null for an unknown course. Throws when unreadable. */
  targetLanguage(courseId: string): Promise<string | null>;
}

/** A cell of the learner's `SkillMastery` profile the profile itself calls weak (R-h). */
export interface WeakTopic {
  skill: string;
  focus: string;
  reason: string;
  successRate: number | null;
}

export const MASTERY_READER = Symbol('MASTERY_READER');

export interface IMasteryReader {
  weakTopics(userId: string, courseId: string | null): Promise<WeakTopic[]>;
}

export interface ReviewedWork {
  attemptId: string;
  exerciseId: string;
  courseId: string | null;
  templateCode: string;
  status: string;
  reviewedBy: 'teacher' | 'ai';
  reviewedAt: string | null;
  score: number | null;
  passed: boolean | null;
  answer: unknown;
  comment: string | null;
  decisions: { itemId: string; approved: boolean; comment: string | null }[];
  rubricMarks: unknown;
}

export const REVIEWED_WORK_READER = Symbol('REVIEWED_WORK_READER');

export interface IReviewedWorkReader {
  /** `not_reviewed` before a delivered verdict; null for an unknown attempt or someone else's. */
  reviewedWork(attemptId: string, userId: string): Promise<ReviewedWork | 'not_reviewed' | null>;
}

export interface ClassSession {
  id: string;
  groupId: string;
  schoolId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  contentUnitId: string | null;
  contentLessonId: string | null;
}

export const CLASS_SESSION_READER = Symbol('CLASS_SESSION_READER');

export interface IClassSessionReader {
  session(sessionId: string): Promise<ClassSession | null>;
}

/*
 * What the payer resolver reads before a turn (plan 83, step 3): whether the learner may
 * ask about this course or class at all, and through which workspace.
 */

export interface AssistEnrollment {
  status: 'active' | 'completed';
  /** The workspace the enrolment belongs to; null for self-study. */
  schoolId: string | null;
}

export const ENROLLMENT_READER = Symbol('ENROLLMENT_READER');

export interface IEnrollmentReader {
  /** Null when the learner does not hold the course (never joined, or left it). */
  enrollment(userId: string, courseId: string): Promise<AssistEnrollment | null>;
}

export interface AttemptScope {
  attemptId: string;
  exerciseId: string;
  courseId: string | null;
}

export const ATTEMPT_SCOPE_READER = Symbol('ATTEMPT_SCOPE_READER');

export interface IAttemptScopeReader {
  /** The course of the learner's own attempt, reviewed or not; null for an unknown attempt or someone else's. */
  attemptScope(attemptId: string, userId: string): Promise<AttemptScope | null>;
}

export const GROUP_ROSTER_READER = Symbol('GROUP_ROSTER_READER');

export interface IGroupRosterReader {
  /** The learners of a group; null when the school has no such group. */
  members(schoolId: string, groupId: string): Promise<string[] | null>;
}

export const STUDENT_STANDING_READER = Symbol('STUDENT_STANDING_READER');

export interface IStudentStandingReader {
  /**
   * Whether the school pays the assistant for this learner: an active student of its roster
   * (not staff, not archived) whom the school chose (plan 83, Q6 — all its students, the
   * chosen groups or the chosen students; nobody when it turned the assistant off).
   */
  schoolPaysFor(schoolId: string, userId: string): Promise<boolean>;
}
