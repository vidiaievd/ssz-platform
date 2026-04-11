import type { MemberRole } from '../../domain/value-objects/member-role.vo.js';

export interface SchoolMemberDto {
  id: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
}

export interface SchoolDto {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  members: SchoolMemberDto[];
}

export interface SchoolSummaryDto {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  avatarUrl?: string;
  memberCount: number;
  createdAt: Date;
}
