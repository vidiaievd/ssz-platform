import { UnprocessableEntityException } from '@nestjs/common';
import { ReplaceSlotsHandler } from './replace-slots.handler.js';
import { ReplaceSlotsCommand } from './replace-slots.command.js';
import type { ISlotRepository } from '../../../domain/repositories/slot.repository.interface.js';
import type { LessonGeneratorService } from '../../services/lesson-generator.service.js';
import type { OrgServiceHttpClient } from '../../../../../infrastructure/org/org-service.http-client.js';

function setup() {
  const slots = {
    deleteByGroup: jest.fn(),
    createMany: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<ISlotRepository>;
  const lessonGenerator = { regenerateTail: jest.fn() } as unknown as jest.Mocked<LessonGeneratorService>;
  const orgClient = {
    assertSchoolActive: jest.fn(),
    getGroup: jest.fn().mockResolvedValue({ id: 'group-1', startDate: null }),
    getGroupTeachers: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<OrgServiceHttpClient>;
  const handler = new ReplaceSlotsHandler(slots, lessonGenerator, orgClient);
  return { handler, slots, orgClient };
}

describe('ReplaceSlotsHandler — lesson length', () => {
  it('refuses the whole set before dropping the old pattern when one slot is too long', async () => {
    const { handler, slots, orgClient } = setup();
    const cmd = new ReplaceSlotsCommand('group-1', 'school-1', [
      { weekday: 'mon', startTime: '18:00', endTime: '19:30' },
      { weekday: 'fri', startTime: '00:00', endTime: '13:45' },
    ]);

    const error = await handler.execute(cmd).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect((error as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'LESSON_TOO_LONG' });
    expect(orgClient.assertSchoolActive).not.toHaveBeenCalled();
    expect(slots.deleteByGroup).not.toHaveBeenCalled();
    expect(slots.createMany).not.toHaveBeenCalled();
  });

  it('refuses a slot that ends before it starts', async () => {
    const { handler, slots } = setup();
    const cmd = new ReplaceSlotsCommand('group-1', 'school-1', [
      { weekday: 'mon', startTime: '19:00', endTime: '18:00' },
    ]);

    await expect(handler.execute(cmd)).rejects.toMatchObject({
      response: { code: 'END_TIME_NOT_AFTER_START' },
    });
    expect(slots.deleteByGroup).not.toHaveBeenCalled();
  });

  it('replaces a set of ordinary slots', async () => {
    const { handler, slots } = setup();
    const cmd = new ReplaceSlotsCommand('group-1', 'school-1', [
      { weekday: 'mon', startTime: '18:00', endTime: '19:30' },
    ]);

    await handler.execute(cmd);

    expect(slots.deleteByGroup).toHaveBeenCalledWith('group-1');
    expect(slots.createMany).toHaveBeenCalledTimes(1);
  });
});
