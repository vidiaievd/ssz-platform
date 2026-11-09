import { emptyProsodyLayer } from '@ssz/shared-kernel/prosody';
import type { ProsodyLayer } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../../../shared/kernel/result.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { ProsodyOwner } from '../../../domain/prosody-owner.js';
import type { ILexiconStressSource } from '../../ports/lexicon-stress.source.js';
import { SetProsodyCommand } from './set-prosody.command.js';
import { SetProsodyHandler } from './set-prosody.handler.js';

const TEXT = 'Jeg heter Anna. Jeg snakker litt norsk.';
const lesson: ProsodyOwner = { kind: 'lesson', lessonId: 'l1', variantId: 'v1' };
const prompt: ProsodyOwner = { kind: 'exercise', exerciseId: 'e1', promptId: 'p1' };

const SAVED_AT = new Date('2026-11-03T10:00:00Z');

function setup(passageText = TEXT, storedAt: Date | null = null) {
  const readAloudPassages = jest
    .fn()
    .mockResolvedValue(
      Result.ok({ language: 'nb', mode: 'read', prompts: [{ id: 'p1', text: passageText }] }),
    );
  const save = jest
    .fn()
    .mockImplementation((_owner: ProsodyOwner, value: object) =>
      Promise.resolve({ ...value, updatedAt: new Date('2026-11-03T10:00:00Z') }),
    );
  const remove = jest.fn().mockResolvedValue(undefined);
  const texts: IProsodyTextReader = {
    lessonBody: jest.fn().mockResolvedValue(Result.ok({ text: TEXT, language: 'nb' })),
    readAloudPassages,
  };
  const layers: IProsodyLayerRepository = {
    find: jest
      .fn()
      .mockResolvedValue(
        storedAt ? { sourceText: TEXT, layer: emptyProsodyLayer(), updatedAt: storedAt } : null,
      ),
    findForExercise: jest.fn(),
    save,
    remove,
  };
  const lexicon: ILexiconStressSource = {
    wordsOf: jest
      .fn()
      .mockResolvedValue({ stresses: [], sounds: [], unresolved: [{ i: 2, w: 'Anna' }] }),
  };
  return {
    readAloudPassages,
    save,
    remove,
    handler: new SetProsodyHandler(texts, layers, lexicon),
  };
}

