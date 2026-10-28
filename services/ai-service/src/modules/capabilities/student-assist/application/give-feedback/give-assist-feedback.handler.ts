import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { STUDENT_ASSIST } from '../../student-assist.capability.js';
import { ASSIST_FEEDBACK_REPOSITORY, type IAssistFeedbackRepository } from '../ports/assist-feedback.repository.js';
import { GiveAssistFeedbackCommand } from './give-assist-feedback.command.js';

/**
 * `recorded` — the mark is kept and its event queued; `not_found` — no answer of the assistant
 * to this learner under that id (another learner's, a tool round, a refused call, or a row
 * still in the ledger spool); `already_given` — the answer was marked before.
 */
export type GiveAssistFeedbackOutcome = { kind: 'recorded' } | { kind: 'not_found' } | { kind: 'already_given' };

/**
 * The learner's «helpful» / «not helpful» on one answer — the assistant's analogue of a
 * teacher's discard or a learner's dispute (R-l). The axes it is folded on are the answering
 * call's, read from the ledger, never from the client.
 */
@CommandHandler(GiveAssistFeedbackCommand)
export class GiveAssistFeedbackHandler implements ICommandHandler<GiveAssistFeedbackCommand, GiveAssistFeedbackOutcome> {
  constructor(@Inject(ASSIST_FEEDBACK_REPOSITORY) private readonly feedback: IAssistFeedbackRepository) {}

  async execute(command: GiveAssistFeedbackCommand): Promise<GiveAssistFeedbackOutcome> {
    const call = await this.feedback.findCall(command.callId);
    // Only a round that answered is an answer: the callId the learner was given is that one.
    if (!call || call.capability !== STUDENT_ASSIST.code || call.actorUserId !== command.userId || call.outcome !== 'ok') {
      return { kind: 'not_found' };
    }

    const reason = command.reason?.trim() || null;
    const saved = await this.feedback.save({ call, userId: command.userId, helpful: command.helpful, reason, at: new Date() });
    return saved === 'saved' ? { kind: 'recorded' } : { kind: 'already_given' };
  }
}
