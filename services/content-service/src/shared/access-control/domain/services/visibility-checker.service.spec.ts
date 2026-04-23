import { VisibilityCheckerService } from './visibility-checker.service.js';
import { Visibility } from '../../../../modules/container/domain/value-objects/visibility.vo.js';
import { AccessTier } from '../../../../modules/container/domain/value-objects/access-tier.vo.js';
import { TaggableEntityType } from '../types/taggable-entity-type.js';
import type { AccessibleEntity } from '../types/accessible-entity.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import type { IOrganizationClient } from '../ports/organization-client.port.js';
import type { IContentShareLookup } from '../ports/content-share-lookup.port.js';
import type { IEntitlementLookup } from '../ports/entitlement-lookup.port.js';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-user';
const OTHER_ID = 'other-user';
const SCHOOL_ID = 'school-1';

function makeEntity(overrides: Partial<AccessibleEntity> = {}): AccessibleEntity {
  return {
    id: 'entity-1',
    entityType: TaggableEntityType.CONTAINER,
    ownerUserId: OWNER_ID,
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    deletedAt: null,
    accessTier: AccessTier.PUBLIC_FREE,
    ...overrides,
  };
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    userId: OTHER_ID,
    isPlatformAdmin: false,
    roles: [],
    ...overrides,
  };
}

