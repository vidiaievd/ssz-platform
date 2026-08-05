import { SetCompareExamplesHandler } from './set-compare-examples.handler.js';
import { SetCompareExamplesCommand } from './set-compare-examples.command.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleCompareExampleRepository } from '../../../domain/repositories/grammar-rule-compare-example.repository.interface.js';

const OWNER_ID = 'owner-1';

function makeRule(): GrammarRuleEntity {
  const result = GrammarRuleEntity.create({
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A1,
    topic: GrammarTopic.VERBS,
    title: 'Present Tense',
    ownerUserId: OWNER_ID,
    visibility: Visibility.PUBLIC,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeExplanation(ruleId: string): GrammarRuleExplanationEntity {
  const result = GrammarRuleExplanationEntity.create({
    grammarRuleId: ruleId,
    explanationLanguage: 'en',
    minLevel: DifficultyLevel.A1,
    maxLevel: DifficultyLevel.A2,
    displayTitle: 'Present Tense — EN',
    bodyMarkdown: 'explanation body',
    createdByUserId: OWNER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: {
  rule?: GrammarRuleEntity | null;
  explanation?: GrammarRuleExplanationEntity | null;
}) {
  const ruleRepo = {
    findById: jest.fn().mockResolvedValue(overrides.rule ?? null),
  } as unknown as IGrammarRuleRepository;

  const explanationRepo = {
    findById: jest.fn().mockResolvedValue(overrides.explanation ?? null),
  } as unknown as IGrammarRuleExplanationRepository;

  const compareExampleRepo = {
    findByExplanationId: jest.fn(),
    replaceForExplanation: jest.fn().mockResolvedValue(undefined),
  } as unknown as IGrammarRuleCompareExampleRepository;

  return {
    handler: new SetCompareExamplesHandler(ruleRepo, explanationRepo, compareExampleRepo),
    compareExampleRepo,
  };
}

describe('SetCompareExamplesHandler', () => {
  it('replaces compare examples for an explanation owned by the caller', async () => {
    const rule = makeRule();
    const explanation = makeExplanation(rule.id);
    const { handler, compareExampleRepo } = makeHandler({ rule, explanation });

    const result = await handler.execute(
      new SetCompareExamplesCommand(OWNER_ID, rule.id, explanation.id, [
        { position: 0, sentence: 'Jeg spiser epler.', isCorrect: true },
        { position: 1, sentence: 'Jeg spise epler.', note: 'Missing -r ending.', isCorrect: false },
      ]),
    );

    expect(result.isOk).toBe(true);
    expect(compareExampleRepo.replaceForExplanation).toHaveBeenCalledTimes(1);
    expect(compareExampleRepo.replaceForExplanation).toHaveBeenCalledWith(
      explanation.id,
      expect.arrayContaining([
        expect.objectContaining({ position: 0, sentence: 'Jeg spiser epler.', isCorrect: true }),
        expect.objectContaining({ position: 1, sentence: 'Jeg spise epler.', isCorrect: false }),
      ]),
    );
  });

  it('replaces with an empty list, clearing all compare examples', async () => {
    const rule = makeRule();
    const explanation = makeExplanation(rule.id);
    const { handler, compareExampleRepo } = makeHandler({ rule, explanation });

    const result = await handler.execute(
      new SetCompareExamplesCommand(OWNER_ID, rule.id, explanation.id, []),
    );

    expect(result.isOk).toBe(true);
    expect(compareExampleRepo.replaceForExplanation).toHaveBeenCalledWith(explanation.id, []);
  });

  it('rejects duplicate positions within the same request', async () => {
    const rule = makeRule();
    const explanation = makeExplanation(rule.id);
    const { handler, compareExampleRepo } = makeHandler({ rule, explanation });

    const result = await handler.execute(
      new SetCompareExamplesCommand(OWNER_ID, rule.id, explanation.id, [
        { position: 0, sentence: 'Jeg spiser epler.', isCorrect: true },
        { position: 0, sentence: 'Duplicate!', isCorrect: false },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.DUPLICATE_COMPARE_EXAMPLE_POSITION);
    expect(compareExampleRepo.replaceForExplanation).not.toHaveBeenCalled();
  });

  it('rejects invalid compare example data (blank sentence)', async () => {
    const rule = makeRule();
    const explanation = makeExplanation(rule.id);
    const { handler, compareExampleRepo } = makeHandler({ rule, explanation });

    const result = await handler.execute(
      new SetCompareExamplesCommand(OWNER_ID, rule.id, explanation.id, [
        { position: 0, sentence: '   ', isCorrect: true },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.INVALID_COMPARE_EXAMPLE_DATA);
    expect(compareExampleRepo.replaceForExplanation).not.toHaveBeenCalled();
  });

  it('rejects when the explanation does not exist', async () => {
    const rule = makeRule();
    const { handler, compareExampleRepo } = makeHandler({ rule, explanation: null });

    const result = await handler.execute(
      new SetCompareExamplesCommand(OWNER_ID, rule.id, 'missing-explanation', []),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.EXPLANATION_NOT_FOUND);
    expect(compareExampleRepo.replaceForExplanation).not.toHaveBeenCalled();
  });
});
