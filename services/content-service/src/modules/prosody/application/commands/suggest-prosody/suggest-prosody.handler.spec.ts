import { parseProsodyNotation } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../../../shared/kernel/result.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { ProsodyOwner } from '../../../domain/prosody-owner.js';
import type {
  IPhraseMarksSuggester,
  PhraseMarksSuggestion,
} from '../../ports/phrase-marks.suggester.js';
import { SuggestProsodyCommand } from './suggest-prosody.command.js';
import { SuggestProsodyHandler } from './suggest-prosody.handler.js';

// Plan 86, step 5c.2: the agent's phrase marks over the stored layer, never written.

const TEXT = 'Jeg heter Anna. Er du fra Norge?';
const lesson: ProsodyOwner = { kind: 'lesson', lessonId: 'l1', variantId: 'v1' };
const prompt: ProsodyOwner = { kind: 'exercise', exerciseId: 'e1', promptId: 'p1' };

const SUGGESTED: PhraseMarksSuggestion = {
  status: 'ok',
  marks: {
    accents: [{ i: 2, w: 'Anna', source: 'ai' }],
    boundaries: [
      { i: 2, w: 'Anna', pitch: 'fall', pause: 'short', source: 'ai' },
      { i: 6, w: 'Norge', pitch: 'rise', pause: 'long', source: 'ai' },
    ],
    links: [{ i: 3, w: 'Er du', source: 'ai' }],
  },
};

function setup(suggestion: PhraseMarksSuggestion = SUGGESTED, storedNotation?: string) {
  const suggest = jest.fn().mockResolvedValue(suggestion);
  const save = jest.fn();
  const remove = jest.fn();
  const texts: IProsodyTextReader = {
    lessonBody: jest
      .fn()
      .mockResolvedValue(Result.ok({ text: TEXT, language: 'nb', ownerSchoolId: 's1' })),
    readAloudPassages: jest.fn().mockResolvedValue(
      Result.ok({
        language: 'nb',
        ownerSchoolId: null,
        mode: 'read',
        prompts: [{ id: 'p1', text: TEXT }],
      }),
    ),
  };
  const stored = storedNotation
    ? {
        sourceText: TEXT,
        layer: parseProsodyNotation(storedNotation).layer,
        updatedAt: new Date('2026-11-03T10:00:00Z'),
      }
    : null;
  const layers: IProsodyLayerRepository = {
    find: jest.fn().mockResolvedValue(stored),
    findForExercise: jest.fn(),
    save,
    remove,
  };
  const suggester: IPhraseMarksSuggester = { suggest };
  return { suggest, save, remove, handler: new SuggestProsodyHandler(texts, layers, suggester) };
}

describe('SuggestProsodyHandler', () => {
  it('asks for the whole lesson body with the owner school as payer and stores nothing', async () => {
    const { suggest, save, remove, handler } = setup();
    const result = await handler.execute(new SuggestProsodyCommand('u1', lesson));

    expect(suggest).toHaveBeenCalledWith({
      schoolId: 's1',
      userId: 'u1',
      language: 'nb',
      text: TEXT,
    });
    expect(result.isOk).toBe(true);
    expect(result.value.layer.boundaries.map((b) => [b.w, b.pitch, b.source])).toEqual([
      ['Anna', 'fall', 'ai'],
      ['Norge', 'rise', 'ai'],
    ]);
    expect(result.value.notation).toBe('Jeg heter ^Anna. \\ | Er _ du fra Norge? / ||');
    expect(result.value.updatedAt).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("keeps the teacher's stresses and replaces the stored phrase marks", async () => {
    const { handler } = setup(SUGGESTED, "Jeg '1heter ^Anna. Er du fra 'Norge? \\ ||");
    const result = await handler.execute(new SuggestProsodyCommand('u1', lesson));

    expect(result.value.layer.stresses.map((s) => [s.w, s.source])).toEqual([
      ['heter', 'teacher'],
      ['Norge', 'teacher'],
    ]);
    expect(result.value.layer.boundaries.map((b) => b.pitch)).toEqual(['fall', 'rise']);
    expect(result.value.layer.accents).toEqual([{ i: 2, w: 'Anna', source: 'ai' }]);
    expect(result.value.updatedAt).toEqual(new Date('2026-11-03T10:00:00Z'));
  });

  it('lets the author pay for a prompt of an exercise without a school', async () => {
    const { suggest, handler } = setup();
    await handler.execute(new SuggestProsodyCommand('u1', prompt));
    expect(suggest).toHaveBeenCalledWith(expect.objectContaining({ schoolId: null, userId: 'u1' }));
  });

  it("passes ai-service's refusal and failure on", async () => {
    const refused = setup({ status: 'refused', reason: 'pool_empty' });
    expect((await refused.handler.execute(new SuggestProsodyCommand('u1', lesson))).error).toEqual({
      code: 'SUGGESTION_REFUSED',
      reason: 'pool_empty',
    });

    const failed = setup({ status: 'failed', errorCode: 'unreachable' });
    expect((await failed.handler.execute(new SuggestProsodyCommand('u1', lesson))).error).toEqual({
      code: 'SUGGESTION_FAILED',
      errorCode: 'unreachable',
    });
  });

  it('does not call the agent for an unknown prompt', async () => {
    const { suggest, handler } = setup();
    const result = await handler.execute(
      new SuggestProsodyCommand('u1', { ...prompt, promptId: 'p9' } as ProsodyOwner),
    );
    expect(result.error).toEqual({ code: 'PROMPT_NOT_FOUND' });
    expect(suggest).not.toHaveBeenCalled();
  });
});
