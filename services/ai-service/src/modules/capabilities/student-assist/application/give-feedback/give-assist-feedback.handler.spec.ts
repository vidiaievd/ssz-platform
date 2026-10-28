import type { AnsweredCall, AssistFeedbackToSave, IAssistFeedbackRepository } from '../ports/assist-feedback.repository.js';
import { GiveAssistFeedbackCommand } from './give-assist-feedback.command.js';
import { GiveAssistFeedbackHandler } from './give-assist-feedback.handler.js';

const LEARNER = 'c8655ecd-0000-4000-8000-000000000001';
const CALL: AnsweredCall = {
  callId: 'a1000000-0000-4000-8000-000000000001',
  capability: 'student_assist',
  actorUserId: LEARNER,
  outcome: 'ok',
  modelId: 'model-1',
  promptVersion: 'student_assist@1',
  createdAt: new Date('2026-10-28T09:00:00Z'),
};

function setup(call: AnsweredCall | null, result: 'saved' | 'duplicate' = 'saved') {
  const saved: AssistFeedbackToSave[] = [];
  const repo: IAssistFeedbackRepository = {
    findCall: async (id) => (call && call.callId === id ? call : null),
    save: async (feedback) => {
      saved.push(feedback);
      return result;
    },
  };
  return { handler: new GiveAssistFeedbackHandler(repo), saved };
}

const mark = (over: Partial<GiveAssistFeedbackCommand> = {}) =>
  Object.assign(new GiveAssistFeedbackCommand(LEARNER, CALL.callId, false, 'Feil ord'), over);

describe('GiveAssistFeedbackHandler', () => {
  it('keeps the mark on the answering call, with the call as the ledger holds it', async () => {
    const { handler, saved } = setup(CALL);
    expect(await handler.execute(mark())).toEqual({ kind: 'recorded' });
    expect(saved).toEqual([{ call: CALL, userId: LEARNER, helpful: false, reason: 'Feil ord', at: expect.any(Date) }]);
  });

  it('keeps a blank reason as none', async () => {
    const { handler, saved } = setup(CALL);
    await handler.execute(mark({ helpful: true, reason: '   ' }));
    expect(saved[0]).toMatchObject({ helpful: true, reason: null });
  });

  it('trims the reason', async () => {
    const { handler, saved } = setup(CALL);
    await handler.execute(mark({ reason: '  Feil ord \n' }));
    expect(saved[0].reason).toBe('Feil ord');
  });

  it.each([
    ['an unknown call', null],
    ['another learner’s answer', { ...CALL, actorUserId: 'someone-else' }],
    ['another agent’s call', { ...CALL, capability: 'review_direct' }],
    ['a call that did not answer', { ...CALL, outcome: 'invalid_response' }],
    ['a refused call', { ...CALL, outcome: 'refused_quota', modelId: null }],
  ])('answers not_found for %s and keeps nothing', async (_label, call) => {
    const { handler, saved } = setup(call as AnsweredCall | null);
    expect(await handler.execute(mark())).toEqual({ kind: 'not_found' });
    expect(saved).toEqual([]);
  });

  it('answers already_given for a second mark', async () => {
    const { handler } = setup(CALL, 'duplicate');
    expect(await handler.execute(mark())).toEqual({ kind: 'already_given' });
  });
});
