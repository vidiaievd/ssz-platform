import type { MemberRole } from '../../domain/value-objects/member-role.vo.js';
import type { SchoolType } from '../../domain/value-objects/school-type.vo.js';

export interface SchoolMemberDto {
  id: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
}

export interface SchoolDto {
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
  defaultExplanationLanguage?: string;
  createdAt: Date;
  updatedAt: Date;
  members: SchoolMemberDto[];
}

export interface SchoolSummaryDto {
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
}
