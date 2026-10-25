import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { NotificationsRepository } from '../notifications.repository.js';
import { NotificationChannel, NotificationType } from '../../../../generated/prisma/enums.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import { ReviewLoadClient } from './clients/review-load.client.js';
import { ReviewReviewersClient } from './clients/review-reviewers.client.js';
import {
  composeTermWarnings,
  warnedKey,
  type TeacherTermWarning,
} from './review-digest.composer.js';

/** Hourly, so a submission entering the window is announced within the hour. */
const HOURLY = '0 0 * * * *';

/**
 * How long a warned pair is kept. The longest window is a week; past a fortnight the term
 * has run out long ago and the row can only ever answer a question nobody asks.
 */
const KEEP_WARNINGS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Telling a teacher that a model's verdict is about to count by itself (plan 80, R3).
 *
 * Under a school's AI policy the learner already has the model's provisional verdict, and
 * at the term the engine makes it final. This is the teacher's last chance to open the work
 * first, said once per submission: "the term is running out, it will be accepted as it
 * stands". The digest carries the same count as a line; this message exists because the
 * digest only speaks when new work arrives, and a term runs out on work that is not new.
 *
 * The digest's two rules hold here too: a run that cannot find something out says nothing,
 * and the record is written after the message, so the failure mode is a repeat.
 */
@Injectable()
export class ReviewTermWarningService {
  private readonly logger = new Logger(ReviewTermWarningService.name);

  constructor(
    private readonly load: ReviewLoadClient,
    private readonly directory: ReviewReviewersClient,
    private readonly notifications: NotificationsRepository,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  @Cron(HOURLY, { name: 'review-term-warnings' })
  async run(now: Date = new Date()): Promise<number> {
    if (!this.enabled()) return 0;

    const schools = await this.load.schoolsWithPendingWork();
    if (schools === null) {
      this.logger.warn('Review term warnings skipped: the engine did not answer');
      return 0;
    }

    await this.prisma.reviewTermWarning.deleteMany({
      where: { sentAt: { lt: new Date(now.getTime() - KEEP_WARNINGS_MS) } },
    });

    let sent = 0;
    for (const school of schools) {
      sent += await this.warnOneSchool(school.schoolId);
    }
    return sent;
  }

  private async warnOneSchool(schoolId: string): Promise<number> {
    const terms = await this.load.termsAhead(schoolId, this.settings.termWarningHours);
    if (terms === null || terms.length === 0) return 0;

    const groupIds = [
      ...new Set(terms.map((term) => term.groupId).filter((id): id is string => id !== null)),
    ];
    const reviewers = await this.directory.reviewersOf(groupIds);
    if (reviewers === null) return 0;

    const told = await this.prisma.reviewTermWarning.findMany({
      where: { attemptId: { in: terms.map((term) => term.attemptId) } },
      select: { attemptId: true, userId: true },
    });
    const warnings = composeTermWarnings(
      schoolId,
      terms,
      reviewers,
      new Set(told.map((row) => warnedKey(row.attemptId, row.userId))),
    );

    for (const warning of warnings) {
      await this.warn(warning);
    }

    if (warnings.length > 0) {
      this.logger.log(`Review term warnings: ${warnings.length} teacher(s) in school ${schoolId}`);
    }
    return warnings.length;
  }

  private async warn(warning: TeacherTermWarning): Promise<void> {
    await this.notifications.create({
      recipientId: warning.userId,
      type: NotificationType.REVIEW_TERM_WARNING,
      channel: NotificationChannel.IN_APP,
      subject: `${warning.expiring} submission(s) will be accepted as the AI marked them`,
      templateKey: 'review_term_warning',
      templateData: {
        schoolId: warning.schoolId,
        expiring: warning.expiring,
        withinHours: this.settings.termWarningHours,
        earliestAutoAcceptAt: warning.earliestAutoAcceptAt.toISOString(),
        groups: warning.groups,
      },
    });

    // Only now, and every submission the message named: a pair recorded before the message
    // would claim a warning nobody received.
    await this.prisma.reviewTermWarning.createMany({
      data: warning.attemptIds.map((attemptId) => ({ attemptId, userId: warning.userId })),
      skipDuplicates: true,
    });
  }

  private get settings(): AppConfig['review'] {
    return this.config.get<AppConfig['review']>('review')!;
  }

  /** The digest's switch and the digest's neighbours: the same conversation, the same people. */
  private enabled(): boolean {
    return this.settings.digestEnabled && this.load.configured && this.directory.configured;
  }
}
