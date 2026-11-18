import { describe, expect, it } from '@jest/globals';
import { UnprocessableEntityException } from '@nestjs/common';
import {
  countActiveLearners,
  parseActiveLearnersBody,
  type ContentHold,
} from '../../../../src/modules/internal/active-learners.js';

const COURSE = '11111111-1111-4111-8111-111111111111';
const LESSON = '22222222-2222-4222-8222-222222222222';
const LEAF = '33333333-3333-4333-8333-333333333333';
const since = new Date('2026-08-12T00:00:00Z');
const old = new Date('2026-01-01T00:00:00Z');
const fresh = new Date('2026-11-01T00:00:00Z');

function hold(
  userId: string,
  at: Date,
  contentType: ContentHold['contentType'] = 'container',
  contentId = COURSE,
): ContentHold {
  return { userId, contentType, contentId, since: at };
}

describe('countActiveLearners', () => {
  const course = { contentType: 'container' as const, contentId: COURSE, leafIds: [LEAF] };

  it('counts a hold that started inside the window, with no progress yet', () => {
    expect(countActiveLearners([course], [hold('u1', fresh)], [], since)).toEqual([
      { contentType: 'container', contentId: COURSE, activeLearners: 1 },
    ]);
  });

  it('counts an old hold with progress on a leaf inside the window', () => {
    const [answer] = countActiveLearners(
      [course],
      [hold('u1', old)],
      [{ userId: 'u1', contentId: LEAF }],
      since,
    );
    expect(answer.activeLearners).toBe(1);
  });

  it('does not count an old hold whose learner has not touched the content', () => {
    const touches = [
      { userId: 'u1', contentId: LESSON },
      { userId: 'u2', contentId: LEAF },
    ];
    const [answer] = countActiveLearners([course], [hold('u1', old)], touches, since);
    expect(answer.activeLearners).toBe(0);
  });

  it('counts a learner once even with an enrolment and an assignment', () => {
    const [answer] = countActiveLearners(
      [course],
      [hold('u1', fresh), hold('u1', fresh), hold('u2', fresh)],
      [],
      since,
    );
    expect(answer.activeLearners).toBe(2);
  });

  it('keeps holds of one content type away from another with the same id', () => {
    const lesson = { contentType: 'lesson' as const, contentId: COURSE, leafIds: [] };
    expect(countActiveLearners([lesson], [hold('u1', fresh)], [], since)[0].activeLearners).toBe(0);
  });

  it('answers every item in request order, zero included', () => {
    const lesson = { contentType: 'lesson' as const, contentId: LESSON, leafIds: [] };
    const answers = countActiveLearners(
      [lesson, course],
      [hold('u1', old, 'lesson', LESSON)],
      [{ userId: 'u1', contentId: LESSON }],
      since,
    );
    expect(answers.map((a) => [a.contentId, a.activeLearners])).toEqual([
      [LESSON, 1],
      [COURSE, 0],
    ]);
  });
});

describe('parseActiveLearnersBody', () => {
  it('reads a well-formed body', () => {
    const parsed = parseActiveLearnersBody({
      activeSince: since.toISOString(),
      items: [
        { contentType: 'container', contentId: COURSE, leafIds: [LEAF] },
        { contentType: 'lesson', contentId: LESSON },
      ],
    });
    expect(parsed.activeSince).toEqual(since);
    expect(parsed.items).toEqual([
      { contentType: 'container', contentId: COURSE, leafIds: [LEAF] },
      { contentType: 'lesson', contentId: LESSON, leafIds: [] },
    ]);
  });

  it.each([
    [{ items: [] }],
    [{ activeSince: 'yesterday', items: [] }],
    [{ activeSince: since.toISOString() }],
    [{ activeSince: since.toISOString(), items: [{ contentType: 'course', contentId: COURSE }] }],
    [{ activeSince: since.toISOString(), items: [{ contentType: 'lesson', contentId: 'x' }] }],
    [
      {
        activeSince: since.toISOString(),
        items: [{ contentType: 'container', contentId: COURSE, leafIds: ['x'] }],
      },
    ],
  ])('refuses %j with 422', (body) => {
    expect(() => parseActiveLearnersBody(body)).toThrow(UnprocessableEntityException);
  });

  it('refuses more ids than one request may carry', () => {
    const leafIds = Array.from({ length: 2000 }, () => LEAF);
    expect(() =>
      parseActiveLearnersBody({
        activeSince: since.toISOString(),
        items: [{ contentType: 'container', contentId: COURSE, leafIds }],
      }),
    ).toThrow(/at most 2000 ids/);
  });
});