describe('SetProsodyHandler', () => {
  it('stores the parsed layer against the current text', async () => {
    const { save, handler } = setup();
    const result = await handler.execute(
      new SetProsodyCommand('u1', lesson, {
        notation: "Jeg '1heter ^'1Anna. \\ | Jeg '2snakker litt 'norsk.",
      }),
    );

    expect(result.isOk).toBe(true);
    const [, saved, userId] = save.mock.calls[0] as [
      ProsodyOwner,
      { sourceText: string; layer: ProsodyLayer },
      string,
    ];
    expect(userId).toBe('u1');
    expect(saved.sourceText).toBe(TEXT);
    expect(saved.layer.stresses.map((s) => s.w)).toEqual(['heter', 'Anna', 'snakker', 'norsk']);
    expect(saved.layer.boundaries).toHaveLength(1);
    expect(result.value.notation).toContain("'2snakker");
    expect(result.value.updatedAt).toEqual(new Date('2026-11-03T10:00:00Z'));
    // Step 6h.2: the editor gets the lexicon's words back with the saved layer.
    expect(result.value.lexicon.unresolved).toEqual([{ i: 2, w: 'Anna' }]);
  });

  it('refuses a notation written for another text', async () => {
    const { save, handler } = setup();
    const result = await handler.execute(
      new SetProsodyCommand('u1', lesson, { notation: "Jeg '1heter Ola." }),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toMatchObject({
      code: 'NOTATION_INVALID',
      issues: [expect.objectContaining({ code: 'PN_TEXT_MISMATCH' })],
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('removes the row when the notation carries no marks', async () => {
    const { save, remove, handler } = setup();
    const result = await handler.execute(new SetProsodyCommand('u1', lesson, { notation: TEXT }));

    expect(result.isOk).toBe(true);
    expect(remove).toHaveBeenCalledWith(lesson);
    expect(save).not.toHaveBeenCalled();
    expect(result.value.layer).toEqual(emptyProsodyLayer());
    expect(result.value.updatedAt).toBeNull();
  });

  it('marks the draft passage of a read_aloud prompt', async () => {
    const { readAloudPassages, save, handler } = setup();
    await handler.execute(
      new SetProsodyCommand('u1', prompt, {
        notation: "Jeg '1heter Anna. Jeg snakker litt norsk.",
      }),
    );

    expect(readAloudPassages).toHaveBeenCalledWith('e1', 'draft');
    expect(save).toHaveBeenCalledWith(prompt, expect.anything(), 'u1');
  });

  it('refuses a prompt without a passage', async () => {
    const { handler } = setup('  ');
    const result = await handler.execute(new SetProsodyCommand('u1', prompt, { notation: '  ' }));
    expect(result.error).toEqual({ code: 'PROMPT_HAS_NO_TEXT' });
  });

  it('refuses an unknown prompt', async () => {
    const { handler } = setup();
    const result = await handler.execute(
      new SetProsodyCommand('u1', { ...prompt, promptId: 'p9' } as ProsodyOwner, {
        notation: TEXT,
      }),
    );
    expect(result.error).toEqual({ code: 'PROMPT_NOT_FOUND' });
  });

  // Step 6h.2b: the editor's form — the layer itself, sources kept, written optimistically.
  describe('a layer from the editor', () => {
    const LAYER = {
      tokenizer: 'unicode-word-v1',
      stresses: [
        { i: 1, w: 'heter', toneme: 1, vowel: { s: 1, e: 2, long: true }, source: 'teacher' },
      ],
      unstressed: [{ i: 2, w: 'Anna', source: 'teacher' }],
      accents: [],
      boundaries: [{ i: 2, w: 'Anna', pitch: 'fall', pause: 'short', source: 'ai', extra: 1 }],
      links: [],
      orphans: [],
    };

    it('stores it with its sources and «no stress», unknown fields dropped', async () => {
      const { save, handler } = setup();
      const result = await handler.execute(new SetProsodyCommand('u1', prompt, { layer: LAYER }));

      expect(result.isOk).toBe(true);
      const saved = (save.mock.calls[0] as [ProsodyOwner, { layer: ProsodyLayer }])[1].layer;
      expect(saved.unstressed).toEqual([{ i: 2, w: 'Anna', source: 'teacher' }]);
      expect(saved.boundaries).toEqual([
        { i: 2, w: 'Anna', pitch: 'fall', pause: 'short', source: 'ai' },
      ]);
      expect(result.value.notation).toContain("'0Anna");
    });

    it('refuses a lexicon stress and a malformed mark, naming the fields', async () => {
      const { save, handler } = setup();
      const layer = {
        ...LAYER,
        stresses: [{ ...LAYER.stresses[0], source: 'lexicon' }],
        boundaries: [{ i: 2, w: 'Anna', pitch: 'up', pause: null, source: 'ai' }],
      };
      const result = await handler.execute(new SetProsodyCommand('u1', prompt, { layer }));

      expect(result.error).toEqual({
        code: 'LAYER_MALFORMED',
        errors: [
          'layer.stresses[0].source: not teacher or ai',
          'layer.boundaries[0].pitch: not rise, fall, level or null',
        ],
      });
      expect(save).not.toHaveBeenCalled();
    });

    it('refuses a layer whose anchors name other words', async () => {
      const { handler } = setup();
      const layer = { ...LAYER, unstressed: [{ i: 2, w: 'Ola', source: 'teacher' }] };
      const result = await handler.execute(new SetProsodyCommand('u1', prompt, { layer }));
      expect(result.error).toMatchObject({ code: 'LAYER_INVALID' });
    });

    it('writes when the editor read the stored version, and when it read none and none is stored', async () => {
      const stored = setup(TEXT, SAVED_AT);
      const ok = await stored.handler.execute(
        new SetProsodyCommand('u1', prompt, { layer: LAYER }, '2026-11-03T10:00:00.000+00:00'),
      );
      expect(ok.isOk).toBe(true);
      const fresh = setup();
      expect(
        (await fresh.handler.execute(new SetProsodyCommand('u1', prompt, { layer: LAYER }, null)))
          .isOk,
      ).toBe(true);
    });

    it('refuses with the current time when another save came first', async () => {
      const { save, handler } = setup(TEXT, SAVED_AT);
      const stale = await handler.execute(
        new SetProsodyCommand('u1', prompt, { layer: LAYER }, '2026-11-03T09:00:00Z'),
      );
      expect(stale.error).toEqual({ code: 'LAYER_MODIFIED_ELSEWHERE', currentUpdatedAt: SAVED_AT });
      const unseen = await handler.execute(
        new SetProsodyCommand('u1', prompt, { layer: LAYER }, null),
      );
      expect(unseen.error).toEqual({
        code: 'LAYER_MODIFIED_ELSEWHERE',
        currentUpdatedAt: SAVED_AT,
      });
      expect(save).not.toHaveBeenCalled();
    });

    it('reports a removed layer as null', async () => {
      const { handler } = setup();
      const result = await handler.execute(
        new SetProsodyCommand('u1', prompt, { layer: LAYER }, '2026-11-03T10:00:00Z'),
      );
      expect(result.error).toEqual({ code: 'LAYER_MODIFIED_ELSEWHERE', currentUpdatedAt: null });
    });
  });
});
