import { UpdateAtomHandler } from './update-atom.handler.js';
import { UpdateAtomCommand } from './update-atom.command.js';
import { DeleteAtomHandler } from '../delete-atom/delete-atom.handler.js';
import { DeleteAtomCommand } from '../delete-atom/delete-atom.command.js';
import { GrammarRuleDomainError } from '../../../domain/exceptions/grammar-rule-domain.exceptions.js';
import { GrammarRuleAtom } from '../../../domain/entities/grammar-rule-atom.entity.js';
import { AtomTrack } from '../../../domain/value-objects/atom-track.vo.js';
import type { IGrammarRuleAtomRepository } from '../../../domain/repositories/grammar-rule-atom.repository.interface.js';

const USER_ID = 'user-1';
const RULE_ID = 'rule-1';

function makeAtom(): GrammarRuleAtom {
  const result = GrammarRuleAtom.create({
    grammarRuleId: RULE_ID,
    key: 'definite-plural',
    title: 'Definite plural',
    track: AtomTrack.GRAMMAR,
    position: 0,
    createdByUserId: USER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeRepo(atom: GrammarRuleAtom | null, clash: GrammarRuleAtom | null = null) {
  const save = jest.fn().mockImplementation((a: GrammarRuleAtom) => Promise.resolve(a));
  const findByKey = jest.fn().mockResolvedValue(clash);
  const repo = {
    findById: jest.fn().mockResolvedValue(atom),
    findByKey,
    save,
  } as unknown as IGrammarRuleAtomRepository;
  return { repo, save, findByKey };
}

describe('UpdateAtomHandler', () => {
  it('updates the atom', async () => {
    const atom = makeAtom();
    const handler = new UpdateAtomHandler(makeRepo(atom).repo);

    const result = await handler.execute(
      new UpdateAtomCommand(USER_ID, RULE_ID, atom.id, undefined, 'Definite plural (-ene)'),
    );

    expect(result.isOk).toBe(true);
    expect(atom.title).toBe('Definite plural (-ene)');
  });

  it('renames the slug when it is free', async () => {
    // Safe for a learner: the card addresses the atom by id. Only a seed keyed on the old
    // slug notices, and it would create a second atom rather than update this one.
    const atom = makeAtom();
    const handler = new UpdateAtomHandler(makeRepo(atom).repo);

    const result = await handler.execute(
      new UpdateAtomCommand(USER_ID, RULE_ID, atom.id, 'definite-plural-ene'),
    );

    expect(result.isOk).toBe(true);
    expect(atom.key).toBe('definite-plural-ene');
  });

  it('refuses a slug already taken inside the rule', async () => {
    const atom = makeAtom();
    const taken = makeAtom();
    const handler = new UpdateAtomHandler(makeRepo(atom, taken).repo);

    const result = await handler.execute(
      new UpdateAtomCommand(USER_ID, RULE_ID, atom.id, 'gender'),
    );

    expect(result.error).toBe(GrammarRuleDomainError.ATOM_KEY_ALREADY_EXISTS);
    expect(atom.key).toBe('definite-plural');
  });

  it('does not look for a clash when the slug is unchanged', async () => {
    const atom = makeAtom();
    const { repo, findByKey } = makeRepo(atom, makeAtom());
    const handler = new UpdateAtomHandler(repo);

    const result = await handler.execute(
      new UpdateAtomCommand(USER_ID, RULE_ID, atom.id, 'Definite-Plural', 'New title'),
    );

    expect(result.isOk).toBe(true);
    expect(findByKey).not.toHaveBeenCalled();
  });

  it('refuses an atom addressed through the wrong rule', async () => {
    // The route nests the atom inside a rule, and the guard checks access to *that* rule.
    // Without this check, edit rights on one rule would reach every atom in the service.
    const atom = makeAtom();
    const handler = new UpdateAtomHandler(makeRepo(atom).repo);

    const result = await handler.execute(
      new UpdateAtomCommand(USER_ID, 'another-rule', atom.id, undefined, 'Hijacked'),
    );

    expect(result.error).toBe(GrammarRuleDomainError.ATOM_NOT_FOUND);
    expect(atom.title).toBe('Definite plural');
  });

  it('refuses a retired atom', async () => {
    const atom = makeAtom();
    atom.softDelete();
    const handler = new UpdateAtomHandler(makeRepo(atom).repo);

    const result = await handler.execute(
      new UpdateAtomCommand(USER_ID, RULE_ID, atom.id, undefined, 'New title'),
    );

    expect(result.error).toBe(GrammarRuleDomainError.ATOM_NOT_FOUND);
  });
});

describe('DeleteAtomHandler', () => {
  it('retires the atom rather than removing it', async () => {
    const atom = makeAtom();
    const { repo, save } = makeRepo(atom);
    const handler = new DeleteAtomHandler(repo);

    const result = await handler.execute(new DeleteAtomCommand(USER_ID, RULE_ID, atom.id));

    expect(result.isOk).toBe(true);
    expect(atom.deletedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalledWith(atom);
  });

  it('answers GONE when it is already retired', async () => {
    const atom = makeAtom();
    atom.softDelete();
    const handler = new DeleteAtomHandler(makeRepo(atom).repo);

    const result = await handler.execute(new DeleteAtomCommand(USER_ID, RULE_ID, atom.id));

    expect(result.error).toBe(GrammarRuleDomainError.ATOM_ALREADY_DELETED);
  });

  it('refuses an atom addressed through the wrong rule', async () => {
    const atom = makeAtom();
    const handler = new DeleteAtomHandler(makeRepo(atom).repo);

    const result = await handler.execute(new DeleteAtomCommand(USER_ID, 'another-rule', atom.id));

    expect(result.error).toBe(GrammarRuleDomainError.ATOM_NOT_FOUND);
  });
});
