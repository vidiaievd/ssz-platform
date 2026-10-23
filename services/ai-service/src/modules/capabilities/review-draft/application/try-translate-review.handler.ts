import { UnprocessableEntityException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AiGateway } from '../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../ledger/domain/ai-call.js';
import { AdminPayerResolver } from '../../application/admin-payer.resolver.js';
import { describeCall, type CallReport } from '../../application/describe-call.js';
import { toReviewDraft, type ReviewDraft } from '../domain/review-remarks.js';
import { reviewRequest } from '../prompts/prompts.js';
import { REVIEW_DRAFT } from '../review-draft.capability.js';
import { TryTranslateReviewCommand } from './try-translate-review.command.js';

export interface TryReviewResult extends CallReport {
  /** The verified draft, sentence indices resolved to item ids; null unless the outcome is `ok`. */
  draft: ReviewDraft | null;
}

/**
 * Runs the submission through the gateway under the `review_draft` binding, with the
 * prompt version the binding names. Every outcome is a 200, as with `diagnostic`; an
 * invented quotation shows up as `invalid_response` with the reason in `errorMessage`.
 */
@CommandHandler(TryTranslateReviewCommand)
export class TryTranslateReviewHandler implements ICommandHandler<TryTranslateReviewCommand, TryReviewResult> {
  constructor(
    private readonly gateway: AiGateway,
    private readonly payers: AdminPayerResolver,
  ) {}

  async execute(command: TryTranslateReviewCommand): Promise<TryReviewResult> {
    const { input } = command;
    if (input.aspects.length === 0) {
      throw new UnprocessableEntityException('Every check is off: there is nothing to review');
    }

    const context: CallContext = {
      payer: await this.payers.resolve(command),
      actor: { userId: command.actorUserId, role: 'platform_admin' },
      surface: 'admin_review_try',
    };
    const call = await this.gateway.call(REVIEW_DRAFT.code, context, (promptVersion) =>
      reviewRequest(promptVersion, { template: 'translate', input }),
    );
    const report = describeCall(REVIEW_DRAFT.code, context, call);
    const draft =
      report.outcome === 'ok' && report.output?.kind === 'structured' ? toReviewDraft(report.output.data, input) : null;
    return { ...report, draft };
  }
}
