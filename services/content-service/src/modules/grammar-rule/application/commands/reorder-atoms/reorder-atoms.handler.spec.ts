import { ReorderAtomsHandler } from './reorder-atoms.handler.js';
import { ReorderAtomsCommand } from './reorder-atoms.command.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleAtom } from '../../../domain/entities/grammar-rule-atom.entity.js';
import { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';

const USER_ID = 'user-1';
const RULE_ID = 'rule-1';

function makeAtom(key: string, position: number): GrammarRuleAtom {
  const result = GrammarRuleAtom.create({
    grammarRuleId: RULE_ID,
    key,
    title: key,
    track: AtomTrack.GRAMMAR,
    position,
    createdByUserId: USER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(living: GrammarRuleAtom[]) {
  const reorder = jest.fn().mockResolvedValue(undefined);
  const atomRepo = {
    findByRuleId: jest.fn().mockResolvedValue(living),
    reorder,
  } as unknown as IGrammarRuleAtomRepository;

  return { handler: new ReorderAtomsHandler(atomRepo), reorder };
}

describe('ReorderAtomsHandler', () => {
  const a = makeAtom('gender', 0);
  const b = makeAtom('definite-singular', 1);
  const c = makeAtom('definite-plural', 2);

  it('reorders when every living atom is accounted for', async () => {
    const { handler, reorder } = makeHandler([a, b, c]);

    const result = await handler.execute(
      new ReorderAtomsCommand(USER_ID, RULE_ID, [
        { atomId: c.id, position: 0 },
        { atomId: a.id, position: 1 },
        { atomId: b.id, position: 2 },
      ]),
    );

    expect(result.isOk).toBe(true);
    expect(reorder).toHaveBeenCalledTimes(1);
  });

  it('refuses a partial set', async () => {
    // The atoms left out keep holding positions the reordered ones are claiming, and the
    // unique index would reject the second pass. Better a named 422 than a constraint
    // violation with a stack trace.
    const { handler, reorder } = makeHandler([a, b, c]);

    const result = await handler.execute(
      new ReorderAtomsCommand(USER_ID, RULE_ID, [{ atomId: c.id, position: 0 }]),
    );

    expect(result.error).toBe(GrammarRuleDomainError.INVALID_REORDER_INPUT);
    expect(reorder).not.toHaveBeenCalled();
  });

  it('refuses duplicate positions', async () => {
    const { handler, reorder } = makeHandler([a, b, c]);

    const result = await handler.execute(
      new ReorderAtomsCommand(USER_ID, RULE_ID, [
        { atomId: a.id, position: 0 },
        { atomId: b.id, position: 0 },
        { atomId: c.id, position: 1 },
      ]),
    );

    expect(result.error).toBe(GrammarRuleDomainError.INVALID_REORDER_INPUT);
    expect(reorder).not.toHaveBeenCalled();
  });

  it('refuses an atom belonging to another rule', async () => {
    const { handler, reorder } = makeHandler([a, b, c]);

    const result = await handler.execute(
      new ReorderAtomsCommand(USER_ID, RULE_ID, [
        { atomId: 'someone-elses-atom', position: 0 },
        { atomId: b.id, position: 1 },
        { atomId: c.id, position: 2 },
      ]),
    );

    expect(result.error).toBe(GrammarRuleDomainError.INVALID_REORDER_INPUT);
    expect(reorder).not.toHaveBeenCalled();
  });

  it('refuses an empty list', async () => {
    const { handler } = makeHandler([a]);

    const result = await handler.execute(new ReorderAtomsCommand(USER_ID, RULE_ID, []));

    expect(result.error).toBe(GrammarRuleDomainError.INVALID_REORDER_INPUT);
  });
});
