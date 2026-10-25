import type { BaseEvent } from '../base.js';

// ─── Event type constants ─────────────────────────────────────────────────────

export const EXERCISE_ENGINE_EVENT_TYPES = {
  ATTEMPT_STARTED: 'exercise.attempt.started',
  ATTEMPT_COMPLETED: 'exercise.attempt.completed',
  ATTEMPT_ROUTED_FOR_REVIEW: 'exercise.attempt.routed_for_review',
  ATTEMPT_REVIEWED: 'exercise.attempt.reviewed',
  ATTEMPT_AI_REVIEWED: 'exercise.attempt.ai_reviewed',
  ATTEMPT_AI_REVIEW_DISPUTED: 'exercise.attempt.ai_review_disputed',
} as const;

// ─── Payload interfaces ───────────────────────────────────────────────────────

export interface ExerciseAttemptStartedPayload {
  attemptId: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  targetLanguage: string;
  assignmentId: string | null;
  enrollmentId: string | null;
}

/**
 * Published after a closed-form attempt is scored OR a free-form attempt is
 * routed for human review. Consumed by Learning Service's ExerciseAttemptedConsumer.
 *
 * Field contract is FROZEN — must match ExerciseAttemptedConsumer exactly:
 *   completed=true  → closed-form, score present
 *   completed=false → free-form, score null, routed for review
 */
