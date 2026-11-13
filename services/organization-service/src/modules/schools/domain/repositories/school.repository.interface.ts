import type { School } from '../entities/school.entity.js';
import type { SchoolStatus } from '../school-access.policy.js';
import type { ReviewSettings } from '../value-objects/review-settings.vo.js';
import type { ReviewAiPolicy } from '../value-objects/review-ai-policy.vo.js';
import type { ReviewEffortMinutes } from '../value-objects/review-effort-minutes.vo.js';
import type { AssistantAccess } from '../value-objects/assistant-access.vo.js';
import type { AiPrecheckSettings } from '../value-objects/ai-precheck-settings.vo.js';

export interface PublicSchoolFilter {
  q?: string;
  type?: 'ONLINE' | 'HYBRID';
  cursor?: string;
  limit: number;
}

export interface PublicSchoolPage {
  items: School[];
  total: number;
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface PublicTeacherEntry {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface PublicSchoolDetail {
  school: School;
  studentCount: number;
  levels: string[];
  teachers: PublicTeacherEntry[];
}

export interface ISchoolRepository {
  findById(id: string): Promise<School | null>;
  findBySlug(slug: string): Promise<School | null>;
  findByName(name: string): Promise<School | null>;
  findByOwnerId(ownerId: string): Promise<School[]>;
  findMemberSchools(userId: string): Promise<School[]>;
  /** The school's lifecycle status alone, or null for no such school (plan 90, phase 5). */
  findStatus(schoolId: string): Promise<SchoolStatus | null>;
  findAllActive(): Promise<School[]>;
  findPublicFiltered(filter: PublicSchoolFilter): Promise<PublicSchoolPage>;
  findPublicSchoolDetail(slug: string): Promise<PublicSchoolDetail | null>;
  findManagerCapabilities(userId: string, schoolIds: string[]): Promise<Map<string, string[]>>;
  save(school: School): Promise<void>;
  /**
   * Writes only the response promise.
   *
   * `save` rewrites the whole roster — it deletes every member row and recreates them —
   * which is a great deal to do to a school because an administrator moved a deadline
   * from 48 hours to 24.
   */
  saveReviewSettings(schoolId: string, settings: ReviewSettings): Promise<void>;
  /** Writes only who answers work first, for the same reason as `saveReviewSettings`. */
  saveReviewAiPolicy(schoolId: string, policy: ReviewAiPolicy): Promise<void>;
  /**
   * The minutes per submission a school set (plan 81, Q5), or null for no such school.
   * Read on its own rather than through `findById`: the forecast asks for it per school
   * and has no use for the roster.
   */
  findReviewEffortMinutes(schoolId: string): Promise<ReviewEffortMinutes | null>;
  /** Writes only the minutes per submission, for the same reason as `saveReviewSettings`. */
  saveReviewEffortMinutes(schoolId: string, minutes: ReviewEffortMinutes): Promise<void>;
  /** Which students the school's assistant answers on its account (plan 83, Q6), or null for no such school. */
  findAssistantAccess(schoolId: string): Promise<AssistantAccess | null>;
  /** Writes only the assistant choice, for the same reason as `saveReviewSettings`. */
  saveAssistantAccess(schoolId: string, access: AssistantAccess): Promise<void>;
  /**
   * Of the ids given, those that are still the school's to choose: its groups that are not
   * deleted, and its students that are not archived.
   */
  findAssistantSelectable(
    schoolId: string,
    groupIds: readonly string[],
    studentIds: readonly string[],
  ): Promise<{ groupIds: string[]; studentIds: string[] }>;
  /** Whether learners may rehearse with a model, and the school's limits (plan 84), or null for no such school. */
  findAiPrecheckSettings(schoolId: string): Promise<AiPrecheckSettings | null>;
  /** Writes only the rehearsal settings, for the same reason as `saveReviewSettings`. */
  saveAiPrecheckSettings(schoolId: string, settings: AiPrecheckSettings): Promise<void>;
}

export const SCHOOL_REPOSITORY = Symbol('SCHOOL_REPOSITORY');
