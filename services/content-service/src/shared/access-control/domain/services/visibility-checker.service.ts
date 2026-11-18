import { Injectable, Inject, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { Visibility } from '../../../../modules/container/domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../../modules/container/domain/value-objects/access-tier.vo.js';
import { TaggableEntityType } from '../types/taggable-entity-type.js';
import type { AccessibleEntity } from '../types/accessible-entity.js';
import type { AccessAction } from '../types/access-action.js';
import type { AccessDecision } from '../types/access-decision.js';
import { ORGANIZATION_CLIENT } from '../ports/organization-client.port.js';
import type { IOrganizationClient, SchoolLifecycleStatus } from '../ports/organization-client.port.js';
import { SCHOOL_NOT_ACTIVE_REASON } from '../../presentation/exceptions/access-denied.exception.js';
import { CONTENT_SHARE_LOOKUP } from '../ports/content-share-lookup.port.js';
import type { IContentShareLookup } from '../ports/content-share-lookup.port.js';
import { ENTITLEMENT_LOOKUP } from '../ports/entitlement-lookup.port.js';
import type { IEntitlementLookup } from '../ports/entitlement-lookup.port.js';

const SCHOOL_STATUS_CACHE_MS = 30_000;

const ALLOW = (reason?: string): AccessDecision => ({ allowed: true, reason });
const DENY = (reason: string): AccessDecision => ({ allowed: false, reason });

/**
 * The grants that come from making, teaching or co-authoring the material rather than from
 * studying it: everything `canAccess` allows except `public` and `school_student_view`.
 * Shares are collaborator grants (the web calls them «Collaborators»), so they count here.
 *
 * Kept next to the algorithm on purpose — a new ALLOW reason added above is a question
 * this list has to answer, and here it cannot be missed.
 */
const STAFF_REASONS: ReadonlySet<string> = new Set([
  'platform_admin',
  'owner',
  'owner_view_deleted',
  'co_author_edit',
  'school_member',
  'school_editor',
  'active_share',
]);

/** Whether an allowed decision was granted to staff rather than to a learner. */
export function isStaffGrant(decision: AccessDecision): boolean {
  return decision.allowed && STAFF_REASONS.has(decision.reason ?? '');
}

@Injectable()
export class VisibilityCheckerService {
  private readonly logger = new Logger(VisibilityCheckerService.name);

  private readonly statuses = new Map<string, { status: SchoolLifecycleStatus; at: number }>();

  constructor(
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
    @Inject(CONTENT_SHARE_LOOKUP) private readonly shareLookup: IContentShareLookup,
    @Inject(ENTITLEMENT_LOOKUP) private readonly entitlementLookup: IEntitlementLookup,
  ) {}

  async canAccess(
    user: AuthenticatedUser,
    entity: AccessibleEntity,
    action: AccessAction,
  ): Promise<AccessDecision> {
    const decision = await this.decide(user, entity, action);

    // Whoever may edit may also look. A co-author outside the owning school passes the edit
    // check through their share (3b) yet fell through every view rule, so the builder could
    // write a document it was refused to read. Asked only after a refusal: an extra lookup on
    // every learner's view would buy nothing.
    if (action === 'view' && !decision.allowed && entity.deletedAt === null) {
      const hasEditShare = await this.shareLookup.hasActiveEditShare(
        entity.entityType,
        entity.id,
        user.userId,
      );
      if (hasEditShare) return ALLOW('co_author_edit');
    }

    return decision;
  }

  private async decide(
    user: AuthenticatedUser,
    entity: AccessibleEntity,
    action: AccessAction,
  ): Promise<AccessDecision> {
    if (action === 'enroll' && entity.entityType !== TaggableEntityType.CONTAINER) {
      // Developer mistake — enroll only applies to containers.
      throw new Error(
        `canAccess: action='enroll' is only valid for CONTAINER, got '${entity.entityType}'`,
      );
    }

    // 1. Soft-deleted: only owner (view only) and platform admin can access.
    if (entity.deletedAt !== null) {
      if (user.userId === entity.ownerUserId && action === 'view')
        return ALLOW('owner_view_deleted');
      if (user.isPlatformAdmin) return ALLOW('platform_admin');
      return DENY('soft_deleted');
    }

    // 2. Platform admin bypasses all checks.
    if (user.isPlatformAdmin) return ALLOW('platform_admin');

    // 2b. A school that is not active is read only (plan 90, phase 5, step 7): nobody edits its
    // material — not even the author — until it is reactivated or restored. Read straight from
    // organization-service (the role answer says nothing about the owner or a co-author).
    if (action === 'edit' && entity.ownerSchoolId !== null) {
      if ((await this.schoolStatusOf(entity.ownerSchoolId)) !== 'active') return DENY(SCHOOL_NOT_ACTIVE_REASON);
    }

    // 3. Owner always has full access.
    if (user.userId === entity.ownerUserId) return ALLOW('owner');

    // 3b. Co-author: an active EDIT-level content share grants edit access
    // independent of visibility/school ownership. Checked before the school
    // branch so co-authors don't need school membership at all.
    if (action === 'edit') {
      const hasEditShare = await this.shareLookup.hasActiveEditShare(
        entity.entityType,
        entity.id,
        user.userId,
      );
      if (hasEditShare) return ALLOW('co_author_edit');
    }

    // 4. School content — resolve member role once and cache for this request.
    let cachedRole: Awaited<ReturnType<IOrganizationClient['getMemberRole']>> | undefined;

    if (entity.ownerSchoolId !== null) {
      cachedRole = await this.orgClient.getMemberRole(user.userId, entity.ownerSchoolId);

      if (action === 'edit') {
        if (cachedRole === 'owner' || cachedRole === 'content_admin') return ALLOW('school_editor');
        return DENY('insufficient_school_role');
      }

      // Non-student school members (owner, content_admin, teacher, admin) see all school content.
      if (
        cachedRole === 'owner' ||
        cachedRole === 'content_admin' ||
        cachedRole === 'teacher' ||
        cachedRole === 'admin'
      ) {
        return ALLOW('school_member');
      }
      // student and non-member fall through to visibility checks below.
    }

    // 5. Edit gate — only owners / school editors can edit (handled above).
    if (action === 'edit') return DENY('not_owner');

    // 6. Visibility-based rules.
    switch (entity.visibility) {
      case Visibility.PUBLIC: {
        if (action === 'view') return ALLOW('public');
        // action === 'enroll'
        return this.checkAccessTier(user, entity, cachedRole);
      }

      case Visibility.SCHOOL_PRIVATE: {
        if (entity.ownerSchoolId !== null) {
          // Use cached role if available; otherwise fetch (user was not a privileged member).
          const role =
            cachedRole !== undefined
              ? cachedRole
              : await this.orgClient.getMemberRole(user.userId, entity.ownerSchoolId);

          if (role === 'student') {
            if (action === 'view') return ALLOW('school_student_view');
            return this.checkAccessTier(user, entity, role);
          }
        }
        return DENY('private');
      }

      case Visibility.SHARED: {
        const hasShare = await this.shareLookup.hasActiveShare(
          entity.entityType,
          entity.id,
          user.userId,
        );
        if (hasShare) {
          if (action === 'view') return ALLOW('active_share');
          return this.checkAccessTier(user, entity, cachedRole);
        }
        return DENY('no_active_share');
      }

      case Visibility.PRIVATE: {
        // Owner was already checked above.
        return DENY('private');
      }
    }

    return DENY('private');
  }

  /**
   * Kept 30 s: a status changes rarely and every edit of school material asks. An unreadable
   * answer lets the edit through — an outage of a neighbour must not stop a teacher's work.
   */
  private async schoolStatusOf(schoolId: string): Promise<SchoolLifecycleStatus> {
    const hit = this.statuses.get(schoolId);
    if (hit && Date.now() - hit.at < SCHOOL_STATUS_CACHE_MS) return hit.status;
    try {
      const status = (await this.orgClient.getSchoolStatus(schoolId)) ?? 'active';
      this.statuses.set(schoolId, { status, at: Date.now() });
      return status;
    } catch (err) {
      this.logger.warn(`Status of school ${schoolId} unreadable (${String(err)}); not checking it`);
      return 'active';
    }
  }

  private async checkAccessTier(
    user: AuthenticatedUser,
    entity: AccessibleEntity,
    cachedRole: Awaited<ReturnType<IOrganizationClient['getMemberRole']>> | undefined,
  ): Promise<AccessDecision> {
    if (entity.accessTier === undefined) {
      // Should not happen: enroll is only valid on containers which always have accessTier.
      this.logger.error(
        `checkAccessTier called on entity ${entity.id} (${entity.entityType}) with no accessTier — denying`,
      );
      return DENY('no_access_tier');
    }

    switch (entity.accessTier) {
      case AccessTier.PUBLIC_FREE:
        return ALLOW('public_free');

      case AccessTier.FREE_WITHIN_SCHOOL: {
        if (entity.ownerSchoolId !== null) {
          const role =
            cachedRole !== undefined
              ? cachedRole
              : await this.orgClient.getMemberRole(user.userId, entity.ownerSchoolId);
          if (role !== null) return ALLOW('free_within_school_member');
        }
        return DENY('no_school_membership');
      }

      case AccessTier.PUBLIC_PAID:
      case AccessTier.ENTITLEMENT_REQUIRED: {
        const hasEntitlement = await this.entitlementLookup.hasActiveEntitlement(
          user.userId,
          entity.id,
        );
        if (hasEntitlement) return ALLOW('active_entitlement');
        return DENY('no_entitlement');
      }

      case AccessTier.ASSIGNED_ONLY:
        // Only Learning Service creates enrollments via assignment flow.
        return DENY('assigned_only');
    }
  }
}