export interface ExerciseAttemptCompletedPayload {
  userId: string;
  exerciseId: string;
  score: number | null;
  timeSpentSeconds: number;
  completed: boolean;
  // Additive (plan 21 §3) — PRACTICED_BY atoms snapshotted from Content Service at
  // attempt start. Optional so older publishers without this field stay valid.
  practicedAtoms?: Array<{ atomType: string; atomId: string }>;
  // Additive (plan 35 §5.4) — how the answer was produced. Optional: only
  // word_bank_gap_fill reports it today, and events published before it existed
  // stay valid.
  answerForm?: AnswerForm;
  // Additive (plan 36 §A.1) — telemetry context. The consumer turns an attempt into
  // an SRS rating and forwards the pair to analytics; without these, the calibration
  // data cannot say which template or whether the attempt counted as a success.
  // Optional for the same reason as the fields above: events already in the queue.
  templateCode?: string;
  /** Cleared the template's passing threshold. `score === 100` is "every gap right". */
  passed?: boolean;
  /**
   * Additive (plan 36 §C.1) — per-gap verdicts, in the order the gaps appear.
   *
   * Present only for the templates graded gap by gap. It exists so spaced repetition
   * can schedule a gap rather than a whole exercise: with one card per exercise, one
   * wrong sentence in a block of six brings all six back. Before gap-fill was merged
   * into one template, six separate exercises gave six independent cards, and that
   * was *better* — this is what gives it back, finer than it was.
   *
   * Deliberately not the explanation: that is feedback for the learner, and the
   * scheduler has no use for it.
   */
  gapResults?: Array<{
    gapKey: string;
    correct: boolean;
    /**
     * Additive (plan 63 §2 D) — what this gap was about, snapshotted at attempt start.
     *
     * Carried beside the verdict rather than looked up later for the reason every other
     * snapshot here is carried: an author re-anchoring a gap next month must not silently
     * rewrite what last month's attempt proved. Absent means nobody addressed the gap,
     * which is the state most of the catalogue is in and not an error.
     */
    targets?: AttemptTarget[];
  }>;
  /**
   * Additive (plan 63 §2 D) — what the exercise as a whole was about.
   *
   * The address of an item whose key is `null`: templates that grade as one (`writing_task`,
   * `short_answer`) have nothing to point inside, and their evidence belongs to the
   * exercise. Separate from `gapResults` because there is no per-gap verdict to hang it on
   * — the score of the attempt is the verdict.
   */
  targets?: AttemptTarget[];
  /**
   * Additive (plan 63 §2 E) — how the learner had to produce the answer.
   *
   * Derived by Content Service on the same ladder as the axes and travelling as a value
   * for the same reason. `unknown` is a real answer: a template nobody has judged, or a
   * gap-fill whose document has not said whether its words come off a strip.
   */
  modality?: Modality;
  /**
   * Additive (plan 63 §4) — a person's verdict, where a person gave one.
   *
   * `approved` needs no special reading: the attempt is scored and complete, exactly as a
   * machine-scored one. `returned` is the case this field exists for. Work sent back is
   * not progress — the learner is being told to do it again, `completed` stays false and
   * the attempt keeps no score — but it *is* evidence about the language, and the
   * strongest kind there is: a person read the answer and judged it not good enough.
   *
   * Without it a failed free-form answer left no trace anywhere. An approval was recorded
   * and a return was not, so the only evidence the platform ever collected about recall
   * and production was evidence of success, while recognition (auto-graded, and free to
   * mark an answer wrong) recorded both. The two modalities were being compared on
   * samples selected by opposite rules.
   *
   * Absent on every publisher that predates it, and on every machine-scored attempt.
   */
  reviewOutcome?: 'approved' | 'returned';
  /**
   * Additive (plan 79 §2.1, decision Q1) — who gave the verdict in `reviewOutcome`.
   *
   * `ai` is a model's verdict on the work of a learner with nobody to review it. It is read
   * as a person's in every respect but one: memory is rated through the kernel's
   * `evidenceStrength` with `reviewedBy: 'ai'` (success at most GOOD, failure at least HARD)
   * instead of being let through unclamped, and progress records that the verdict was a
   * model's. Absent means a teacher — every publisher before plan 79 — and is never set
   * without `reviewOutcome`.
   */
  reviewedBy?: 'teacher' | 'ai';
  /**
   * Additive (plan 80, step 4b, R5) — this verdict replaces one the attempt was already
   * counted by: a teacher answering a school's work after a model's verdict counted at the
   * school's term.
   *
   * Progress follows the new verdict; memory does not hear it. The cards were rated once,
   * by the verdict that counted at the term, and a second rating of the same answer days
   * later would read as a review at an interval that never happened. Absent on everything
   * else, which is read exactly as before.
   */
  revisesVerdict?: boolean;
  /**
   * Additive (plan 66, decision Q2-B) — the exercise was delivered in a way that hands part
   * of the answer over, so a success proves one step less than its form says.
   *
   * Decided by the engine from the document, never from the client: today only
   * `sort_into_buckets`, when its «N igjen» counter was on or most items sat in one
   * bucket. Every consumer passes it to the kernel's `evidenceStrength` as `lowered`, which
   * drops the success ceiling one step and leaves the failure floor alone.
   *
   * Absent on every publisher before it and on every template that does not send it, which
   * therefore rates exactly as before.
   */
  evidenceLowered?: boolean;
  /**
   * Additive (plan 63 §3, phase 2) — milliseconds spent on each addressable item, keyed
   * the way the template keys its own results.
   *
   * Latency separates "knew it" from "worked it out", which is the difference between
   * recall and reconstruction and is invisible in a verdict. Optional and expected to
   * stay optional: only templates that can measure an item in isolation report it.
   */
  latencyMsPerItem?: Record<string, number>;
  /**
   * Additive (plan 55 §3.6) — what the attempt exercised, snapshotted at its start.
   *
   * The channel (`skills`) and the subject (`focus`) are derived by Content Service from
   * the exercise, where it stands and what its author declared, and travel here as values
   * rather than as an exercise id to look up later: an exercise moved out of a listening
   * lesson next month must not retroactively change what last month's attempt trained.
   *
   * Optional for the same reason as `answerForm` and `templateCode` — the events already
   * in the queue were published before the axes existed, and stay valid. An empty array
   * is not the same as an absent one: absent means nobody said, empty means the derivation
   * (or the author) said "nothing counted".
   */
  skills?: Skill[];
  focus?: Focus[];
  /**
   * Additive (plan 55 §5.1) — the course the exercise was attempted in, snapshotted at
   * attempt start along with the rest of the review context.
   *
   * The mastery profile is kept per course as well as overall: "weak at grammar" is a
   * different sentence from "weak at grammar in this course", and a teacher can only act
   * on the second. Absent for practice outside any course, and for older publishers.
   */
  containerId?: string | null;
  /**
   * Additive (plan 57 §7) — where the work was done and for whom, decided when the
   * attempt started.
   *
   * `classwork` when the caller named the scheduled lesson it happened in, `homework`
   * when it answers an assignment, `self_study` otherwise. Carried rather than derived
   * downstream: by the time a consumer sees this the lesson is over and the assignment
   * may have been cancelled, and the same exercise is classwork one day and homework the
   * next. Absent for publishers that predate the field — which is not the same as
   * `self_study`, and analytics must be able to tell those apart.
   */
  workContext?: WorkContext | null;
  /**
   * Additive (plan 63 phase 9) — the task was a disposable probe, not a catalogue
   * exercise.
   *
   * The evidence it produces about an **atom** is ordinary evidence and must be treated
   * as such: that is the entire point of moving memory onto the atom in the first place
   * (§2 A), and it is what makes a generated task worth anything at all.
   *
   * What a consumer must *not* do with it is write anything keyed by the exercise. A
   * progress row, a card on the exercise, a card on one of its gaps — all of them would
   * name an id that will not exist tomorrow, and a learner's record would slowly fill
   * with rows pointing at questions nobody can look up. "Completed 40 exercises" would
   * count tasks that were thrown away by design.
   *
   * Absent means a catalogue exercise, which is every event published before this field
   * existed and the overwhelming majority of those after it.
   */
  ephemeral?: boolean;
  /** The group the learner belonged to at attempt start. Null outside a group. */
  groupId?: string | null;
  /** The scheduled lesson the work was done in, when the caller named one. */
  lessonId?: string | null;
  /**
   * Additive (VoxOrd offline plan, B4) — when the verdict was reached, ISO 8601: the
   * scoring, a teacher's review, or for work handed to a teacher the submission.
   *
   * Differs from the envelope's `occurredAt` for an attempt worked on a phone with no
   * network and replayed later: the envelope is the day of the sync, this is the day of the
   * practice, as far as the engine believed the phone's clock (never in the future, never
   * older than thirty days). Absent on events published before it existed — a consumer
   * falls back to the envelope.
   */
  attemptedAt?: string;
  /** Additive (VoxOrd offline plan, B4) — worked offline and replayed. Absent means not. */
  recordedOffline?: boolean;
}

