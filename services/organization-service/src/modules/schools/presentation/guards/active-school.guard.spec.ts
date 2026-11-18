import { jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import type { ExecutionContext } from '@nestjs/common';
import { ActiveSchoolGuard, ALLOW_INACTIVE_SCHOOL_KEY } from './active-school.guard.js';
import { SchoolNotActiveException } from '../../domain/exceptions/school-not-active.exception.js';
import type { SchoolStatus } from '../../domain/school-access.policy.js';
import { SchoolsController } from '../controllers/schools.controller.js';
import { SchoolGroupsController } from '../controllers/school-groups.controller.js';
import { SchoolMembersController } from '../controllers/school-members.controller.js';
import { SchoolTeachersController } from '../controllers/school-teachers.controller.js';
import { InvitationsController } from '../controllers/invitations.controller.js';
import { EnrollmentController } from '../controllers/enrollment.controller.js';
import { InternalController } from '../controllers/internal.controller.js';

const SCHOOL_ID = '11111111-1111-4111-8111-111111111111';

function setup(status: SchoolStatus | null) {
  const schools = { findStatus: jest.fn(async () => status) };
  const guard = new ActiveSchoolGuard(new Reflector(), schools as never);
  return { guard, schools };
}

function contextOf(
  method: string,
  params: Record<string, string>,
  handler: (...args: never[]) => unknown = function route() {},
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, params }) }),
    getHandler: () => handler,
    getClass: () => class Some {},
  } as unknown as ExecutionContext;
}

describe('ActiveSchoolGuard (plan 90, phase 5, step 3)', () => {
  it.each(['suspended', 'closed', 'purged'] as const)('refuses a write to a %s school with its status', async (status) => {
    const { guard } = setup(status);

    const refusal = guard.canActivate(contextOf('POST', { schoolId: SCHOOL_ID }));

    await expect(refusal).rejects.toBeInstanceOf(SchoolNotActiveException);
    await expect(refusal).rejects.toMatchObject({ schoolId: SCHOOL_ID, status });
  });

  // One case per kind of write the plan names: roster, invitations, applications, groups,
  // group materials, settings — they all come through here as a non-GET with the school's id.
  it.each<[string, Record<string, string>, string]>([
    ['POST', { schoolId: SCHOOL_ID }, 'roster: add a member'],
    ['PATCH', { schoolId: SCHOOL_ID, userId: 'u' }, 'roster: change a student'],
    ['DELETE', { schoolId: SCHOOL_ID, invitationId: 'i' }, 'invitations: revoke'],
    ['POST', { schoolId: SCHOOL_ID, id: 'membership-1' }, 'applications: approve (id is the membership)'],
    ['POST', { schoolId: SCHOOL_ID, groupId: 'g' }, 'groups and their materials'],
    ['PUT', { id: SCHOOL_ID }, 'settings under schools/:id'],
  ])('%s %j is refused (%s)', async (method, params) => {
    const { guard, schools } = setup('suspended');

    await expect(guard.canActivate(contextOf(method, params))).rejects.toBeInstanceOf(SchoolNotActiveException);
    expect(schools.findStatus).toHaveBeenCalledWith(SCHOOL_ID);
  });

  it('lets reads through without asking', async () => {
    const { guard, schools } = setup('suspended');

    await expect(guard.canActivate(contextOf('GET', { schoolId: SCHOOL_ID }))).resolves.toBe(true);
    expect(schools.findStatus).not.toHaveBeenCalled();
  });

  it('lets an active school change', async () => {
    await expect(setup('active').guard.canActivate(contextOf('POST', { schoolId: SCHOOL_ID }))).resolves.toBe(true);
  });

  it('leaves an unknown school to the handler (404) and a malformed id to the pipe (400)', async () => {
    await expect(setup(null).guard.canActivate(contextOf('POST', { schoolId: SCHOOL_ID }))).resolves.toBe(true);

    const { guard, schools } = setup('suspended');
    await expect(guard.canActivate(contextOf('POST', { schoolId: 'not-a-uuid' }))).resolves.toBe(true);
    await expect(guard.canActivate(contextOf('POST', {}))).resolves.toBe(true);
    expect(schools.findStatus).not.toHaveBeenCalled();
  });

  it('lets a route marked AllowInactiveSchool through', async () => {
    const { guard } = setup('suspended');
    const route = function archive() {};
    Reflect.defineMetadata(ALLOW_INACTIVE_SCHOOL_KEY, true, route);

    await expect(guard.canActivate(contextOf('DELETE', { schoolId: SCHOOL_ID }, route))).resolves.toBe(true);
  });

  describe('wiring', () => {
    it.each([
      SchoolsController,
      SchoolGroupsController,
      SchoolMembersController,
      SchoolTeachersController,
      InvitationsController,
      EnrollmentController,
    ])('%p carries the guard on every route', (controller) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(ActiveSchoolGuard);
    });

    it("exempts only the owner's archive (DELETE schools/:schoolId)", () => {
      const proto = SchoolsController.prototype as unknown as Record<string, object>;
      const exempt = Object.getOwnPropertyNames(proto).filter(
        (name) => name !== 'constructor' && Reflect.getMetadata(ALLOW_INACTIVE_SCHOOL_KEY, proto[name]),
      );
      expect(exempt).toEqual(['deleteSchool']);
    });

    it('leaves internal reads alone', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, InternalController) ?? []).not.toContain(ActiveSchoolGuard);
    });
  });
});
