import { CreateAtomHandler } from './create-atom.handler.js';
import { CreateAtomCommand } from './create-atom.command.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleAtom } from '../../../domain/entities/grammar-rule-atom.entity.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';

const USER_ID = 'user-1';

function makeRule(): GrammarRuleEntity {
  const result = GrammarRuleEntity.create({
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A2,
    topic: GrammarTopic.NOUNS,
    title: 'Bestemt form av substantiv',
    ownerUserId: USER_ID,
    visibility: Visibility.PUBLIC,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: {
  rule?: GrammarRuleEntity | null;
  existingKey?: GrammarRuleAtom | null;
  maxPosition?: number;
}) {
  const rule = overrides.rule === undefined ? makeRule() : overrides.rule;

  const ruleRepo = {
    findById: jest.fn().mockResolvedValue(rule),
  } as unknown as IGrammarRuleRepository;

  const saved: GrammarRuleAtom[] = [];
  const findByKey = jest.fn().mockResolvedValue(overrides.existingKey ?? null);
  const atomRepo = {
    findByKey,
    getMaxPosition: jest.fn().mockResolvedValue(overrides.maxPosition ?? -1),
    save: jest.fn().mockImplementation((atom: GrammarRuleAtom) => {
      saved.push(atom);
      return Promise.resolve(atom);
    }),
  } as unknown as IGrammarRuleAtomRepository;

  return {
    handler: new CreateAtomHandler(ruleRepo, atomRepo),
    // Non-null for every test that uses it; the one that passes `rule: null` only reads the
    // handler.
    rule: rule as GrammarRuleEntity,
    findByKey,
    saved,
  };
}

describe('CreateAtomHandler', () => {
  it('places the first atom of a rule at position 0', async () => {
    const { handler, rule, saved } = makeHandler({ maxPosition: -1 });

    const result = await handler.execute(
      new CreateAtomCommand(
        USER_ID,
        rule.id,
        'definite-plural',
        'Definite plural',
        AtomTrack.GRAMMAR,
      ),
    );

    expect(result.isOk).toBe(true);
    expect(saved[0].position).toBe(0);
  });

  it('appends after the last living atom', async () => {
    const { handler, rule, saved } = makeHandler({ maxPosition: 3 });

    await handler.execute(
      new CreateAtomCommand(USER_ID, rule.id, 'gender', 'Gender', AtomTrack.LEXIS),
    );

    expect(saved[0].position).toBe(4);
  });

  it('checks the duplicate against the normalised key, not the raw one', async () => {
    // `Definite-Plural` and `definite-plural` are the same address. Checking the raw string
    // would let the second one through and the partial unique index would answer with a 500.
    const { handler, rule, findByKey } = makeHandler({});

    await handler.execute(
      new CreateAtomCommand(
        USER_ID,
        rule.id,
        'Definite-Plural',
        'Definite plural',
        AtomTrack.GRAMMAR,
      ),
    );

    expect(findByKey).toHaveBeenCalledWith(rule.id, 'definite-plural');
  });

  it('refuses a key already living in the rule', async () => {
    const existing = GrammarRuleAtom.create({
      grammarRuleId: 'rule-1',
      key: 'definite-plural',
      title: 'Definite plural',
      track: AtomTrack.GRAMMAR,
      position: 0,
      createdByUserId: USER_ID,
    }).value;
    const { handler, rule } = makeHandler({ existingKey: existing });

    const result = await handler.execute(
      new CreateAtomCommand(USER_ID, rule.id, 'definite-plural', 'Again', AtomTrack.GRAMMAR),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.ATOM_KEY_ALREADY_EXISTS);
  });

  it('refuses a malformed key before touching the repository', async () => {
    const { handler, rule, findByKey } = makeHandler({});

    const result = await handler.execute(
      new CreateAtomCommand(
        USER_ID,
        rule.id,
        'definite plural',
        'Definite plural',
        AtomTrack.GRAMMAR,
      ),
    );

    expect(result.error).toBe(GrammarRuleDomainError.INVALID_ATOM_KEY);
    expect(findByKey).not.toHaveBeenCalled();
  });

  it('refuses an unknown rule', async () => {
    const { handler } = makeHandler({ rule: null });

    const result = await handler.execute(
      new CreateAtomCommand(USER_ID, 'missing', 'key', 'Title', AtomTrack.GRAMMAR),
    );

    expect(result.error).toBe(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
  });
});
