import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

export interface GroupTeacherEntry {
  userId: string;
  role: string;
  fromDate?: string | null;
  toDate?: string | null;
}

export interface SchoolTeacherEntry {
  userId: string;
  maxWeeklyHours: number | null;
  availability: Array<{ weekday: number; start: string; end: string }>;
  employmentType: string | null;
  status: string;
}

export interface SchoolMemberEntry {
  userId: string;
  role: string;
}

export interface GroupInfo {
  id: string;
  schoolId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  lang?: string | null;
  /** The course the group is taught from; null while none is linked. */
  courseId?: string | null;
}

export const ORG_SERVICE_PORT = Symbol('IOrgServicePort');

@Injectable()
export class OrgServiceHttpClient {
  private readonly logger = new Logger(OrgServiceHttpClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    this.baseUrl = config.get<AppConfig['organization']>('organization')?.baseUrl ?? 'http://organization-service:3002';
    this.token = config.get<AppConfig['organization']>('organization')?.token ?? '';
  }

  // organization-service gates every /internal/* route behind InternalAuthGuard,
  // which expects the shared service token in 'x-internal-token'. Without it the
  // call 401s and callers see it as "group does not exist".
  private internalHeaders(): Record<string, string> {
    return { 'x-internal-token': this.token };
  }

  async getGroupTeachers(schoolId: string, groupId: string): Promise<GroupTeacherEntry[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/internal/schools/${schoolId}/groups/${groupId}/teachers`,
        { headers: this.internalHeaders() },
      );
      if (!res.ok) {
        this.logger.warn(`getGroupTeachers: org-service returned ${res.status} for group ${groupId}`);
        return [];
      }
      return (await res.json()) as GroupTeacherEntry[];
    } catch (err) {
      this.logger.warn(`getGroupTeachers failed: ${String(err)}`);
      return [];
    }
  }

  async getSchoolTeachers(schoolId: string): Promise<SchoolTeacherEntry[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/schools/${schoolId}/teachers`,
        { headers: { Authorization: `Bearer ${this.token}` } },
      );
      if (!res.ok) {
        this.logger.warn(`getSchoolTeachers: org-service returned ${res.status} for school ${schoolId}`);
        return [];
      }
      return (await res.json()) as SchoolTeacherEntry[];
    } catch (err) {
      this.logger.warn(`getSchoolTeachers failed: ${String(err)}`);
      return [];
    }
  }

  async getGroup(schoolId: string, groupId: string): Promise<GroupInfo | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/internal/schools/${schoolId}/groups/${groupId}`,
        { headers: this.internalHeaders() },
      );
      if (!res.ok) {
        if (res.status !== 404) {
          this.logger.warn(`getGroup: org-service returned ${res.status} for group ${groupId}`);
        }
        return null;
      }
      return (await res.json()) as GroupInfo;
    } catch (err) {
      this.logger.warn(`getGroup failed: ${String(err)}`);
      return null;
    }
  }

  async getSchoolMembers(schoolId: string): Promise<SchoolMemberEntry[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/schools/${schoolId}`,
        { headers: { Authorization: `Bearer ${this.token}` } },
      );
      if (!res.ok) {
        this.logger.warn(`getSchoolMembers: org-service returned ${res.status} for school ${schoolId}`);
        return [];
      }
      const body = await res.json() as { members?: SchoolMemberEntry[] };
      return body.members ?? [];
    } catch (err) {
      this.logger.warn(`getSchoolMembers failed: ${String(err)}`);
      return [];
    }
  }
}