/**
 * One atom an item was about, with the weight of the evidence it produces — plan 63 §2 D.
 *
 * `focus` is what the item examined; `context` is what the learner had to know to get
 * there and was not examined on — the word inside a gap that is testing an ending. Both
 * are proof, and they are not equal proof, which is why the role travels with the address
 * rather than being inferred downstream from the template.
 *
 * `atomType` is a string rather than a union on purpose: it already carries whatever
 * Content Service snapshots into `practicedAtoms`, and a new kind of atom must not make
 * events in the queue invalid.
 */
export interface AttemptTarget {
  atomType: string;
  atomId: string;
  role: 'focus' | 'context';
}

/** How the learner had to know it — mirrored from `@ssz/shared-kernel/skills`. */
export type Modality = 'recognition' | 'recall' | 'production' | 'unknown';

/** Where a piece of work was done — see `workContext` above. */
export type WorkContext = 'classwork' | 'homework' | 'self_study';

/**
 * The four CEFR channels and the subjects that run through them — plan 55 §3.1–3.3.
 *
 * Mirrored from `@ssz/shared-kernel/skills` rather than imported: this package deliberately
 * depends on nothing, so that a service consuming an event never has to take the kernel's
 * domain logic with it. The kernel owns the vocabulary; a value added there has to be added
 * here too, and the derivation stays where it is.
 *
 * `skill` is `CanDoSkill` from Content Service — the same four channels the can-do
 * descriptor library is written against. A second, parallel list would mean the coverage
 * report and can-do progress could never be compared.
 */
export type Skill = 'listening' | 'reading' | 'spoken' | 'written';
export type Focus =
  | 'vocabulary'
  | 'grammar'
  | 'orthography'
  | 'pronunciation'
  | 'phonology'
  | 'pragmatics';

/**
 * How the learner produced the answer, as opposed to whether it was right.
 *
 * Needed because `word_bank_gap_fill` absorbed `fill_in_blank`: one template now
 * covers both choosing a word from five and typing it from memory. Those are not
 * equal evidence of knowing it, and after the merge there is no `templateCode` left
 * to tell them apart — so without this field, merging the two types would make
 * spaced repetition *worse* than it was.
 *
 * Nothing consumes it yet. The scale that will —
 * ceilings on rating, asymmetry between success and failure — is plan 36.
 */
export interface AnswerForm {
  /** `bank`: chosen from a closed set. `free`: typed, with nothing to choose from. */
  mode: 'bank' | 'free';
  /** How many words were on offer. `null` in `free` mode, where there is no bank. */
  bankSize: number | null;
  /** Each word could be used once, so spending one narrowed what was left. */
  wordsConsumed: boolean;
}

/**
 * Published when a submission starts waiting for a person — plan 44 §44.5.
 *
 * `attempt.completed` travels at the same moment and says the learner finished
 * without a score; its shape is frozen by the Learning Service consumer, and progress
 * is all it is about. This one is about the *queue*: which school, course and group
 * the work landed in, which is what a reminder or an escalation needs to work out who
 * to tell. Nothing outside review consumes it.
 *
 * The context fields are the snapshot taken when the learner started (or filled in on
 * the way here). `null` means a neighbouring service could not say — the work is still
 * waiting, it just has no group to chase.
 */
