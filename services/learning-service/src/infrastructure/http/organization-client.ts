import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  IOrganizationClient,
  LearnerWorkspaceHints,
  LearnerWorkspaceRef,
  SchoolRole,
} from '../../shared/application/ports/organization-client.port.js';
import { OrganizationClientError } from '../../shared/application/ports/organization-client.port.js';
import { Result } from '../../shared/kernel/result.js';

@Injectable()
export class OrganizationClient implements IOrganizationClient {
  private readonly logger = new Logger(OrganizationClient.name);
  private readonly http: AxiosInstance;

  constructor(config: ConfigService<AppConfig>) {
    const cfg = config.get<AppConfig['organization']>('organization')!;
    const token = config.get<string>('internalServiceToken' as any)!;

    this.http = axios.create({
      baseURL: `${cfg.baseUrl}/api/v1/internal`,
      timeout: cfg.timeoutMs,
      headers: {
        'x-internal-token': token,
        'Content-Type': 'application/json',
      },
    });
  }

  async getMemberRole(
    schoolId: string,
    userId: string,
  ): Promise<Result<SchoolRole | null, OrganizationClientError>> {
    try {
      const { data } = await this.http.get<{ role: SchoolRole | null }>(
        `/schools/${schoolId}/members/${userId}/role`,
      );
      return Result.ok(data.role);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        // Not a member — return null (not an error)
        return Result.ok(null);
      }
      return this.mapError(err, `getMemberRole(${schoolId}, ${userId})`);
    }
  }

  async getLearnerWorkspace(
    userId: string,
    hints: LearnerWorkspaceHints = {},
  ): Promise<Result<LearnerWorkspaceRef, OrganizationClientError>> {
    try {
      const params: Record<string, string> = {};
      if (hints.courseId) params.courseId = hints.courseId;
      if (hints.preferredSchoolId) params.preferredSchoolId = hints.preferredSchoolId;
      if (hints.preferredTeacherId) params.preferredTeacherId = hints.preferredTeacherId;

      const { data } = await this.http.get<LearnerWorkspaceRef>(
        `/students/${userId}/review-context`,
        { params },
      );
      return Result.ok({
        schoolId: data.schoolId ?? null,
        groupId: data.groupId ?? null,
        groupName: data.groupName ?? null,
      });
    } catch (err) {
      return this.mapError(err, `getLearnerWorkspace(${userId})`);
    }
  }

  async getGroupMemberIds(
    schoolId: string,
    groupId: string,
  ): Promise<Result<string[], OrganizationClientError>> {
    try {
      const { data } = await this.http.get<{ userIds: string[] }>(
        `/schools/${schoolId}/groups/${groupId}/members`,
      );
      return Result.ok(data.userIds);
    } catch (err) {
      return this.mapError(err, `getGroupMemberIds(${schoolId}, ${groupId})`);
    }
  }

  private mapError(
    err: unknown,
    context: string,
  ): Result<never, OrganizationClientError> {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const message = (err.response?.data as any)?.message ?? err.message;
      this.logger.warn(`OrgClient [${context}] → ${status ?? 'network'}: ${message}`);
      return Result.fail(new OrganizationClientError(message, status));
    }
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`OrgClient [${context}] unexpected error: ${message}`);
    return Result.fail(new OrganizationClientError(message));
  }
}
