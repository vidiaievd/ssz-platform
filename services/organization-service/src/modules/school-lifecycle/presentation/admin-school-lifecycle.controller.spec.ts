import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { AdminLevel } from '@ssz/contracts';
import { ADMIN_LEVEL_KEY } from '../../../common/decorators/require-admin-level.decorator.js';
import type { JwtPayload } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { ChangeSchoolStatusCommand } from '../application/commands/change-school-status.command.js';
import { SCHOOL_TRANSITION_RULES, SCHOOL_TRANSITIONS } from '../domain/school-lifecycle.js';
import { AdminSchoolLifecycleController } from './admin-school-lifecycle.controller.js';

const SCHOOL_ID = '11111111-1111-5111-8111-111111111111';
const user = { sub: 'admin-1', adminLevel: AdminLevel.SUPER, isPlatformAdmin: true } as JwtPayload;

const state = {
  schoolId: SCHOOL_ID,
  ownerId: 'owner-1',
  name: 'Nordick',
  kind: 'SCHOOL',
  status: 'suspended',
  statusChangedAt: new Date('2026-11-10'),
  closesAt: new Date('2026-12-10'),
  purgeAt: null,
  statusReason: 'unpaid',
  deletedAt: null,
};

function setup() {
  const commandBus = { execute: jest.fn<(c: unknown) => Promise<unknown>>().mockResolvedValue(state) };
  return { commandBus, controller: new AdminSchoolLifecycleController(commandBus as never) };
}

describe('AdminSchoolLifecycleController', () => {
  it.each(SCHOOL_TRANSITIONS)('guards %s with the level the transition table names', (transition) => {
    const handler = AdminSchoolLifecycleController.prototype[transition];
    expect(Reflect.getMetadata(ADMIN_LEVEL_KEY, handler)).toBe(SCHOOL_TRANSITION_RULES[transition].adminLevel);
  });

  it('sends the move as the admin from the token and answers the new state', async () => {
    const { commandBus, controller } = setup();

    const answer = await controller.suspend(SCHOOL_ID, { reason: 'unpaid' }, user);

    const command = commandBus.execute.mock.calls[0][0] as ChangeSchoolStatusCommand;
    expect(command).toBeInstanceOf(ChangeSchoolStatusCommand);
    expect(command).toMatchObject({
      schoolId: SCHOOL_ID,
      transition: 'suspend',
      actor: { kind: 'admin', userId: 'admin-1', level: 'super' },
      reason: 'unpaid',
    });
    expect(answer).toEqual({
      id: SCHOOL_ID,
      status: 'suspended',
      statusChangedAt: state.statusChangedAt,
      statusReason: 'unpaid',
      closesAt: state.closesAt,
      purgeAt: null,
    });
  });

  it('answers 404 for a non-UUID without asking anyone', async () => {
    const { commandBus, controller } = setup();

    await expect(controller.close('nordick', { reason: 'x' }, user)).rejects.toBeInstanceOf(NotFoundException);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
