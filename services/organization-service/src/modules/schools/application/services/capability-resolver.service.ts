import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { MemberRole } from '../../domain/value-objects/member-role.vo.js';
import { ALL_CAPABILITIES, type Capability } from '../../domain/value-objects/capability.vo.js';
import { ForbiddenOperationException } from '../../domain/exceptions/forbidden-operation.exception.js';
import type { School } from '../../domain/entities/school.entity.js';

// Roles that implicitly have all capabilities (no DB lookup needed).
const OMNIPOTENT_ROLES: ReadonlySet<MemberRole> = new Set([
  MemberRole.OWNER,
  MemberRole.ADMIN,
]);

@Injectable()
export class CapabilityResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the effective capability set for a user in a school.
   * OWNER / ADMIN → all capabilities.
   * MANAGER → exactly what is stored in school_member_permissions.
   * All other roles → empty set (their access is governed by hardcoded role checks).
   */
  async getEffectiveCapabilities(
    userId: string,
    schoolId: string,
    school: School,
  ): Promise<Set<string>> {
    const isOwner = userId === school.ownerId;
    if (isOwner) return new Set(ALL_CAPABILITIES);

    const role = school.getMemberRole(userId);
    if (!role) return new Set();

    if (OMNIPOTENT_ROLES.has(role)) return new Set(ALL_CAPABILITIES);

    if (role === MemberRole.MANAGER) {
      const row = await (this.prisma as any).schoolMemberPermission.findUnique({
        where: { schoolId_userId: { schoolId, userId } },
      });
      return new Set<string>((row?.capabilities as string[]) ?? []);
    }

    return new Set();
  }

  /**
   * Throws ForbiddenOperationException when the user lacks the requested capability.
   */
  async requireCapability(
    userId: string,
    capability: Capability,
    schoolId: string,
    school: School,
  ): Promise<void> {
    const caps = await this.getEffectiveCapabilities(userId, schoolId, school);
    if (!caps.has(capability)) {
      throw new ForbiddenOperationException(
        `Missing capability: ${capability}`,
      );
    }
  }
}