export interface ExerciseAttemptRoutedForReviewPayload {
  attemptId: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  schoolId: string | null;
  containerId: string | null;
  groupId: string | null;
  /** ISO 8601 — the clock every "how long has this been waiting" answer starts from. */
  submittedAt: string;
  /**
   * The school answers this work with a model first (plan 80): its mode as it stood at
   * hand-in, already checked against the school's plan and the template. Absent or null —
   * only a teacher reads it, and no model is asked for the learner's review.
   */
  reviewAiMode?: ReviewAiMode | null;
}

/** A school's mode that has a model answer first (plan 80, R1); `teacher_only` never travels. */
export type ReviewAiMode = 'ai_then_teacher' | 'ai_with_sampling';

/**
 * Published when a person has marked a submission — plan 42.
 *
 * Separate from `attempt.completed` rather than a flag on it, because the two answer
 * different questions. `completed` is progress: the SRS and the learner's course state
 * move on it, and an approved attempt already publishes it. This one is *correspondence*:
 * a learner handed work to a teacher and is owed an answer, and the only consumer that
 * cares is the one that tells them.
 *
 * It is published for both outcomes, including an approval with nothing written on it.
 * Silence after handing in work is the hole the marking queue was built to close, and a
 * learner cannot tell "not looked at yet" from "looked at, nothing to say".
 */
export interface ExerciseAttemptReviewedPayload {
  attemptId: string;
  /** The learner who handed the work in — the recipient of anything sent about it. */
  userId: string;
  exerciseId: string;
  templateCode: string;
  reviewerId: string;
  /**
   * The school the work was handed in to, snapshotted when the attempt started.
   *
   * `null` for practice outside a school, and for attempts that predate plan 44. It rides
   * along so that a consumer building a school-wide feed does not have to keep its own
   * copy of every submission just to learn which school a verdict belongs to.
   */
  schoolId: string | null;
  /**
   * The course the work belongs to, snapshotted when the attempt started.
   *
   * On the letter rather than looked up by its reader: a notification is written once and
   * read weeks later, and a consumer that resolved the course at read time would answer
   * for where the exercise sits *now* — or fail to answer at all once it has moved.
   */
  containerId: string | null;
  /**
   * Course · module · exercise as they read when the learner started (plan 44 §0.3).
   *
   * What lets a message name the work instead of pointing at "an exercise": `null` only
   * for attempts that predate the snapshot, and a consumer must still say something
   * sensible without it.
   */
  exercisePath: { course: string; module: string | null; exercise: string | null } | null;
  outcome: 'approved' | 'returned';
  /** 0–100 on an approval; `null` when the work was sent back unmarked. */
  score: number | null;
  /** What the teacher wrote about the submission as a whole, if anything. */
  comment: string | null;
  /**
   * A person wrote something, anywhere — the overall comment or a note on a single
   * sentence.
   *
   * Not the same question as `comment !== null`: a teacher may approve with nothing to
   * say in general and a remark on one sentence, and the learner must still be told there
   * is something to read. It is the flag that separates "marked, nothing to add" from
   * "marked, go and look" (plan 44 §44.9, criterion 40).
   */
  hasComment: boolean;
  /** How much of the submission counted. Both `0` when there was nothing readable. */
  approvedItems: number;
  totalItems: number;
  /**
   * What the teacher did with a model's draft of this review (plan 79, 1.5) — the label a
   * model and a prompt version are judged by. Counts are over the draft's remarks: taken
   * as written, reworded, thrown out, or left alone.
   *
   * `null` when there was no draft to act on (none, failed, or the verdict came from a
   * batch approval, which never shows one). Absent on events older than plan 79.
   */
  aiDraft?: AttemptReviewedAiDraft | null;
  /**
   * Additive (plan 80, step 4b) — the teacher answered after the model's verdict had counted
   * at the school's term, and this verdict replaces it. What the teacher made of the model's
   * review (`aiDraft`) is then a disagreement with a verdict the learner was already given.
   * Absent on every other letter.
   */
  revisesVerdict?: boolean;
  /**
   * Additive (plan 80, step 6c) — the model's verdict the learner had already been given on
   * this work, when the school lets a model answer first: provisional, or counted at the
   * term (`revisesVerdict`). Whether the teacher went the other way is read against it.
   * Present on every teacher's verdict on such work — with a draft acted on or not, a batch
   * approval included; absent everywhere else.
   */
  aiVerdict?: AttemptReviewedAiVerdict;
  occurredAt: string;
}

