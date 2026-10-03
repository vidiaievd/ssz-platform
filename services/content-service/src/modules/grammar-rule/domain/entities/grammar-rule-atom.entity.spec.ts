import { GrammarRuleAtom } from './grammar-rule-atom.entity.js';
import { AtomTrack } from '../value-objects/atom-track.vo.js';
import { GrammarRuleDomainError } from '../exceptions/grammar-rule-domain.exceptions.js';

const RULE_ID = 'rule-1';
const USER_ID = 'user-1';

function make(overrides: Partial<Parameters<typeof GrammarRuleAtom.create>[0]> = {}) {
  return GrammarRuleAtom.create({
    grammarRuleId: RULE_ID,
    key: 'definite-plural',
    title: 'Definite plural',
    track: AtomTrack.GRAMMAR,
    position: 0,
    createdByUserId: USER_ID,
    ...overrides,
  });
}

describe('GrammarRuleAtom.create', () => {
  it('normalises the key to lowercase', () => {
    // The key is an address written in two places — here and, from phase 1, on an exercise
    // target. Two spellings of the same atom would split one learner's memory in half.
    const result = make({ key: 'Definite-Plural' });
    expect(result.isOk).toBe(true);
    expect(result.value.key).toBe('definite-plural');
  });

  it('trims the title and drops a blank description', () => {
    const result = make({ title: '  Definite plural  ', description: '   ' });
    expect(result.value.title).toBe('Definite plural');
    expect(result.value.description).toBeNull();
  });

  it.each(['', 'definite plural', 'definite_plural', 'Definite--Plural', '-leading', 'trailing-'])(
    'rejects the malformed key %p',
    (key) => {
      const result = make({ key });
      expect(result.isFail).toBe(true);
      expect(result.error).toBe(GrammarRuleDomainError.INVALID_ATOM_KEY);
    },
  );

  it('rejects a key longer than the column', () => {
    const result = make({ key: 'a'.repeat(61) });
    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.INVALID_ATOM_KEY);
  });

  it('rejects an empty title', () => {
    const result = make({ title: '   ' });
    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.INVALID_ATOM_DATA);
  });

  it('accepts LEXIS inside a grammar rule', () => {
    // Deliberate, not an oversight: the gender of a noun lives in a grammar rule and is
    // learnt one word at a time. See the enum's comment.
    const result = make({ key: 'gender', track: AtomTrack.LEXIS });
    expect(result.isOk).toBe(true);
    expect(result.value.track).toBe(AtomTrack.LEXIS);
  });
});

describe('GrammarRuleAtom.update', () => {
  it('changes title, note and track', () => {
    const atom = make().value;
    const result = atom.update({
      title: 'Definite plural (-ene)',
      description: 'husene',
      track: AtomTrack.LEXIS,
    });
    expect(result.isOk).toBe(true);
    expect(atom.title).toBe('Definite plural (-ene)');
    expect(atom.description).toBe('husene');
    expect(atom.track).toBe(AtomTrack.LEXIS);
  });

  it('leaves the key alone when the update does not mention it', () => {
    const atom = make().value;
    atom.update({ title: 'Something else entirely' });
    expect(atom.key).toBe('definite-plural');
  });

  it('renames the key, normalising it', () => {
    const atom = make().value;
    const result = atom.update({ key: 'Definite-Plural-Ene' });
    expect(result.isOk).toBe(true);
    expect(atom.key).toBe('definite-plural-ene');
  });

  it('rejects a malformed key and keeps the old one', () => {
    const atom = make().value;
    const result = atom.update({ key: 'definite plural' });
    expect(result.isFail).toBe(true);
    expect(result.error).toBe(GrammarRuleDomainError.INVALID_ATOM_KEY);
    expect(atom.key).toBe('definite-plural');
  });

  it('clears the note when given an empty string', () => {
    const atom = make({ description: 'note' }).value;
    atom.update({ description: '' });
    expect(atom.description).toBeNull();
  });

  it('rejects an empty title and changes nothing', () => {
    const atom = make().value;
    const result = atom.update({ title: '  ' });
    expect(result.isFail).toBe(true);
    expect(atom.title).toBe('Definite plural');
  });
});

describe('GrammarRuleAtom.moveTo', () => {
  it('re-parents without touching the id', () => {
    // The id is the address a review card and an exercise target point at. That it survives
    // a move is the whole reason a rule can be split or merged without migrating memory.
    const atom = make().value;
    const idBefore = atom.id;

    const result = atom.moveTo('another-rule', 7);

    expect(result.isOk).toBe(true);
    expect(atom.id).toBe(idBefore);
    expect(atom.grammarRuleId).toBe('another-rule');
    expect(atom.position).toBe(7);
  });

  it('re-keys on the way when asked, normalising as it goes', () => {
    const atom = make().value;
    atom.moveTo('another-rule', 0, 'Noun-Gender');
    expect(atom.key).toBe('noun-gender');
  });

  it('rejects a malformed new key and moves nothing', () => {
    const atom = make().value;
    const result = atom.moveTo('another-rule', 0, 'noun gender');

    expect(result.isFail).toBe(true);
    expect(atom.grammarRuleId).toBe(RULE_ID);
  });
});

describe('GrammarRuleAtom.softDelete', () => {
  it('retires the atom', () => {
    const atom = make().value;
    expect(atom.softDelete().isOk).toBe(true);
    expect(atom.deletedAt).toBeInstanceOf(Date);
  });

  it('refuses to retire twice', () => {
    const atom = make().value;
    atom.softDelete();
    const second = atom.softDelete();
    expect(second.isFail).toBe(true);
    expect(second.error).toBe(GrammarRuleDomainError.ATOM_ALREADY_DELETED);
  });
});

describe('GrammarRuleAtom.updatePosition', () => {
  it('rejects a negative position', () => {
    const atom = make().value;
    const result = atom.updatePosition(-1);
    expect(result.isFail).toBe(true);
    expect(atom.position).toBe(0);
  });
});
