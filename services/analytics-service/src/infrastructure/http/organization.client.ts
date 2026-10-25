import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

/** A teacher assigned to a group on the asked day, as organization-service keeps it. */
export interface GroupTeacher {
  userId: string;
  name: string;
  /** `primary` | `co_primary` | `substitute`. */
  role: string;
}

export interface GroupTeachers {
  groupId: string;
  teachers: GroupTeacher[];
}

/**
 * Who taught a group on a given day, asked of the service that keeps the assignments with
 * their dates (plan 80, step 6b).
 *
 * Not projected here: substitutions are edited after the fact, and the auto-acceptance
 * journal must answer with the assignments as they stand now, not as an event once said.
 *
 * Unreachable answers `null`, so the caller can say "we could not ask who taught" instead
 * of putting the work on nobody.
 */
@Injectable()
export class OrganizationClient {
  private readonly logger = new Logger(OrganizationClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const organization = this.config.get<AppConfig['organization']>('organization');
    this.baseUrl = organization?.baseUrl ?? 'http://organization-service:3002';
    this.token = organization?.token ?? 'internal-dev-token';
  }

  async teachersOf(groupIds: string[], at: Date): Promise<GroupTeachers[] | null> {
    if (groupIds.length === 0) return [];
    try {
      // organization-service mounts internal routes under the global `/api/v1` too.
      const res = await fetch(`${this.baseUrl}/api/v1/internal/review/reviewers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
        body: JSON.stringify({ groupIds, at: at.toISOString() }),
      });

      if (!res.ok) {
        this.logger.warn(`Teachers of ${groupIds.length} group(s) at ${at.toISOString()} failed: ${res.status}`);
        return null;
      }

      return ((await res.json()) as { groups: GroupTeachers[] }).groups;
    } catch (error) {
      this.logger.warn(`Teachers of groups unreachable: ${(error as Error).message}`);
      return null;
    }
  }
}
