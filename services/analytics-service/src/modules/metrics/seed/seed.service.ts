import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

interface EnrollmentRow {
  id: string;
  userId: string;
  containerId: string;
  schoolId: string | null;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  unenrolledAt: string | null;
}

interface ProgressRow {
  userId: string;
  contentType: string;
  contentId: string;
  status: string;
  lastAttemptAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface SnapshotPage<T> {
  data: T[];
  nextCursor: string | null;
}

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  private readonly learningBaseUrl: string;
  private readonly serviceToken: string;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {
    this.learningBaseUrl = this.config.get<AppConfig['learning']>('learning')?.baseUrl ?? 'http://learning-service:3005';
    this.serviceToken = this.config.get<AppConfig['organization']>('organization')?.token ?? 'internal-dev-token';
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      const alreadySeeded = await this.prisma.enrollmentProjection.count();
      if (alreadySeeded > 0) {
        this.logger.log('SeedService: skipping seed — enrollment_projection already populated');
        return;
      }

      this.logger.log('SeedService: starting initial seed from learning-service snapshot');
      await this.seedEnrollments();
      await this.seedProgress();
      this.logger.log('SeedService: initial seed complete');
    } catch (err) {
      this.logger.warn(`SeedService: seed failed (non-fatal, live events will build projections): ${String(err)}`);
    }
  }

  private async seedEnrollments(): Promise<void> {
    let cursor: string | undefined;
    let total = 0;

    do {
      const url = new URL(`${this.learningBaseUrl}/internal/analytics/snapshot/enrollments`);
      url.searchParams.set('limit', '500');
      if (cursor) url.searchParams.set('cursor', cursor);

      const page = await this.fetchPage<EnrollmentRow>(url.toString());

      if (page.data.length > 0) {
        await this.prisma.enrollmentProjection.createMany({
          data: page.data.map((r) => ({
            enrollmentId: r.id,
            userId: r.userId,
            containerId: r.containerId,
            schoolId: r.schoolId ?? null,
            status: r.status,
            enrolledAt: new Date(r.enrolledAt),
            completedAt: r.completedAt ? new Date(r.completedAt) : null,
            unenrolledAt: r.unenrolledAt ? new Date(r.unenrolledAt) : null,
          })),
          skipDuplicates: true,
        });
        total += page.data.length;
      }

      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    this.logger.log(`SeedService: seeded ${total} enrollments`);
  }

  private async seedProgress(): Promise<void> {
    let cursor: string | undefined;
    let total = 0;

    do {
      const url = new URL(`${this.learningBaseUrl}/internal/analytics/snapshot/progress`);
      url.searchParams.set('limit', '500');
      if (cursor) url.searchParams.set('cursor', cursor);

      const page = await this.fetchPage<ProgressRow>(url.toString());

      if (page.data.length > 0) {
        // For each progress record, create synthetic ProgressActivity entries.
        // IN_PROGRESS/NEEDS_REVIEW → 'updated' entry; COMPLETED → also 'completed' entry.
        type ActivityRow = { id: string; userId: string; contentType: string; contentId: string; kind: string; occurredAt: Date };
        const rows = page.data.flatMap((r): ActivityRow[] => {
          const entries: ActivityRow[] = [
            {
              id: randomUUID(),
              userId: r.userId,
              contentType: r.contentType,
              contentId: r.contentId,
              kind: 'updated',
              occurredAt: new Date(r.lastAttemptAt ?? r.createdAt),
            },
          ];
          if (r.status === 'COMPLETED' && r.completedAt) {
            entries.push({
              id: randomUUID(),
              userId: r.userId,
              contentType: r.contentType,
              contentId: r.contentId,
              kind: 'completed',
              occurredAt: new Date(r.completedAt),
            });
          }
          return entries;
        });

        await this.prisma.progressActivity.createMany({ data: rows, skipDuplicates: true });
        total += rows.length;
      }

      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    this.logger.log(`SeedService: seeded ${total} progress_activity rows`);
  }

  private async fetchPage<T>(url: string): Promise<SnapshotPage<T>> {
    const res = await fetch(url, {
      headers: { 'x-service-token': this.serviceToken },
    });
    if (!res.ok) {
      throw new Error(`Snapshot fetch failed: ${res.status} ${res.statusText} — ${url}`);
    }
    return res.json() as Promise<SnapshotPage<T>>;
  }
}
