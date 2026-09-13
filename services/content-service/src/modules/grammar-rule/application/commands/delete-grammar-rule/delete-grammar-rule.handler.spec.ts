import { DeleteGrammarRuleHandler } from './delete-grammar-rule.handler.js';
import { DeleteGrammarRuleCommand } from './delete-grammar-rule.command.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleExplanationRepository } from '../../../domain/repositories/grammar-rule-explanation.repository.interface.js';
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

function makeHandler(overrides: { hasRefs?: boolean } = {}) {
  const rule = makeRule();
  const ruleRepo = {
    findById: jest.fn().mockResolvedValue(rule),
    hasPublishedContainerReferences: jest.fn().mockResolvedValue(overrides.hasRefs ?? false),
    save: jest.fn().mockResolvedValue(rule),
  } as unknown as IGrammarRuleRepository;

  const softDeleteExplanations = jest.fn().mockResolvedValue(0);
  const explanationRepo = {
    softDeleteByRuleId: softDeleteExplanations,
  } as unknown as IGrammarRuleExplanationRepository;

  const softDeleteAtoms = jest.fn().mockResolvedValue(3);
  const atomRepo = {
    softDeleteByRuleId: softDeleteAtoms,
  } as unknown as IGrammarRuleAtomRepository;

  return {
    handler: new DeleteGrammarRuleHandler(ruleRepo, explanationRepo, atomRepo),
    rule,
    softDeleteAtoms,
  };
}

describe('DeleteGrammarRuleHandler', () => {
  it('retires the rule atoms along with the rule', async () => {
    // Left standing, they keep appearing in coverage reports as facts a course is expected
    // to teach, belonging to a rule nobody can open.
    const { handler, rule, softDeleteAtoms } = makeHandler();

    const result = await handler.execute(new DeleteGrammarRuleCommand(USER_ID, rule.id));

    expect(result.isOk).toBe(true);
    expect(softDeleteAtoms).toHaveBeenCalledWith(rule.id);
  });

  it('touches nothing when the rule stands in a published course', async () => {
    const { handler, rule, softDeleteAtoms } = makeHandler({ hasRefs: true });

    const result = await handler.execute(new DeleteGrammarRuleCommand(USER_ID, rule.id));

    expect(result.error).toBe(GrammarRuleDomainError.RULE_HAS_PUBLISHED_CONTAINER_REFERENCES);
    expect(softDeleteAtoms).not.toHaveBeenCalled();
  });
});
