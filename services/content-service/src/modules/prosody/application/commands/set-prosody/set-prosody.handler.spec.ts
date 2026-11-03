import { emptyProsodyLayer } from '@ssz/shared-kernel/prosody';
import type { ProsodyLayer } from '@ssz/shared-kernel/prosody';
import { Result } from '../../../../../shared/kernel/result.js';
import type { IProsodyLayerRepository } from '../../../domain/repositories/prosody-layer.repository.interface.js';
import type { IProsodyTextReader } from '../../../domain/repositories/prosody-text.reader.interface.js';
import type { ProsodyOwner } from '../../../domain/prosody-owner.js';
import { SetProsodyCommand } from './set-prosody.command.js';
import { SetProsodyHandler } from './set-prosody.handler.js';

const TEXT = 'Jeg heter Anna. Jeg snakker litt norsk.';
const lesson: ProsodyOwner = { kind: 'lesson', lessonId: 'l1', variantId: 'v1' };
const prompt: ProsodyOwner = { kind: 'exercise', exerciseId: 'e1', promptId: 'p1' };

function setup(passageText = TEXT) {
  const readAloudPassages = jest
    .fn()
    .mockResolvedValue(Result.ok({ mode: 'read', prompts: [{ id: 'p1', text: passageText }] }));
  const save = jest
    .fn()
    .mockImplementation((_owner: ProsodyOwner, value: object) =>
      Promise.resolve({ ...value, updatedAt: new Date('2026-11-03T10:00:00Z') }),
    );
  const remove = jest.fn().mockResolvedValue(undefined);
  const texts: IProsodyTextReader = {
    lessonBody: jest.fn().mockResolvedValue(Result.ok(TEXT)),
    readAloudPassages,
  };
  const layers: IProsodyLayerRepository = {
    find: jest.fn(),
    findForExercise: jest.fn(),
    save,
    remove,
  };
  return { readAloudPassages, save, remove, handler: new SetProsodyHandler(texts, layers) };
}

describe('SetProsodyHandler', () => {
  it('stores the parsed layer against the current text', async () => {
    const { save, handler } = setup();
    const result = await handler.execute(
      new SetProsodyCommand('u1', lesson, "Jeg '1heter ^'1Anna. \\ | Jeg '2snakker litt 'norsk."),
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
  });

  it('refuses a notation written for another text', async () => {
    const { save, handler } = setup();
    const result = await handler.execute(new SetProsodyCommand('u1', lesson, "Jeg '1heter Ola."));

    expect(result.isFail).toBe(true);
    expect(result.error).toMatchObject({
      code: 'NOTATION_INVALID',
      issues: [expect.objectContaining({ code: 'PN_TEXT_MISMATCH' })],
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('removes the row when the notation carries no marks', async () => {
    const { save, remove, handler } = setup();
    const result = await handler.execute(new SetProsodyCommand('u1', lesson, TEXT));

    expect(result.isOk).toBe(true);
    expect(remove).toHaveBeenCalledWith(lesson);
    expect(save).not.toHaveBeenCalled();
    expect(result.value.layer).toEqual(emptyProsodyLayer());
    expect(result.value.updatedAt).toBeNull();
  });

  it('marks the draft passage of a read_aloud prompt', async () => {
    const { readAloudPassages, save, handler } = setup();
    await handler.execute(
      new SetProsodyCommand('u1', prompt, "Jeg '1heter Anna. Jeg snakker litt norsk."),
    );

    expect(readAloudPassages).toHaveBeenCalledWith('e1', 'draft');
    expect(save).toHaveBeenCalledWith(prompt, expect.anything(), 'u1');
  });

  it('refuses a prompt without a passage', async () => {
    const { handler } = setup('  ');
    const result = await handler.execute(new SetProsodyCommand('u1', prompt, '  '));
    expect(result.error).toEqual({ code: 'PROMPT_HAS_NO_TEXT' });
  });

  it('refuses an unknown prompt', async () => {
    const { handler } = setup();
    const result = await handler.execute(
      new SetProsodyCommand('u1', { ...prompt, promptId: 'p9' } as ProsodyOwner, TEXT),
    );
    expect(result.error).toEqual({ code: 'PROMPT_NOT_FOUND' });
  });
});
