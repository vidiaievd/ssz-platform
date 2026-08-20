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
  summariseSchool,
  type PendingSubmission,
  type ReviewerGroup,
  type SchoolReviewSummary,
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

/** The school's own weekly picture. Monday morning, when the week can still be planned. */
const WEEKLY_MONDAY_SEVEN = '0 0 7 * * 1';

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
   * The school's week, to whoever the school said should hear it (plan 47.6).
   *
   * Weekly rather than daily and to an administrator rather than a teacher, because it
   * answers a different question: not "what should I mark today" but "is our marking
   * keeping up". It is sent even when nothing is late — a queue that is large and on time
   * is still something to know — and never when nothing is waiting at all.
   */
  @Cron(WEEKLY_MONDAY_SEVEN, { name: 'review-school-summary' })
  async runSchoolSummary(now: Date = new Date()): Promise<void> {
    if (!this.enabled()) return;

    const schools = await this.eachSchool();
    if (schools === null) return;

    for (const school of schools) {
      await this.summariseOneSchool(school.schoolId, now);
    }
  }

  private async summariseOneSchool(schoolId: string, now: Date): Promise<void> {
    const summary = await this.schoolSummary(schoolId, now);
    if (summary === null) return;

    const recipients = await this.directory.escalationRecipientsOf(
      schoolId,
      summary.overdueGroupIds,
    );
    if (recipients === null) return;

    for (const recipient of recipients.recipients) {
      await this.notifications.create({
        recipientId: recipient.userId,
        type: NotificationType.REVIEW_SCHOOL_SUMMARY,
        channel: NotificationChannel.IN_APP,
        subject: `${summary.pending} submission(s) waiting across the school`,
        templateKey: 'review_school_summary',
        templateData: {
          schoolId,
          pending: summary.pending,
          overdue: summary.overdue,
          oldestAgeHours: summary.oldestAgeHours,
          oldestSubmittedAt: summary.oldestSubmittedAt.toISOString(),
        },
      });
    }
  }

  /**
   * The school threshold of 47.5: work past what the school allows, told to whoever the
   * school named — its admins, its owner, or the group's primary teacher.
   *
   * Runs beside the teachers' own escalation and on the same daily clock, and shares the
   * per-person day with it deliberately: a teacher who is also an administrator hears
   * about a late queue once, not twice in one morning.
   */
  private async escalateToSchool(
    schoolId: string,
    summary: SchoolReviewSummary,
    now: Date,
  ): Promise<void> {
    if (summary.overdue === 0) return;

    const recipients = await this.directory.escalationRecipientsOf(
      schoolId,
      summary.overdueGroupIds,
    );
    if (recipients === null || recipients.recipients.length === 0) return;

    const states = await this.state.load(recipients.recipients.map((one) => one.userId));
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    for (const recipient of recipients.recipients) {
      const state = states.get(recipient.userId);
      if (state?.lastEscalatedAt && state.lastEscalatedAt > dayAgo) continue;

      await this.notifications.create({
        recipientId: recipient.userId,
        type: NotificationType.REVIEW_ESCALATION,
        channel: NotificationChannel.IN_APP,
        subject: `${summary.overdue} submission(s) in the school have been waiting too long`,
        templateKey: 'review_escalation',
        templateData: {
          schoolId,
          overdue: summary.overdue,
          oldestSubmittedAt: summary.oldestSubmittedAt.toISOString(),
          escalateAfterHours: summary.oldestAgeHours,
          // What separates this from a teacher's own escalation on the reading side: the
          // school's whole queue, addressed to whoever the school said (44.12).
          scope: 'school',
          target: recipients.target,
        },
      });
      await this.state.recordEscalation(recipient.userId, now);
    }
  }

  /** The school's queue in numbers, or `null` when there is nothing to say. */
  private async schoolSummary(
    schoolId: string,
    now: Date,
  ): Promise<SchoolReviewSummary | null> {
    const context = await this.contextOf(schoolId);
    if (context === null) return null;

    const settings = await this.directory.settingsOf(schoolId);
    if (settings === null) return null;

    return summariseSchool(schoolId, context.pending, settings, now);
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

    // And the school itself, if it asked to hear about work its teachers left standing.
    const summary = summariseSchool(schoolId, pending, settings, now);
    if (summary !== null) await this.escalateToSchool(schoolId, summary, now);
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
