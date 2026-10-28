import { NotFoundException } from '@nestjs/common';
import { Lesson } from '../../domain/entities/lesson.entity.js';
import { InternalSessionsController, toAssistSession } from './internal-sessions.controller.js';

// Plan 83, step 2: a session as the student assistant reads it.

const lesson = new Lesson(
  'l-1',
  'g-1',
  's-1',
  null,
  new Date('2026-10-29T00:00:00Z'),
  '18:00',
  '19:30',
  't-1',
  'Rom 4',
  'scheduled' as never,
  'lesson' as never,
  'cu-1',
  'unit-1',
  null,
  null,
  'Lærer er syk',
  false,
  3,
  null,
  [{ studentId: 'st-1', score: 80 }] as never,
);

describe('toAssistSession', () => {
  it('carries when, what kind and which unit — not the note, the room or the scores', () => {
    const session = toAssistSession(lesson);
    expect(session).toEqual({
      id: 'l-1',
      groupId: 'g-1',
      schoolId: 's-1',
      date: '2026-10-29',
      startTime: '18:00',
      endTime: '19:30',
      status: 'scheduled',
      type: 'lesson',
      contentUnitId: 'unit-1',
      contentLessonId: null,
    });
    expect(JSON.stringify(session)).not.toMatch(/syk|Rom 4|st-1/);
  });
});

describe('InternalSessionsController.forAssistant', () => {
  it('is 404 for an unknown session', async () => {
    const repo = { findById: jest.fn().mockResolvedValue(null) };
    await expect(new InternalSessionsController(repo as never).forAssistant('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
