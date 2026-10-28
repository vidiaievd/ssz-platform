export const ASSIST_FEEDBACK_REPOSITORY = Symbol('ASSIST_FEEDBACK_REPOSITORY');

/** The ledger row feedback is given on, as far as the feedback needs it. */
export interface AnsweredCall {
  callId: string;
  capability: string;
  actorUserId: string | null;
  outcome: string;
  modelId: string | null;
  promptVersion: string | null;
  createdAt: Date;
}

export interface AssistFeedbackToSave {
  call: AnsweredCall;
  userId: string;
  helpful: boolean;
  reason: string | null;
  at: Date;
}

/**
 * The learner's marks on the assistant's answers (plan 83, step 7). A mark and its
 * `ai.assist.feedback` outbox row are written together; a second mark on the same call is
 * `duplicate`, whichever request got there first.
 */
export interface IAssistFeedbackRepository {
  findCall(callId: string): Promise<AnsweredCall | null>;
  save(feedback: AssistFeedbackToSave): Promise<'saved' | 'duplicate'>;
}
