import { lexicalWord } from '../../providers/domain/lexical.js';
import type { LexiconVariant } from './align-word.js';

/** One token of the passage as the tagger read it (plan 88, step 4b): UD part of speech and morphology. */
export interface PosToken {
  text: string;
  /** Character span in the passage text. */
  start: number;
  end: number;
  /** UD universal part of speech: `NOUN`, `VERB`, `PUNCT`… */
  upos: string;
  /** UD features as the tagger prints them: `Mood=Imp|VerbForm=Fin`; empty when none. */
  morph: string;
  sentStart: boolean;
}

/** What narrowing needs of a passage word's tag. */
export interface WordTag {
  upos: string;
  morph: string;
  /** First word of a sentence or after a colon (*Tor: Noter …*) — where an imperative stands. */
  clauseInitial: boolean;
}

/**
 * How the variants were narrowed (§0.8 (2)): by part of speech and features, by part of speech
 * alone, not at all because the tagger may have missed a clause-initial imperative (`guard`),
 * not at all because no variant fits the tag (`none`), or the word has no tag (`untagged`).
 */
export type NarrowedBy = 'feats' | 'pos' | 'guard' | 'none' | 'untagged';

/** UD part of speech → NB Uttale's (§0.8 (3)). */
const LEXICON_POS: Readonly<Record<string, readonly string[]>> = {
  NOUN: ['NN'],
  PROPN: ['PM', 'NN'],
  VERB: ['VB'],
  AUX: ['VB'],
  ADJ: ['JJ'],
  ADV: ['AB'],
  PRON: ['PN'],
  DET: ['DT', 'PN'],
  ADP: ['PP'],
  CCONJ: ['KN'],
  SCONJ: ['KN', 'SN'],
  INTJ: ['IN'],
  NUM: ['RG', 'RO'],
  PART: ['IE', 'AB'],
};

/**
 * NB Uttale's feature dimensions. A feature agrees when, in each dimension, the tag and the
 * lexicon row share a value or one of them does not state the dimension.
 */
const DIMENSIONS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['INF', 'IMP', 'PRS', 'PRT', 'PF', 'PS']),
  new Set(['SIN', 'PLU']),
  new Set(['IND', 'DEF']),
  new Set(['POS', 'KOM', 'SUV']),
  new Set(['AKT', 'PAS']),
];

/** UD morphology in NB Uttale's feature names (§0.8 (3)). */
export function lexiconFeatures(upos: string, morph: string): Set<string> {
  const ud = new Map(
    morph
      .split('|')
      .map((kv) => kv.split('='))
      .filter((kv): kv is [string, string] => kv.length === 2),
  );
  const out = new Set<string>();
  if (ud.get('Mood') === 'Imp') out.add('IMP');
  else if (ud.get('VerbForm') === 'Inf') out.add('INF');
  else if (ud.get('VerbForm') === 'Part') out.add(ud.get('Tense') === 'Past' ? 'PF' : 'PS');
  else if (ud.get('Tense') === 'Pres') out.add('PRS');
  else if (ud.get('Tense') === 'Past') out.add('PRT');
  if (ud.get('Voice') === 'Pass') out.add('PAS');
  else if ((upos === 'VERB' || upos === 'AUX') && out.size > 0) out.add('AKT');
  const number = { Sing: 'SIN', Plur: 'PLU' }[ud.get('Number') ?? ''];
  const definite = { Ind: 'IND', Def: 'DEF' }[ud.get('Definite') ?? ''];
  const degree = { Pos: 'POS', Cmp: 'KOM', Sup: 'SUV' }[ud.get('Degree') ?? ''];
  for (const f of [number, definite, degree]) if (f) out.add(f);
  return out;
}

/** The lexicon's part of speech without its subtype: `PM|person|SUR` → `PM`. */
const posOf = (v: LexiconVariant) => (v.pos ?? '').split('|')[0]!;
const featsOf = (v: LexiconVariant) => new Set((v.feats ?? '').split(/[|-]/).filter((f) => f));

function fits(variant: LexiconVariant, upos: string, features: Set<string>, byFeatures: boolean): boolean {
  if (!(LEXICON_POS[upos] ?? []).includes(posOf(variant))) return false;
  const own = featsOf(variant);
  if (!byFeatures || own.size === 0) return true;
  return DIMENSIONS.every((dim) => {
    const ours = [...features].filter((f) => dim.has(f));
    const theirs = [...own].filter((f) => dim.has(f));
    return ours.length === 0 || theirs.length === 0 || ours.some((f) => theirs.includes(f));
  });
}

const transcriptions = (vs: LexiconVariant[]) => new Set(vs.map((v) => v.nofabet));

/**
 * The word's variants that fit its tag, in tiers (§0.8 (2)): part of speech and features, then
 * part of speech alone, then all of them. spaCy reads the imperative of *-ere* verbs as present
 * tense (*fokuser* `VERB Pres`) — part of speech alone still keeps the one verb variant. Where it
 * reads a clause-initial imperative as a noun (*Noter …*) and the imperative sounds different, the
 * word is not narrowed: a wrong name is worse than none. Pure; the aligner takes the result.
 */
export function narrowVariants(
  variants: LexiconVariant[],
  tag: WordTag | null,
): { variants: LexiconVariant[]; narrowedBy: NarrowedBy } {
  if (!tag) return { variants, narrowedBy: 'untagged' };
  const features = lexiconFeatures(tag.upos, tag.morph);

  const imperative = variants.filter((v) => posOf(v) === 'VB' && featsOf(v).has('IMP'));
  if (tag.clauseInitial && tag.upos !== 'VERB' && tag.upos !== 'AUX' && imperative.length > 0) {
    const imp = transcriptions(imperative);
    const all = transcriptions(variants);
    const rest = transcriptions(variants.filter((v) => !imperative.includes(v)));
    // Nothing to lose when the imperative sounds like another reading or every reading sounds like it.
    const lost = imp.size !== all.size && ![...imp].every((t) => rest.has(t));
    if (lost) return { variants, narrowedBy: 'guard' };
  }

  for (const byFeatures of [true, false]) {
    const kept = variants.filter((v) => fits(v, tag.upos, features, byFeatures));
    if (kept.length > 0) return { variants: kept, narrowedBy: byFeatures ? 'feats' : 'pos' };
  }
  return { variants, narrowedBy: 'none' };
}

/**
 * The tag of each lexical word of the passage, in the order of `lexicalWords(text)` — the order
 * Azure's words follow. A word gets the one tagger token that covers it and reads the same; where
 * the two split the text differently (a number, `10 000`; a token over two words) it gets null and
 * is not narrowed.
 */
export function tagsOfPassageWords(text: string, tokens: readonly PosToken[]): Array<WordTag | null> {
  const clauseInitial = new Set<PosToken>();
  let opening = true;
  for (const t of tokens) {
    if (t.sentStart) opening = true;
    if (!lexicalWord(t.text)) {
      if (t.text === ':') opening = true;
      continue;
    }
    if (opening) clauseInitial.add(t);
    opening = false;
  }

  const out: Array<WordTag | null> = [];
  for (const chunk of text.matchAll(/\S+/g)) {
    const word = lexicalWord(chunk[0]);
    if (!word) continue;
    const start = chunk.index;
    const end = start + chunk[0].length;
    const covering = tokens.filter((t) => t.start < end && t.end > start && lexicalWord(t.text));
    const token = covering.length === 1 ? covering[0]! : null;
    out.push(
      token && lexicalWord(token.text) === word
        ? { upos: token.upos, morph: token.morph, clauseInitial: clauseInitial.has(token) }
        : null,
    );
  }
  return out;
}
