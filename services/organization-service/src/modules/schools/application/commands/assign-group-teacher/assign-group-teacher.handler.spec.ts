import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { AssignGroupTeacherHandler } from './assign-group-teacher.handler.js';
import { AssignGroupTeacherCommand } from './assign-group-teacher.command.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import type { GroupTeacherProps, GroupTeacherRole } from '../../../domain/entities/school-group.entity.js';
import type { ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import type { ISchoolGroupRepository } from '../../../domain/repositories/school-group.repository.interface.js';
import type { IGroupTeacherRepository } from '../../../domain/repositories/group-teacher.repository.interface.js';
import type { IProfileServicePort } from '../../../../../shared/application/ports/profile-service.interface.js';

const OWNER = 'owner-1';
const TEACHER = 'teacher-1';
const OTHER = 'teacher-2';

function day(offset: number): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset));
}

function row(userId: string, role: GroupTeacherRole, toDate: Date | null = null): GroupTeacherProps {
  return {
    id: `${userId}-${role}`,
    groupId: 'g-1',
    userId,
    role,
    fromDate: null,
    toDate,
    reason: role === 'substitute' ? 'sick leave' : null,
    createdAt: new Date('2026-01-01'),
  };
}

function setup(teachers: GroupTeacherProps[]) {
  const school = {
    ownerId: OWNER,
    getMemberRole: (userId: string) => (userId === OWNER ? null : MemberRole.TEACHER),
  };
  const group = { schoolId: 's-1', isDeleted: false, lang: null, teachers };
  const teacherRepo = {
    save: jest.fn<IGroupTeacherRepository['save']>().mockResolvedValue(undefined),
    remove: jest.fn<IGroupTeacherRepository['remove']>().mockResolvedValue(undefined),
  };
  const handler = new AssignGroupTeacherHandler(
    { findById: jest.fn(async () => school) } as unknown as ISchoolRepository,
    { findById: jest.fn(async () => group) } as unknown as ISchoolGroupRepository,
    teacherRepo as unknown as IGroupTeacherRepository,
    { getTeachingLanguages: jest.fn(async () => null) } as unknown as IProfileServicePort,
  );
  return { handler, teacherRepo };
}

function assign(role: GroupTeacherRole, userId = TEACHER, override = false) {
  return new AssignGroupTeacherCommand(
    OWNER, 's-1', 'g-1', userId, role, null, null,
    role === 'substitute' ? 'sick leave' : null, override,
  );
}

async function conflictBody(promise: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ConflictException);
    return (e as ConflictException).getResponse() as Record<string, unknown>;
  }
  throw new Error('expected a conflict');
}

describe('AssignGroupTeacherHandler — one role per person in a group (OQ-17)', () => {
  it('refuses a co-teacher who is already the substitute of the group', async () => {
    const { handler, teacherRepo } = setup([row(OTHER, 'primary'), row(TEACHER, 'substitute')]);

    const body = await conflictBody(handler.execute(assign('co_primary')));

    expect(body).toMatchObject({ error: 'already-in-group', existingRole: 'substitute' });
    expect(teacherRepo.save).not.toHaveBeenCalled();
  });

  it('refuses making the lead teacher a substitute of the same group', async () => {
    const { handler, teacherRepo } = setup([row(TEACHER, 'primary')]);

    const body = await conflictBody(handler.execute(assign('substitute')));

    expect(body).toMatchObject({ error: 'already-in-group', existingRole: 'primary' });
    expect(teacherRepo.save).not.toHaveBeenCalled();
  });

  it('refuses even with override — override replaces a colleague, it does not add a second role', async () => {
    const { handler, teacherRepo } = setup([row(OTHER, 'primary'), row(TEACHER, 'co_primary')]);

    const body = await conflictBody(handler.execute(assign('primary', TEACHER, true)));

    expect(body).toMatchObject({ error: 'already-in-group', existingRole: 'co_primary' });
    expect(teacherRepo.remove).not.toHaveBeenCalled();
    expect(teacherRepo.save).not.toHaveBeenCalled();
  });

  it('counts a substitution that ends today', async () => {
    const { handler } = setup([row(TEACHER, 'substitute', day(0))]);

    const body = await conflictBody(handler.execute(assign('co_primary')));

    expect(body).toMatchObject({ error: 'already-in-group' });
  });

  it('lets in someone whose substitution in the group ended before today', async () => {
    const { handler, teacherRepo } = setup([row(OTHER, 'primary'), row(TEACHER, 'substitute', day(-1))]);

    await expect(handler.execute(assign('co_primary'))).resolves.toEqual({ ok: true, warnings: [] });
    expect(teacherRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEACHER, role: 'co_primary' }),
    );
  });

  it('the same role again still saves (dates are updated by the upsert)', async () => {
    const { handler, teacherRepo } = setup([row(TEACHER, 'substitute')]);

    await expect(handler.execute(assign('substitute'))).resolves.toEqual({ ok: true, warnings: [] });
    expect(teacherRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEACHER, role: 'substitute' }),
    );
  });

  it('another teacher of the group does not block anyone', async () => {
    const { handler, teacherRepo } = setup([row(OTHER, 'primary')]);

    await expect(handler.execute(assign('co_primary'))).resolves.toEqual({ ok: true, warnings: [] });
    expect(teacherRepo.save).toHaveBeenCalledTimes(1);
  });
});
