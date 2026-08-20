import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationChannel, NotificationType } from '../../../../generated/prisma/enums.js';
import type { AppConfig } from '../../../config/configuration.js';
import { ReviewLoadClient } from './clients/review-load.client.js';
import { ReviewReviewersClient } from './clients/review-reviewers.client.js';
import { ReviewDigestStateRepository } from './review-digest-state.repository.js';
import {
  composeDigests,
  composeEscalations,
  type PendingSubmission,
  type ReviewerGroup,
  type TeacherDigest,
  type TeacherEscalation,
} from './review-digest.composer.js';

/**
 * The hour marks a digest may run on, by configured interval.
 *
 * `@Cron` wants an expression at class-definition time, and the interval is configuration
 * — so the decorator takes the widest schedule the setting allows (hourly) and the run
 * itself steps aside on the hours that are not its own. The alternative, a dynamic job
 * registered at boot, buys nothing here and hides the schedule from anyone reading the
 * class.
 */
const HOURLY = '0 0 * * * *';

/** Escalation is a daily question. Early morning, before the school day starts asking. */
const DAILY_AT_SIX = '0 0 6 * * *';

/**
 * Telling teachers what is waiting for them — once, and only when it has changed.
 *
 * It lives in notification-service rather than in the engine because the question is
 * *when to say something to a person*, not who may review what. The engine holds the
 * queue and answers about it; organization-service holds who reviews it and what the
 * school promised; this decides whether any of that is worth a message tonight.
 *
 * Two rules run through everything below:
 *
 * - **A run that cannot find something out says nothing.** Every client answers `null`
 *   rather than throwing, and `null` ends that school's run. A digest that said "nothing
 *   is waiting" because the engine was restarting would be worse than no digest.
 * - **Nobody is written to twice for the same work** (criterion 41). The composer decides
 *   that from the state rows; the state is written after the message, so the failure mode
 *   is a repeat rather than a silence.
 */
@Injectable()
export class ReviewDigestService {
  private readonly logger = new Logger(ReviewDigestService.name);

  constructor(
    private readonly load: ReviewLoadClient,
    private readonly directory: ReviewReviewersClient,
    private readonly state: ReviewDigestStateRepository,
    private readonly notifications: NotificationsRepository,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  @Cron(HOURLY, { name: 'review-digest' })
  async runDigest(now: Date = new Date()): Promise<void> {
    if (!this.enabled() || !this.dueThisHour(now)) return;

    const schools = await this.eachSchool();
    if (schools === null) return;

    for (const school of schools) {
      await this.digestOneSchool(school.schoolId, now);
    }
  }

  @Cron(DAILY_AT_SIX, { name: 'review-escalation' })
  async runEscalation(now: Date = new Date()): Promise<void> {
    if (!this.enabled()) return;

    const schools = await this.eachSchool();
    if (schools === null) return;

    for (const school of schools) {
      await this.escalateOneSchool(school.schoolId, now);
    }
  }

  /**
   * One school's digest: what is waiting, who reviews it, who has not been told yet.
   *
   * Every early return here is the same judgement — an answer this run could not get is
   * not evidence that nothing is waiting.
   */
  private async digestOneSchool(schoolId: string, now: Date): Promise<void> {
    const context = await this.contextOf(schoolId);
    if (context === null) return;

    const { pending, reviewers } = context;
    const states = await this.state.load(everyTeacher(reviewers));
    const digests = composeDigests(schoolId, pending, reviewers, states);

    for (const digest of digests) {
      await this.send(digest, now);
    }

    if (digests.length > 0) {
      this.logger.log(`Review digest: ${digests.length} teacher(s) in school ${schoolId}`);
    }
  }

  private async escalateOneSchool(schoolId: string, now: Date): Promise<void> {
    const context = await this.contextOf(schoolId);
    if (context === null) return;

    // The school's own patience, never a platform default: what counts as late is a thing
    // a school decided (44.12), and guessing it here would overrule them.
    const settings = await this.directory.settingsOf(schoolId);
    if (settings === null) return;

    const { pending, reviewers } = context;
    const states = await this.state.load(everyTeacher(reviewers));
    const escalations = composeEscalations(schoolId, pending, reviewers, states, settings, now);

    for (const escalation of escalations) {
      await this.escalate(escalation, now);
    }

    if (escalations.length > 0) {
      this.logger.log(`Review escalation: ${escalations.length} teacher(s) in school ${schoolId}`);
    }
  }

  /** What is waiting in a school and who reviews it, or `null` if either could not be read. */
  private async contextOf(
    schoolId: string,
  ): Promise<{ pending: PendingSubmission[]; reviewers: ReviewerGroup[] } | null> {
    const pending = await this.load.pendingSubmissions(schoolId);
    if (pending === null || pending.length === 0) return null;

    const groupIds = [
      ...new Set(pending.map((item) => item.groupId).filter((id): id is string => id !== null)),
    ];
    const reviewers = await this.directory.reviewersOf(groupIds);
    if (reviewers === null) return null;

    return { pending, reviewers };
  }

  private async send(digest: TeacherDigest, now: Date): Promise<void> {
    await this.notifications.create({
      recipientId: digest.userId,
      type: NotificationType.REVIEW_DIGEST,
      channel: NotificationChannel.IN_APP,
      subject: `${digest.pending} submission(s) waiting for you`,
      templateKey: 'review_digest',
      templateData: {
        schoolId: digest.schoolId,
        pending: digest.pending,
        groups: digest.groups,
        oldestSubmittedAt: digest.oldestSubmittedAt.toISOString(),
      },
    });

    // Only now: a state row written before the message would be a claim that a teacher
    // was told something they never were, and nothing would ever correct it.
    await this.state.recordDigest(digest.userId, digest.newestSubmittedAt, now);
  }

  private async escalate(escalation: TeacherEscalation, now: Date): Promise<void> {
    await this.notifications.create({
      recipientId: escalation.userId,
      type: NotificationType.REVIEW_ESCALATION,
      channel: NotificationChannel.IN_APP,
      subject: `${escalation.overdue} submission(s) have been waiting too long`,
      templateKey: 'review_escalation',
      templateData: {
        schoolId: escalation.schoolId,
        overdue: escalation.overdue,
        oldestSubmittedAt: escalation.oldestSubmittedAt.toISOString(),
        escalateAfterHours: escalation.escalateAfterHours,
      },
    });

    await this.state.recordEscalation(escalation.userId, now);
  }

  private async eachSchool(): Promise<{ schoolId: string }[] | null> {
    const schools = await this.load.schoolsWithPendingWork();
    if (schools === null) {
      this.logger.warn('Review digest skipped: the engine did not answer');
      return null;
    }
    return schools;
  }

  /** Both neighbours addressed and the job switched on. Otherwise this is simply off. */
  private enabled(): boolean {
    const review = this.config.get<AppConfig['review']>('review')!;
    return review.digestEnabled && this.load.configured && this.directory.configured;
  }

  /**
   * Whether this hour is one of the digest's own.
   *
   * Anchored to midnight so that the schedule is the same every day and readable from the
   * setting alone: at six-hour intervals a teacher hears at 00, 06, 12 and 18, not at
   * whatever hours the service happened to be restarted on.
   */
  private dueThisHour(now: Date): boolean {
    const interval = this.config.get<AppConfig['review']>('review')!.digestIntervalHours;
    return now.getHours() % interval === 0;
  }
}

function everyTeacher(reviewers: ReviewerGroup[]): string[] {
  return reviewers.flatMap((group) => group.teachers.map((teacher) => teacher.userId));
}
