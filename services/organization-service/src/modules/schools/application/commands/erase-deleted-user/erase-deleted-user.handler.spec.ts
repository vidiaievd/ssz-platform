import { jest } from '@jest/globals';
import { EraseDeletedUserHandler } from './erase-deleted-user.handler.js';
import { EraseDeletedUserCommand } from './erase-deleted-user.command.js';
import type { IDeletedUserEraser } from '../../ports/deleted-user-eraser.interface.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.interface.js';
import type { IDomainEvent } from '../../../../../shared/domain/domain-event.interface.js';

const erased = {
  schoolMembers: 1,
  groupSeats: 2,
  memberships: 1,
  levelHistory: 3,
  nudges: 0,
  tutoringSeats: 0,
  invitations: 1,
  assistantLists: 1,
};

function setup() {
  const order: string[] = [];
  const published: IDomainEvent[] = [];
  const eraser: IDeletedUserEraser = {
    footprint: jest.fn(async () => ({
      activeStudentSchoolIds: ['s1'],
      activeGroupSeats: [{ schoolId: 's1', groupId: 'g1', courseId: 'c1' }],
      tutoringGroupIds: ['t1'],
    })),
    erase: jest.fn(async () => {
      order.push('erase');
      return erased;
    }),
  };
  const publisher: IEventPublisher = {
    publish: jest.fn(async (event: IDomainEvent) => {
      order.push(event.eventType);
      published.push(event);
    }),
  };
  return { eraser, order, published, handler: new EraseDeletedUserHandler(eraser, publisher) };
}

describe('EraseDeletedUserHandler', () => {
  it('announces each removal the normal way, then erases', async () => {
    const { eraser, order, published, handler } = setup();

    expect(await handler.execute(new EraseDeletedUserCommand('u1', 'gone@example.com'))).toEqual(erased);

    expect(order).toEqual([
      'school.group.member.removed',
      'school.student.removed',
      'tutoring.student.removed',
      'erase',
    ]);
    expect(published[0]).toMatchObject({ schoolId: 's1', groupId: 'g1', userId: 'u1', courseId: 'c1' });
    expect(published[1]).toMatchObject({ schoolId: 's1', userId: 'u1' });
    expect(published[2]).toMatchObject({ tutorGroupId: 't1', userId: 'u1' });
    expect(eraser.erase).toHaveBeenCalledWith('u1', 'gone@example.com');
  });

  it('leaves the rows when an announcement fails, so the redelivery finds them', async () => {
    const { eraser } = setup();
    const failing = new EraseDeletedUserHandler(eraser, {
      publish: jest.fn(async () => {
        throw new Error('outbox down');
      }),
    });

    await expect(failing.execute(new EraseDeletedUserCommand('u1', null))).rejects.toThrow('outbox down');
    expect(eraser.erase).not.toHaveBeenCalled();
  });
});
