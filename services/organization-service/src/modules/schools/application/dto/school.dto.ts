import type { MemberRole } from '../../domain/value-objects/member-role.vo.js';
import type { SchoolType } from '../../domain/value-objects/school-type.vo.js';
import type { SchoolStatus } from '../../domain/school-access.policy.js';

/** Where the school stands in its lifecycle (plan 90, phase 5). */
export interface SchoolLifecycleDto {
  status: SchoolStatus;
  closesAt: Date | null;
  purgeAt: Date | null;
}

export interface AvailabilityWindow {
  weekday: number; // 1-7
  start: string;   // "HH:mm"
  end: string;     // "HH:mm"
}

export interface SchoolTeacherDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  langs: string[];
  maxWeeklyHours: number | null;
  availability: AvailabilityWindow[];
  employmentType: 'full' | 'part' | 'contract' | null;
  status: 'active' | 'invited' | 'inactive';
}

export interface SchoolMemberDto {
  id: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
}

export interface SchoolDto extends SchoolLifecycleDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  avatarUrl?: string;
  website?: string;
  contactEmail?: string;
  city?: string;
  type: SchoolType;
  isActive: boolean;
  requireTutorReviewForSelfPaced: boolean;
  showGroupPositionToStudents: boolean;
  defaultExplanationLanguage?: string;
  createdAt: Date;
  updatedAt: Date;
  members: SchoolMemberDto[];
}

export interface SchoolSummaryDto extends SchoolLifecycleDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  avatarUrl?: string;
  website?: string;
  contactEmail?: string;
  city?: string;
  memberCount: number;
  createdAt: Date;
  myRole: MemberRole;
  myCapabilities: string[] | null;
}
