import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AiDraftBodyDto } from '../../../src/modules/ai-drafts/presentation/dto/put-ai-draft.dto.js';

// Plan 85, step 3b: a draft remark may name the grammar atom it is about.

const ATOM = 'f056f89e-fac6-4ec3-bfc3-db24a23db27a';

const body = (remark: Record<string, unknown>) => ({
  status: 'ready',
  items: [{ itemId: 's1', sentenceIndex: 1, aspect: 'grammar', fragment: 'bor', comment: 'Время?', suggestion: null, ...remark }],
  summary: null,
  aiCallId: '7d1f0a52-1c3e-4c8e-9b7a-0f2d3e4a5b6c',
});

// The service's own pipe: an unknown property is an error, not dropped.
const errorsOf = async (plain: unknown) =>
  validate(plainToInstance(AiDraftBodyDto, plain) as object, { whitelist: true, forbidNonWhitelisted: true });

describe('AiDraftBodyDto atomRef', () => {
  it('accepts a remark without one, with null, and with a grammar atom', async () => {
    expect(await errorsOf(body({}))).toEqual([]);
    expect(await errorsOf(body({ atomRef: null }))).toEqual([]);
    expect(await errorsOf(body({ atomRef: { atomType: 'grammar_rule_atom', atomId: ATOM } }))).toEqual([]);
  });

  it('refuses another atom type, an id that is not one, and stray fields', async () => {
    expect(await errorsOf(body({ atomRef: { atomType: 'vocabulary_item', atomId: ATOM } }))).not.toEqual([]);
    expect(await errorsOf(body({ atomRef: { atomType: 'grammar_rule_atom', atomId: 'x' } }))).not.toEqual([]);
    expect(await errorsOf(body({ atomRef: { atomType: 'grammar_rule_atom', atomId: ATOM, extra: 1 } }))).not.toEqual([]);
  });
});
