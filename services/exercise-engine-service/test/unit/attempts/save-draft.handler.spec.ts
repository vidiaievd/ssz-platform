import { jest } from '@jest/globals';
import { SaveDraftHandler } from '../../../src/modules/attempts/application/commands/save-draft/save-draft.handler.js';
import { SaveDraftCommand } from '../../../src/modules/attempts/application/commands/save-draft/save-draft.command.js';
import { Attempt } from '../../../src/modules/attempts/domain/entities/attempt.entity.js';

// A lost 200-word text is the worst thing a writing task can do to a student
// (IMPLEMENTATION.md), so these tests are about one thing: the save going through.

function inProgressAttempt(): Attempt {
  return Attempt.create({
    userId: 'user-1',
    exerciseId: 'ex-1',
    templateCode: 'writing_task',
    targetLanguage: 'nb',
    difficultyLevel: 'B1',
    checkMode: 'GRADED',
    practicedAtoms: [],
    axes: { skills: [], focus: [] },
  });
}

function makeHandler(attempt: Attempt | null) {
  const attempts = {
    findById: jest.fn(() => Promise.resolve(attempt)),
    save: jest.fn(() => Promise.resolve()),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { handler: new SaveDraftHandler(attempts as any), attempts };
}

const draft = { text: 'Hei, jeg heter Anna og skriver til dere fordi', ticked: ['p1'], elapsedSeconds: 240 };

describe('SaveDraftHandler', () => {
  it('keeps the work and answers with when it took it', async () => {
    const attempt = inProgressAttempt();
    const { handler, attempts } = makeHandler(attempt);

    const result = await handler.execute(new SaveDraftCommand(attempt.id, 'user-1', draft));

    expect(result.isOk).toBe(true);
    expect(result.value.savedAt).toBeInstanceOf(Date);
    expect(attempt.draftAnswer).toEqual(draft);
    expect(attempts.save).toHaveBeenCalledTimes(1);
  });

  it('stores whatever arrives, including a half-written shape', async () => {
    // Validating the draft would mean refusing to save work in progress because it is
    // in progress. The runner reads back what it wrote.
    const attempt = inProgressAttempt();
    const { handler } = makeHandler(attempt);

    await handler.execute(new SaveDraftCommand(attempt.id, 'user-1', { text: '' }));

    expect(attempt.draftAnswer).toEqual({ text: '' });
  });

  it('overwrites the previous draft rather than keeping a history', async () => {
    const attempt = inProgressAttempt();
    const { handler } = makeHandler(attempt);

    await handler.execute(new SaveDraftCommand(attempt.id, 'user-1', { text: 'Hei' }));
    await handler.execute(new SaveDraftCommand(attempt.id, 'user-1', { text: 'Hei, jeg heter Anna' }));

    expect(attempt.draftAnswer).toEqual({ text: 'Hei, jeg heter Anna' });
  });

  it('refuses a draft for somebody else’s attempt', async () => {
    const attempt = inProgressAttempt();
    const { handler, attempts } = makeHandler(attempt);

    const result = await handler.execute(new SaveDraftCommand(attempt.id, 'someone-else', draft));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'FORBIDDEN' });
    expect(attempts.save).not.toHaveBeenCalled();
  });

  it('reports a missing attempt', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(new SaveDraftCommand('gone', 'user-1', draft));

    expect(result.isFail).toBe(true);
    expect(result.error).toEqual({ code: 'ATTEMPT_NOT_FOUND' });
  });

  it('refuses to write over an attempt that is no longer in progress', async () => {
    // A draft arriving after the answer is in would be a second answer nobody reads;
    // after a verdict it would look like an edit to marked work.
    const attempt = inProgressAttempt();
    attempt.submit({ text: 'Ferdig tekst.' }, 'hash');
    const { handler, attempts } = makeHandler(attempt);

    const result = await handler.execute(new SaveDraftCommand(attempt.id, 'user-1', draft));

    expect(result.isFail).toBe(true);
    expect(attempts.save).not.toHaveBeenCalled();
    expect(attempt.draftAnswer).toBeNull();
  });
});
