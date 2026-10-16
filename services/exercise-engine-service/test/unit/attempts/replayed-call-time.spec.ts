import { jest } from '@jest/globals';
import { SaveDraftHandler } from '../../../src/modules/attempts/application/commands/save-draft/save-draft.handler.js';
import { SaveDraftCommand } from '../../../src/modules/attempts/application/commands/save-draft/save-draft.command.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';
import type { IClock } from '../../../src/shared/application/ports/clock.port.js';

// VoxOrd offline plan, B4: an attempt worked on a phone with no network is replayed later,
// and each call is recorded at the time the phone made it. These pin what the attempt keeps
// of that time and what the `exercise.attempt.completed` it publishes says about it.

const serverNow = new Date('2026-10-16T12:00:00.000Z');
const clock: IClock = { now: () => serverNow };
const hoursAgo = (n: number) => new Date(serverNow.getTime() - n * 60 * 60 * 1000);

function attempt(props: { startedAt?: Date; recordedOffline?: boolean; templateCode?: string } = {}) {
  return Attempt.create({
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: props.templateCode ?? 'fill_in_blank',
    targetLanguage: 'nb',
    difficultyLevel: 'A2',
    checkMode: 'PRACTICE',
    practicedAtoms: [],
    axes: { skills: [], focus: [] },
    startedAt: props.startedAt,
    recordedOffline: props.recordedOffline,
  });
}

function completedPayload(a: Attempt): Record<string, unknown> {
  const event = a.getDomainEvents().find((e) => e.eventType === 'exercise.attempt.completed');
  return event!.payload as Record<string, unknown>;
}

describe('an attempt replayed from the offline journal', () => {
  it('starts when the phone started it, and says it was worked offline', () => {
    const a = attempt({ startedAt: hoursAgo(30), recordedOffline: true });
    expect(a.startedAt).toEqual(hoursAgo(30));
    expect(a.recordedOffline).toBe(true);
  });

  it('an online start is now and not offline', () => {
    const before = Date.now();
    const a = attempt();
    expect(a.startedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(a.recordedOffline).toBe(false);
  });

  it('is scored when the phone checked it, and the event carries that time and the flag', () => {
    const a = attempt({ startedAt: hoursAgo(30), recordedOffline: true });
    a.submit({ answer: 'er' }, 'hash', hoursAgo(29));
    a.score(100, true, null, null, undefined, undefined, undefined, hoursAgo(29));

    expect(a.submittedAt).toEqual(hoursAgo(29));
    expect(a.scoredAt).toEqual(hoursAgo(29));
    expect(completedPayload(a)).toMatchObject({
      attemptedAt: hoursAgo(29).toISOString(),
      recordedOffline: true,
    });
  });

  it('an online attempt carries its scoring time and no flag', () => {
    const a = attempt();
    a.submit({ answer: 'er' }, 'hash');
    a.score(100, true, null, null);

    const payload = completedPayload(a);
    expect(payload.attemptedAt).toBe(a.scoredAt!.toISOString());
    expect(payload).not.toHaveProperty('recordedOffline');
  });

  it('work handed to a teacher is dated by its submission', () => {
    const a = attempt({ templateCode: 'writing_task', startedAt: hoursAgo(5), recordedOffline: true });
    a.submit({ text: 'Hei' }, 'hash', hoursAgo(4));
    a.routeForReview();

    expect(completedPayload(a)).toMatchObject({
      attemptedAt: hoursAgo(4).toISOString(),
      recordedOffline: true,
    });
  });

  it('its latest moment is the latest of everything recorded on it', () => {
    const a = attempt({ templateCode: 'short_answer', startedAt: hoursAgo(10) });
    a.answerQuestion({ questionId: 'q1', text: 'ja', verdict: 'pass', at: hoursAgo(9) });
    a.answerQuestion({ questionId: 'q2', text: 'nei', verdict: 'fail', at: hoursAgo(8) });
    expect(a.lastActivityAt).toEqual(hoursAgo(8));
  });
});

describe('SaveDraftHandler, replayed', () => {
  function makeHandler(a: Attempt) {
    const attempts = {
      findById: jest.fn(() => Promise.resolve(a)),
      save: jest.fn(() => Promise.resolve()),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new SaveDraftHandler(attempts as any, clock);
  }

  it('keeps the draft at the time the phone saved it, corrected for its clock', async () => {
    const a = attempt({ templateCode: 'writing_task', startedAt: hoursAgo(6) });
    // The phone runs an hour ahead: it saved five hours ago, by its clock four.
    const claim = { at: hoursAgo(4), sentAt: new Date(serverNow.getTime() + 60 * 60 * 1000) };

    await makeHandler(a).execute(new SaveDraftCommand(a.id, 'user-1', { text: 'Hei' }, claim));

    expect(a.draftSavedAt).toEqual(hoursAgo(5));
    expect(a.recordedOffline).toBe(true);
  });

  it('never dates a call before what the attempt already holds', async () => {
    const a = attempt({ templateCode: 'writing_task', startedAt: hoursAgo(2) });
    const claim = { at: hoursAgo(3), sentAt: serverNow };

    await makeHandler(a).execute(new SaveDraftCommand(a.id, 'user-1', { text: 'Hei' }, claim));

    expect(a.draftSavedAt).toEqual(hoursAgo(2));
  });

  it('an online save is the server time and leaves the attempt online', async () => {
    const a = attempt({ templateCode: 'writing_task' });

    await makeHandler(a).execute(new SaveDraftCommand(a.id, 'user-1', { text: 'Hei' }));

    expect(a.draftSavedAt).toEqual(serverNow);
    expect(a.recordedOffline).toBe(false);
  });
});
