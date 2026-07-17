import { SetQuickCheckHandler } from './set-quick-check.handler.js';
import { SetQuickCheckCommand } from './set-quick-check.command.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import { GrammarRuleExplanationEntity } from '../../../domain/entities/grammar-rule-explanation.entity.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
import type { IGrammarRuleQuickCheckRepository } from '../../../domain/repositories/grammar-rule-quick-check.repository.interface.js';

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

  const quickCheckRepo = {
    findByExplanationId: jest.fn(),
    upsertForExplanation: jest.fn().mockResolvedValue(undefined),
  } as unknown as IGrammarRuleQuickCheckRepository;

  return {
    handler: new SetQuickCheckHandler(ruleRepo, explanationRepo, quickCheckRepo),
    quickCheckRepo,
  };
}

describe('SetQuickCheckHandler', () => {
  it('upserts a quick-check for an explanation owned by the caller', async () => {
    const rule = makeRule();
    const explanation = makeExplanation(rule.id);
    const { handler, quickCheckRepo } = makeHandler({ rule, explanation });

    const result = await handler.execute(
      new SetQuickCheckCommand(OWNER_ID, rule.id, explanation.id, {
        question: 'Which sentence is correct?',
        options: ['Jeg spiser epler.', 'Jeg spise epler.'],
        correctOptionIndex: 0,
        explanation: 'The verb takes an -er ending in the present tense.',
      }),
    );

    expect(result.isOk).toBe(true);
    expect(quickCheckRepo.upsertForExplanation).toHaveBeenCalledTimes(1);
    expect(quickCheckRepo.upsertForExplanation).toHaveBeenCalledWith(
      explanation.id,
      expect.objectContaining({
        question: 'Which sentence is correct?',
        correctOptionIndex: 0,
      }),
    );
  });

  it('clears the quick-check when the command payload is null', async () => {
    const rule = makeRule();
    const explanation = makeExplanation(rule.id);
    const { handler, quickCheckRepo } = makeHandler({ rule, explanation });

    const result = await handler.execute(
      new SetQuickCheckCommand(OWNER_ID, rule.id, explanation.id, null),
    );

    expect(result.isOk).toBe(true);
    expect(quickCheckRepo.upsertForExplanation).toHaveBeenCalledWith(explanation.id, null);
  });

  it('rejects invalid quick-check data (fewer than 2 options)', async () => {
    const rule = makeRule();
    const explanation = makeExplanation(rule.id);
    const { handler, quickCheckRepo } = makeHandler({ rule, explanation });

    const result = await handler.execute(
      new SetQuickCheckCommand(OWNER_ID, rule.id, explanation.id, {
        question: 'Which sentence is correct?',
        options: ['Jeg spiser epler.'],
        correctOptionIndex: 0,
        explanation: 'Explanation text.',
      }),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.INVALID_QUICK_CHECK_DATA);
    expect(quickCheckRepo.upsertForExplanation).not.toHaveBeenCalled();
  });

  it('rejects invalid quick-check data (correctOptionIndex out of range)', async () => {
    const rule = makeRule();
    const explanation = makeExplanation(rule.id);
    const { handler, quickCheckRepo } = makeHandler({ rule, explanation });

    const result = await handler.execute(
      new SetQuickCheckCommand(OWNER_ID, rule.id, explanation.id, {
        question: 'Which sentence is correct?',
        options: ['Jeg spiser epler.', 'Jeg spise epler.'],
        correctOptionIndex: 5,
        explanation: 'Explanation text.',
      }),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.INVALID_QUICK_CHECK_DATA);
    expect(quickCheckRepo.upsertForExplanation).not.toHaveBeenCalled();
  });

  it('rejects when the explanation does not exist', async () => {
    const rule = makeRule();
    const { handler, quickCheckRepo } = makeHandler({ rule, explanation: null });

    const result = await handler.execute(
      new SetQuickCheckCommand(OWNER_ID, rule.id, 'missing-explanation', null),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.EXPLANATION_NOT_FOUND);
    expect(quickCheckRepo.upsertForExplanation).not.toHaveBeenCalled();
  });

  it('rejects when the caller does not own the parent grammar rule', async () => {
    const rule = makeRule();
    const explanation = makeExplanation(rule.id);
    const { handler, quickCheckRepo } = makeHandler({ rule, explanation });

    const result = await handler.execute(
      new SetQuickCheckCommand('someone-else', rule.id, explanation.id, null),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    expect(quickCheckRepo.upsertForExplanation).not.toHaveBeenCalled();
  });
});