function makeService(mocks?: {
  getMemberRole?: jest.Mock;
  hasActiveShare?: jest.Mock;
  hasActiveEntitlement?: jest.Mock;
}): VisibilityCheckerService {
  const orgClient: IOrganizationClient = {
    getMemberRole: mocks?.getMemberRole ?? jest.fn().mockResolvedValue(null),
  };
  const shareLookup: IContentShareLookup = {
    hasActiveShare: mocks?.hasActiveShare ?? jest.fn().mockResolvedValue(false),
  };
  const entitlementLookup: IEntitlementLookup = {
    hasActiveEntitlement: mocks?.hasActiveEntitlement ?? jest.fn().mockResolvedValue(false),
  };
  return new VisibilityCheckerService(orgClient, shareLookup, entitlementLookup);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('VisibilityCheckerService', () => {
  // 1. Soft-deleted, owner, view → ALLOWED
  it('allows owner to view soft-deleted entity', async () => {
    const svc = makeService();
    const entity = makeEntity({ deletedAt: new Date(), ownerUserId: OTHER_ID });
    const user = makeUser({ userId: OTHER_ID });
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(true);
  });

  // 2. Soft-deleted, non-owner, view → DENIED
  it('denies non-owner viewing a soft-deleted entity', async () => {
    const svc = makeService();
    const entity = makeEntity({ deletedAt: new Date() });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('soft_deleted');
  });

  // 3. Soft-deleted, platform admin, view → ALLOWED
  it('allows platform admin to view soft-deleted entity', async () => {
    const svc = makeService();
    const entity = makeEntity({ deletedAt: new Date() });
    const user = makeUser({ isPlatformAdmin: true });
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(true);
  });

  // 4. Soft-deleted, owner, edit → DENIED
  it('denies owner editing a soft-deleted entity', async () => {
    const svc = makeService();
    const entity = makeEntity({ deletedAt: new Date(), ownerUserId: OTHER_ID });
    const user = makeUser({ userId: OTHER_ID });
    const result = await svc.canAccess(user, entity, 'edit');
    expect(result.allowed).toBe(false);
  });

  // 5. Platform admin, any action → ALLOWED
  it('allows platform admin full access on live entity', async () => {
    const svc = makeService();
    const entity = makeEntity({ visibility: Visibility.PRIVATE });
    const user = makeUser({ isPlatformAdmin: true });
    for (const action of ['view', 'edit'] as const) {
      const result = await svc.canAccess(user, entity, action);
      expect(result.allowed).toBe(true);
    }
  });

  // 6. Owner, any action → ALLOWED
  it('allows owner full access on their own entity', async () => {
    const svc = makeService();
    const entity = makeEntity({ ownerUserId: OTHER_ID, visibility: Visibility.PRIVATE });
    const user = makeUser({ userId: OTHER_ID });
    for (const action of ['view', 'edit'] as const) {
      const result = await svc.canAccess(user, entity, action);
      expect(result.allowed).toBe(true);
    }
  });

  // 7. School content, content_admin, edit → ALLOWED
  it('allows school content_admin to edit school entity', async () => {
    const getMemberRole = jest.fn().mockResolvedValue('content_admin');
    const svc = makeService({ getMemberRole });
    const entity = makeEntity({ ownerSchoolId: SCHOOL_ID });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'edit');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('school_editor');
  });

  // 8. School content, teacher, edit → DENIED
  it('denies teacher editing school entity', async () => {
    const getMemberRole = jest.fn().mockResolvedValue('teacher');
    const svc = makeService({ getMemberRole });
    const entity = makeEntity({ ownerSchoolId: SCHOOL_ID });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'edit');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('insufficient_school_role');
  });

  // 9. School content, teacher, view → ALLOWED
  it('allows teacher to view school entity', async () => {
    const getMemberRole = jest.fn().mockResolvedValue('teacher');
    const svc = makeService({ getMemberRole });
    const entity = makeEntity({ ownerSchoolId: SCHOOL_ID, visibility: Visibility.SCHOOL_PRIVATE });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(true);
  });

  // 10. School content, student, school_private, view → ALLOWED
  it('allows school student to view school_private entity', async () => {
    const getMemberRole = jest.fn().mockResolvedValue('student');
    const svc = makeService({ getMemberRole });
    const entity = makeEntity({ ownerSchoolId: SCHOOL_ID, visibility: Visibility.SCHOOL_PRIVATE });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(true);
  });

  // 11. School content, non-member, public, view → ALLOWED
  it('allows non-member to view public school entity', async () => {
    const getMemberRole = jest.fn().mockResolvedValue(null);
    const svc = makeService({ getMemberRole });
    const entity = makeEntity({
      ownerSchoolId: SCHOOL_ID,
      visibility: Visibility.PUBLIC,
      accessTier: AccessTier.PUBLIC_FREE,
    });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(true);
  });

  // 12. public + public_free, enroll → ALLOWED
  it('allows enroll on public/public_free container', async () => {
    const svc = makeService();
    const entity = makeEntity({
      visibility: Visibility.PUBLIC,
      accessTier: AccessTier.PUBLIC_FREE,
    });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'enroll');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('public_free');
  });

  // 13. public + public_paid + no entitlement → DENIED
  it('denies enroll on public_paid without entitlement', async () => {
    const hasActiveEntitlement = jest.fn().mockResolvedValue(false);
    const svc = makeService({ hasActiveEntitlement });
    const entity = makeEntity({
      visibility: Visibility.PUBLIC,
      accessTier: AccessTier.PUBLIC_PAID,
    });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'enroll');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_entitlement');
  });

  // 14. public + public_paid + active entitlement → ALLOWED
  it('allows enroll on public_paid with active entitlement', async () => {
    const hasActiveEntitlement = jest.fn().mockResolvedValue(true);
    const svc = makeService({ hasActiveEntitlement });
    const entity = makeEntity({
      visibility: Visibility.PUBLIC,
      accessTier: AccessTier.PUBLIC_PAID,
    });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'enroll');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('active_entitlement');
  });

  // 15. free_within_school + school member → ALLOWED
  it('allows enroll on free_within_school for a school member', async () => {
    const getMemberRole = jest.fn().mockResolvedValue('student');
    const svc = makeService({ getMemberRole });
    const entity = makeEntity({
      ownerSchoolId: SCHOOL_ID,
      visibility: Visibility.PUBLIC,
      accessTier: AccessTier.FREE_WITHIN_SCHOOL,
    });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'enroll');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('free_within_school_member');
  });

  // 16. free_within_school + non-member → DENIED
  it('denies enroll on free_within_school for a non-member', async () => {
    const getMemberRole = jest.fn().mockResolvedValue(null);
    const svc = makeService({ getMemberRole });
    const entity = makeEntity({
      ownerSchoolId: SCHOOL_ID,
      visibility: Visibility.PUBLIC,
      accessTier: AccessTier.FREE_WITHIN_SCHOOL,
    });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'enroll');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_school_membership');
  });

  // 17. shared + active share → ALLOWED
  it('allows view on shared entity with active share', async () => {
    const hasActiveShare = jest.fn().mockResolvedValue(true);
    const svc = makeService({ hasActiveShare });
    const entity = makeEntity({ visibility: Visibility.SHARED });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('active_share');
  });

  // 18. shared + no share → DENIED
  it('denies view on shared entity with no active share', async () => {
    const hasActiveShare = jest.fn().mockResolvedValue(false);
    const svc = makeService({ hasActiveShare });
    const entity = makeEntity({ visibility: Visibility.SHARED });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_active_share');
  });

  // 19. shared + expired share (share lookup returns false) → DENIED
  it('denies view on shared entity when share is expired', async () => {
    const hasActiveShare = jest.fn().mockResolvedValue(false);
    const svc = makeService({ hasActiveShare });
    const entity = makeEntity({ visibility: Visibility.SHARED });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(false);
  });

  // 20. private + non-owner → DENIED
  it('denies non-owner viewing a private entity', async () => {
    const svc = makeService();
    const entity = makeEntity({ visibility: Visibility.PRIVATE });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'view');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('private');
  });

  // 21. assigned_only + non-owner → DENIED
  it('denies enroll on assigned_only container for non-owner', async () => {
    const svc = makeService();
    const entity = makeEntity({
      visibility: Visibility.PUBLIC,
      accessTier: AccessTier.ASSIGNED_ONLY,
    });
    const user = makeUser();
    const result = await svc.canAccess(user, entity, 'enroll');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('assigned_only');
  });

  // Guard: enroll on non-container throws developer error
  it('throws when action=enroll is applied to a non-container entity', async () => {
    const svc = makeService();
    const entity = makeEntity({ entityType: TaggableEntityType.LESSON });
    const user = makeUser();
    await expect(svc.canAccess(user, entity, 'enroll')).rejects.toThrow(
      "action='enroll' is only valid for CONTAINER",
    );
  });
});
