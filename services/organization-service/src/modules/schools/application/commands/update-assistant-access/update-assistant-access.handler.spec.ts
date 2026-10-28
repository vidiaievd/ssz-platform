import { jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { UpdateAssistantAccessHandler } from './update-assistant-access.handler.js';
import { UpdateAssistantAccessCommand } from './update-assistant-access.command.js';
import { GetAssistantAccessHandler } from '../../queries/get-assistant-access/get-assistant-access.handler.js';
import { GetAssistantAccessQuery } from '../../queries/get-assistant-access/get-assistant-access.query.js';
import { School } from '../../../domain/entities/school.entity.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolType } from '../../../domain/value-objects/school-type.vo.js';
import {
  AssistantAccess,
  type AssistantMode,
} from '../../../domain/value-objects/assistant-access.vo.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { FeatureNotEntitledException } from '../../../domain/exceptions/feature-not-entitled.exception.js';
import { InvalidAssistantAccessException } from '../../../domain/exceptions/invalid-assistant-access.exception.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';

const SCHOOL_ID = 'school-1';
const OWNER = 'owner-1';
const ADMIN = 'admin-1';
const TEACHER = 'teacher-1';

function school(): School {
  return School.rehydrate({
    id: SCHOOL_ID,
    name: 'Nordick',
    slug: 'nordick',
    ownerId: OWNER,
    type: SchoolType.ONLINE,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    requireTutorReviewForSelfPaced: false,
    members: [
      SchoolMember.rehydrate({
        id: 'm-1',
        schoolId: SCHOOL_ID,
        userId: ADMIN,
        role: MemberRole.ADMIN,
        joinedAt: new Date('2026-01-01T00:00:00Z'),
      }),
      SchoolMember.rehydrate({
        id: 'm-2',
        schoolId: SCHOOL_ID,
        userId: TEACHER,
        role: MemberRole.TEACHER,
        joinedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ],
  });
}

/** The school's live groups and students; anything else is a stranger to it. */
const LIVE = { groupIds: ['g-1', 'g-2'], studentIds: ['s-1', 's-2'] };

function makeRepo(row: School | null, saved: AssistantAccess | null = AssistantAccess.default()) {
  return {
    findById: jest.fn(() => Promise.resolve(row)),
    findAssistantAccess: jest.fn(() => Promise.resolve(saved)),
    saveAssistantAccess: jest.fn(() => Promise.resolve()),
    findAssistantSelectable: jest.fn((_s: string, groupIds: readonly string[], studentIds: readonly string[]) =>
      Promise.resolve({
        groupIds: groupIds.filter((id) => LIVE.groupIds.includes(id)),
        studentIds: studentIds.filter((id) => LIVE.studentIds.includes(id)),
      }),
    ),
  };
}

function makeHandler(row: School | null, entitled: boolean | Error = true) {
  const schools = makeRepo(row);
  const entitlements = {
    isEnabled: jest.fn(() =>
      entitled instanceof Error ? Promise.reject(entitled) : Promise.resolve(entitled),
    ),
  };
  return {
    handler: new UpdateAssistantAccessHandler(schools as never, entitlements as never),
    schools,
    entitlements,
  };
}

const command = (
  actorId: string,
  mode: AssistantMode = 'selected_groups',
  groupIds: string[] = ['g-1'],
  studentIds: string[] = [],
) => new UpdateAssistantAccessCommand(SCHOOL_ID, actorId, mode, groupIds, studentIds);

describe('UpdateAssistantAccessHandler', () => {
  it('saves a choice of groups for a school whose plan has the key', async () => {
    const { handler, schools, entitlements } = makeHandler(school());

    await expect(handler.execute(command(OWNER))).resolves.toEqual({
      mode: 'selected_groups',
      groupIds: ['g-1'],
      studentIds: [],
    });
    expect(entitlements.isEnabled).toHaveBeenCalledWith(SCHOOL_ID, 'ai.student_assist');
    expect(schools.saveAssistantAccess).toHaveBeenCalledWith(
      SCHOOL_ID,
      expect.objectContaining({ mode: 'selected_groups', groupIds: ['g-1'] }),
    );
  });

  it('keeps both lists whatever the mode, duplicates dropped', async () => {
    const { handler } = makeHandler(school());

    await expect(
      handler.execute(command(ADMIN, 'selected_students', ['g-2', 'g-2'], ['s-1', 's-2', 's-1'])),
    ).resolves.toEqual({ mode: 'selected_students', groupIds: ['g-2'], studentIds: ['s-1', 's-2'] });
  });

  it('refuses a teacher', async () => {
    const { handler, schools } = makeHandler(school());

    await expect(handler.execute(command(TEACHER))).rejects.toBeInstanceOf(ForbiddenOperationException);
    expect(schools.saveAssistantAccess).not.toHaveBeenCalled();
  });

  it('refuses a group or a student that is not the school’s, in any mode', async () => {
    const { handler, schools, entitlements } = makeHandler(school());

    await expect(handler.execute(command(OWNER, 'selected_groups', ['g-other']))).rejects.toBeInstanceOf(
      InvalidAssistantAccessException,
    );
    await expect(handler.execute(command(OWNER, 'all_students', [], ['s-archived']))).rejects.toBeInstanceOf(
      InvalidAssistantAccessException,
    );
    expect(entitlements.isEnabled).not.toHaveBeenCalled();
    expect(schools.saveAssistantAccess).not.toHaveBeenCalled();
  });

  it('refuses an unknown mode', async () => {
    const { handler } = makeHandler(school());

    await expect(handler.execute(command(OWNER, 'some' as AssistantMode))).rejects.toBeInstanceOf(
      InvalidAssistantAccessException,
    );
  });

  /** The server refuses, whatever the web shows. */
  it('refuses a mode that pays for anyone when the plan lacks the key', async () => {
    const { handler, schools } = makeHandler(school(), false);

    await expect(handler.execute(command(OWNER, 'all_students', [], []))).rejects.toBeInstanceOf(
      FeatureNotEntitledException,
    );
    expect(schools.saveAssistantAccess).not.toHaveBeenCalled();
  });

  it('always lets a school turn it off, without asking the plan', async () => {
    const { handler, schools, entitlements } = makeHandler(school(), false);

    await expect(handler.execute(command(OWNER, 'off', ['g-1'], ['s-1']))).resolves.toMatchObject({ mode: 'off' });
    expect(entitlements.isEnabled).not.toHaveBeenCalled();
    expect(schools.saveAssistantAccess).toHaveBeenCalled();
  });

  it('saves nothing when the plan cannot be confirmed', async () => {
    const { handler, schools } = makeHandler(school(), new ServiceUnavailableException());

    await expect(handler.execute(command(OWNER))).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(schools.saveAssistantAccess).not.toHaveBeenCalled();
  });

  it('reports a missing school as missing', async () => {
    const { handler } = makeHandler(null);

    await expect(handler.execute(command(OWNER))).rejects.toBeInstanceOf(SchoolNotFoundException);
  });
});

describe('GetAssistantAccessHandler', () => {
  it('answers all_students for a school that never chose (the default)', async () => {
    const handler = new GetAssistantAccessHandler(makeRepo(school()) as never);

    await expect(handler.execute(new GetAssistantAccessQuery(SCHOOL_ID, OWNER))).resolves.toEqual({
      mode: 'all_students',
      groupIds: [],
      studentIds: [],
    });
  });

  it('leaves out a group deleted and a student archived since the save', async () => {
    const saved = AssistantAccess.rehydrate({
      mode: 'selected_students',
      groupIds: ['g-1', 'g-deleted'],
      studentIds: ['s-archived', 's-2'],
    });
    const handler = new GetAssistantAccessHandler(makeRepo(school(), saved) as never);

    await expect(handler.execute(new GetAssistantAccessQuery(SCHOOL_ID, ADMIN))).resolves.toEqual({
      mode: 'selected_students',
      groupIds: ['g-1'],
      studentIds: ['s-2'],
    });
  });

  it('is the owner’s and administrators’ only: the list names students', async () => {
    const handler = new GetAssistantAccessHandler(makeRepo(school()) as never);

    await expect(handler.execute(new GetAssistantAccessQuery(SCHOOL_ID, TEACHER))).rejects.toBeInstanceOf(
      ForbiddenOperationException,
    );
  });
});