/** A model's verdict a teacher ruled after (plan 80, step 6c), on the axes it is judged by. */
export interface AttemptReviewedAiVerdict {
  /** ai-service capability that gave it: `review_direct`. */
  capability: string;
  /** ai-service registry ids; null on verdicts given before step 6c, which kept none. */
  modelId: string | null;
  promptVersion: string | null;
  outcome: 'approved' | 'returned';
}

export interface AttemptReviewedAiDraft {
  /**
   * ai-service capability that wrote it: `review_draft`, or `review_direct` — the review the
   * learner was already given, where the school has a model answer first (plan 80).
   */
  capability: string;
  /** ai-service registry ids — the axes the outcomes are folded on. */
  modelId: string | null;
  promptVersion: string | null;
  accepted: number;
  edited: number;
  discarded: number;
  /** Remarks the teacher neither took nor threw out — read as "not worth acting on". */
  untouched: number;
  /**
   * The model's suggested rubric marks against the ones the teacher gave (plan 79, 1.7d).
   * `null` when the draft suggested none; absent on events older than 1.7d.
   */
  marks?: AttemptReviewedAiDraftMarks | null;
}

/**
 * Suggested marks beside the teacher's, criterion by criterion. A teacher sets every mark
 * themselves, so there is no "taken" — only where they landed against the model.
 */
export interface AttemptReviewedAiDraftMarks {
  /** The teacher gave the mark the model suggested. */
  same: number;
  /** The teacher gave another mark, or none the engine could read. */
  different: number;
  /** Marks with a teacher's number to compare with — `same` plus the `different` that have one. */
  compared: number;
  /** Σ (teacher − model) over `compared`: its sign says which way the model leans. */
  deltaSum: number;
  /** Σ |teacher − model| over `compared`. */
  absDeltaSum: number;
}

/**
 * A model's verdict closed the attempt of a learner nobody reviews (plan 79, 2.3b) — what a
 * dispute rate is read against. Published beside the `completed` that carries
 * `reviewedBy: 'ai'`: that one is about the learner's progress, this one about the model.
 */
export interface ExerciseAttemptAiReviewedPayload {
  attemptId: string;
  userId: string;
  exerciseId: string;
  templateCode: string;
  /** ai-service capability that wrote the review: `review_direct`. */
  capability: string;
  /** ai-service registry ids — the axes the counts are folded on. */
  modelId: string | null;
  promptVersion: string | null;
  outcome: 'approved' | 'returned';
  /**
   * Additive (plan 80, step 6a) — where the work was handed in, snapshotted at attempt start,
   * as on `exercise.attempt.reviewed`. `null` outside a school; absent on older events.
   */
  schoolId?: string | null;
  groupId?: string | null;
  containerId?: string | null;
  /**
   * Additive (plan 80, step 6a) — the verdict counted by itself at the school's term because
   * no teacher answered: the row the auto-acceptance journal is built from. Absent on a
   * verdict that closed the work at once.
   */
  acceptedAtTerm?: true;
  occurredAt: string;
}

/**
 * The learner said a model's review of their work is wrong (plan 79, 2.3b) — the learner's
 * counterpart of a teacher discarding a draft. Once per review. What they wrote, if anything,
 * stays in exercise-engine; only that they wrote something travels.
 */
export interface ExerciseAttemptAiReviewDisputedPayload
  extends Omit<ExerciseAttemptAiReviewedPayload, 'occurredAt'> {
  /** When the review was delivered: a dispute is counted on its review's day, so the rate stays per review. */
  reviewedAt: string;
  withReason: boolean;
  occurredAt: string;
}

// ─── Typed event interfaces ───────────────────────────────────────────────────

export type ExerciseAttemptStartedEvent = BaseEvent<ExerciseAttemptStartedPayload>;
export type ExerciseAttemptCompletedEvent = BaseEvent<ExerciseAttemptCompletedPayload>;
export type ExerciseAttemptReviewedEvent = BaseEvent<ExerciseAttemptReviewedPayload>;
export type ExerciseAttemptAiReviewedEvent = BaseEvent<ExerciseAttemptAiReviewedPayload>;
export type ExerciseAttemptAiReviewDisputedEvent = BaseEvent<ExerciseAttemptAiReviewDisputedPayload>;
export type ExerciseAttemptRoutedForReviewEvent =
  BaseEvent<ExerciseAttemptRoutedForReviewPayload>;
