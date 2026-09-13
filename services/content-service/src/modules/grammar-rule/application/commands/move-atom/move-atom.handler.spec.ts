import { MoveAtomHandler } from './move-atom.handler.js';
import { MoveAtomCommand } from './move-atom.command.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleAtom } from '../../../domain/entities/grammar-rule-atom.entity.js';
import { GrammarRuleEntity } from '../../../domain/entities/grammar-rule.entity.js';
import { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { IGrammarRuleRepository } from '../../../domain/repositories/grammar-rule.repository.interface.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';
import type { EntityResolverRegistry } from '../../../../../shared/access-control/infrastructure/registry/entity-resolver-registry.js';
import type { VisibilityCheckerService } from '../../../../../shared/access-control/domain/services/visibility-checker.service.js';
import { TaggableEntityType } from '../../../../../shared/access-control/domain/types/taggable-entity-type.js';

const USER_ID = 'user-1';
const SOURCE_RULE_ID = 'rule-source';
const TARGET_RULE_ID = 'rule-target';

function makeRule(): GrammarRuleEntity {
  const result = GrammarRuleEntity.create({
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A2,
    topic: GrammarTopic.NOUNS,
    title: 'Target rule',
    ownerUserId: USER_ID,
    visibility: Visibility.PUBLIC,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeAtom(key = 'gender'): GrammarRuleAtom {
  const result = GrammarRuleAtom.create({
    grammarRuleId: SOURCE_RULE_ID,
    key,
    title: 'Gender',
    track: AtomTrack.LEXIS,
    position: 2,
    createdByUserId: USER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: {
  atom?: GrammarRuleAtom | null;
  targetRule?: GrammarRuleEntity | null;
  clash?: GrammarRuleAtom | null;
  allowed?: boolean;
  maxPosition?: number;
}) {
  const ruleRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides.targetRule === undefined ? makeRule() : overrides.targetRule),
  } as unknown as IGrammarRuleRepository;

  const findByKey = jest.fn().mockResolvedValue(overrides.clash ?? null);
  const save = jest.fn().mockImplementation((a: GrammarRuleAtom) => Promise.resolve(a));
  const atomRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides.atom === undefined ? makeAtom() : overrides.atom),
    findByKey,
    getMaxPosition: jest.fn().mockResolvedValue(overrides.maxPosition ?? 4),
    save,
  } as unknown as IGrammarRuleAtomRepository;

  const registry = {
    resolve: jest.fn().mockResolvedValue({
      id: TARGET_RULE_ID,
      entityType: TaggableEntityType.GRAMMAR_RULE,
      ownerUserId: USER_ID,
      ownerSchoolId: null,
      visibility: Visibility.PUBLIC,
      deletedAt: null,
    }),
  } as unknown as EntityResolverRegistry;

  const checker = {
    canAccess: jest.fn().mockResolvedValue({ allowed: overrides.allowed ?? true }),
  } as unknown as VisibilityCheckerService;

  return {
    handler: new MoveAtomHandler(ruleRepo, atomRepo, registry, checker),
    findByKey,
    save,
  };
}

describe('MoveAtomHandler', () => {
  it('re-parents the atom and appends it to the destination', async () => {
    const atom = makeAtom();
    const { handler, save } = makeHandler({ atom, maxPosition: 4 });

    const result = await handler.execute(
      new MoveAtomCommand(USER_ID, false, SOURCE_RULE_ID, atom.id, TARGET_RULE_ID),
    );

    expect(result.isOk).toBe(true);
    expect(atom.grammarRuleId).toBe(TARGET_RULE_ID);
    expect(atom.position).toBe(5);
    expect(save).toHaveBeenCalledWith(atom);
  });

  it("keeps the atom id, which is what a learner's memory points at", async () => {
    const atom = makeAtom();
    const idBefore = atom.id;
    const { handler } = makeHandler({ atom });

    await handler.execute(
      new MoveAtomCommand(USER_ID, false, SOURCE_RULE_ID, atom.id, TARGET_RULE_ID),
    );

    expect(atom.id).toBe(idBefore);
  });

  it('refuses when the destination already holds that key', async () => {
    // The ordinary case when two rules are merged: both have a `gender`. The caller has to
    // say what the survivor is called rather than the move renaming something silently.
    const atom = makeAtom('gender');
    const { handler } = makeHandler({ atom, clash: makeAtom('gender') });

    const result = await handler.execute(
      new MoveAtomCommand(USER_ID, false, SOURCE_RULE_ID, atom.id, TARGET_RULE_ID),
    );

    expect(result.error).toBe(GrammarRuleDomainError.ATOM_KEY_ALREADY_EXISTS);
  });

  it('accepts the move when the caller supplies a free key', async () => {
    const atom = makeAtom('gender');
    const { handler, findByKey } = makeHandler({ atom, clash: null });

    const result = await handler.execute(
      new MoveAtomCommand(USER_ID, false, SOURCE_RULE_ID, atom.id, TARGET_RULE_ID, 'noun-gender'),
    );

    expect(result.isOk).toBe(true);
    expect(findByKey).toHaveBeenCalledWith(TARGET_RULE_ID, 'noun-gender');
    expect(atom.key).toBe('noun-gender');
  });

  it('refuses when the caller cannot edit the destination rule', async () => {
    // The route guard only knows the rule in the path. Without this check, edit rights on one
    // rule would let a caller push atoms into every rule in the service.
    const atom = makeAtom();
    const { handler, save } = makeHandler({ atom, allowed: false });

    const result = await handler.execute(
      new MoveAtomCommand(USER_ID, false, SOURCE_RULE_ID, atom.id, TARGET_RULE_ID),
    );

    expect(result.error).toBe(GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS);
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a retired destination rule', async () => {
    const atom = makeAtom();
    const { handler } = makeHandler({ atom, targetRule: null });

    const result = await handler.execute(
      new MoveAtomCommand(USER_ID, false, SOURCE_RULE_ID, atom.id, TARGET_RULE_ID),
    );

    expect(result.error).toBe(GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND);
  });

  it('refuses a move onto the rule the atom already lives in', async () => {
    const atom = makeAtom();
    const { handler } = makeHandler({ atom });

    const result = await handler.execute(
      new MoveAtomCommand(USER_ID, false, SOURCE_RULE_ID, atom.id, SOURCE_RULE_ID),
    );

    expect(result.error).toBe(GrammarRuleDomainError.INVALID_ATOM_DATA);
  });

  it('refuses an atom addressed through the wrong rule', async () => {
    const atom = makeAtom();
    const { handler } = makeHandler({ atom });

    const result = await handler.execute(
      new MoveAtomCommand(USER_ID, false, 'some-other-rule', atom.id, TARGET_RULE_ID),
    );

    expect(result.error).toBe(GrammarRuleDomainError.ATOM_NOT_FOUND);
  });
});
