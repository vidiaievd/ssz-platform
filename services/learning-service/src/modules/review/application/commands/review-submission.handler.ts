import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { Result } from '../../../../shared/kernel/result.js';
import { SUBMISSION_REPOSITORY, type ISubmissionRepository } from '../../domain/repositories/submission.repository.interface.js';
import { ORGANIZATION_CLIENT, type IOrganizationClient } from '../../../../shared/application/ports/organization-client.port.js';
import { LEARNING_EVENT_PUBLISHER, type IEventPublisher } from '../../../../shared/application/ports/event-publisher.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  SubmissionNotFoundError,
  SubmissionDomainValidationError,
  ReviewerNotAuthorizedError,
  OrganizationServiceUnavailableError,
  type ReviewApplicationError,
} from '../errors/review-application.errors.js';
import { toSubmissionDto, type SubmissionDto } from '../dto/submission.dto.js';
import { ReviewSubmissionCommand } from './review-submission.command.js';
import { MarkNeedsReviewCommand } from '../../../progress/application/commands/mark-needs-review.command.js';
import { ResolveReviewCommand } from '../../../progress/application/commands/resolve-review.command.js';
import type { RevisionDecision } from '../../domain/entities/submission-revision.entity.js';

const REVIEWER_ROLES = new Set(['OWNER', 'ADMIN', 'TEACHER']);

@CommandHandler(ReviewSubmissionCommand)
export class ReviewSubmissionHandler
  implements ICommandHandler<ReviewSubmissionCommand, Result<SubmissionDto, ReviewApplicationError>>
{
  private readonly logger = new Logger(ReviewSubmissionHandler.name);

  constructor(
    @Inject(SUBMISSION_REPOSITORY) private readonly repo: ISubmissionRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
    @Inject(LEARNING_EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    @Inject(CLOCK) private readonly clock: IClock,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(cmd: ReviewSubmissionCommand): Promise<Result<SubmissionDto, ReviewApplicationError>> {
    const submission = await this.repo.findById(cmd.submissionId);
    if (!submission) {
      return Result.fail(new SubmissionNotFoundError(cmd.submissionId));
    }

    // Authorize: platform admin OR school teacher/admin
    const isPlatformAdmin = cmd.reviewerRoles.includes('platform_admin');
    if (!isPlatformAdmin) {
      if (!submission.schoolId) {
        return Result.fail(new ReviewerNotAuthorizedError('no school context on submission'));
      }
      const roleResult = await this.orgClient.getMemberRole(submission.schoolId, cmd.reviewerId);
      if (roleResult.isFail) {
        return Result.fail(new OrganizationServiceUnavailableError(roleResult.error.message));
      }
      if (!roleResult.value || !REVIEWER_ROLES.has(roleResult.value)) {
        return Result.fail(new ReviewerNotAuthorizedError('must be teacher or admin in the school'));
      }
    }

    const decision = cmd.decision as RevisionDecision;
    const reviewResult = submission.review(
      cmd.reviewerId,
      decision,
      cmd.feedback ?? null,
      cmd.score ?? null,
      this.clock.now(),
    );
    if (reviewResult.isFail) {
      return Result.fail(new SubmissionDomainValidationError(reviewResult.error.message));
    }

    await this.repo.save(submission);
    this.logger.log(`Submission reviewed: ${submission.id} decision=${decision}`);

    // Publish domain events
    for (const event of submission.getDomainEvents()) {
      await this.publisher.publish(event.eventType, (event as any).payload);
    }
    submission.clearDomainEvents();

    // Update progress based on review decision (best-effort — ignore not-found)
    await this.syncProgress(submission.userId, submission.exerciseId, decision);

    return Result.ok(toSubmissionDto(submission));
  }

  private async syncProgress(userId: string, exerciseId: string, decision: RevisionDecision): Promise<void> {
    try {
      if (decision === 'REVISION_REQUESTED') {
        await this.commandBus.execute(new MarkNeedsReviewCommand(userId, 'EXERCISE', exerciseId));
      } else {
        await this.commandBus.execute(
          new ResolveReviewCommand(userId, 'EXERCISE', exerciseId, decision === 'APPROVED'),
        );
      }
    } catch {
      // Progress record may not exist — non-critical, skip silently
    }
  }
}
