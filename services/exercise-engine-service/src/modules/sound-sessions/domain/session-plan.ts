/**
 * What a pronunciation session drills, decided once when it starts (plan 86, step 13.4a, §5.2,
 * Q29–Q31). Pure: the material and the learner's record come in as plain data, the random draw as
 * a function, so the whole choice is testable by table and replayable from the stored plan.
 *
 * The plan is the key of the session the way a draw is the key of a `minimal_pairs` sitting: it
 * is stored on the attempt and never recomputed, so a seed or a reference clip changing upstream
 * mid-session does not reshuffle what the learner is working through.
 */

/** Families whose take is judged by its toneme (`toneme-checks`), not by Azure's sound scores. */
export const TONE_FAMILY = 'tone';
/** Families that come in pairs (long — short, toneme 1 — toneme 2) and have no line of running speech. */
export const PAIRED_FAMILIES: ReadonlySet<string> = new Set(['vowel_length', TONE_FAMILY]);

/** At most this many sounds in one session (§5.2). */
export const MAX_SOUNDS = 3;

/** A word with the platform's reference clip of it (plan 88): what the learner hears and imitates. */
export interface MaterialWord {
  word: string;
  assetId: string;
  /** The lexicon's toneme the clip was checked against; null on a word without one. */
  tone: 1 | 2 | null;
}

/** A course line holding the sound: judged on its carrier words, in running speech. */
export interface MaterialPhrase {
  text: string;
  carriers: Array<{ word: string; assetId: string | null }>;
  /** `<exercise key>:<prompt id>` of the course line. */
  source: string;
}

/** One sound's drill material, as content-service answers it (`internal/sound-atoms/drill`). */
export interface SoundMaterial {
  atomId: string;
  family: string;
  /** Carrier words that have a reference clip. */
  words: MaterialWord[];
  /** Length pairs (long first) or toneme pairs (1 then 2); both words with a clip. */
  pairs: Array<[MaterialWord, MaterialWord]>;
  phrases: MaterialPhrase[];
}

export interface DrillMaterial {
  language: string;
  atoms: SoundMaterial[];
  /** One word per scored family, catalogue order — the cold start. */
  diagnostic: Array<{ atomId: string; word: MaterialWord }>;
}

/** The learner's record of their sounds, as learning-service answers it (`internal/learners/:id/sound-atoms`). */
export interface LearnerSounds {
  /** `SOUND_ATOM` cards, urgent first, then by due date, then lower stability. */
  cards: Array<{ atomId: string; due: boolean }>;
  /** Sounds flagged in the last 14 UTC days. */
  flags: Array<{ atomId: string; days: number; lastFlaggedOn: string; hasCard: boolean }>;
}

/**
 * One thing to say in a take, or two in turn:
 * - `word` — the word in its carrier frame («Nå sier jeg … igjen.»), against its reference;
 * - `pair` — two words in turn, each in its frame; only the `judged` members decide (a short vowel
 *   of a length pair carries no scored sound, plan 88 §0.5b — it is said for the contrast);
 * - `phrase` — a course line, judged on its carrier words in running speech; no clip of its own (Q26).
 */
export type SessionElement =
  | { kind: 'word'; word: MaterialWord }
  | { kind: 'pair'; words: [MaterialWord, MaterialWord]; judged: number[] }
  | { kind: 'phrase'; text: string; carriers: string[]; source: string };

/** A sound of the session and its ladder: word → second word or pair → phrase (§5.2). */
export interface PlannedSound {
  atomId: string;
  family: string;
  elements: SessionElement[];
}

/**
 * Why these sounds:
 * - `chosen` — the learner picked one (from the card of a sound);
 * - `record` — due cards, then fortnight's flags, then cards not yet due (Q31 1–2);
 * - `diagnostic` — no record at all: the session opens with one word per family, and its weak
 *   families become the plan (Q31 3, §5.5a).
 */
export type PlanBasis = 'chosen' | 'record' | 'diagnostic';

export interface SessionPlan {
  language: string;
  basis: PlanBasis;
  /** Empty until the diagnostic is over when `basis` is `diagnostic`. */
  sounds: PlannedSound[];
  /** The cold start's words, one per family; empty unless `basis` is `diagnostic`. */
  diagnostic: Array<{ atomId: string; family: string; word: MaterialWord }>;
  /**
   * Every drillable sound's ladder, for the diagnostic to choose from once it is over; empty
   * otherwise. Built now, with the same draw, so that the session never reads content-service again.
   */
  candidates: PlannedSound[];
}

/** A number in [0, 1), the platform CSPRNG in production. */
export type Rand = () => number;

export type PlanRefusal =
  /** The chosen sound is not a drillable sound of the language (unknown, or without material). */
  | 'sound_not_drillable'
  /** Nothing in the language can be drilled — no sound has a word with a reference clip. */
  | 'no_material';

/**
 * The plan of a new session.
 *
 * `chosen` wins when given (Q31 4). Otherwise the record (Q31 1–2): due cards first in the order
 * learning-service sent them, then sounds flagged on more distinct days, then — so that a learner
 * whose cards are all in the future still has something to practise — the cards not yet due. A
 * learner with neither cards nor flags gets the diagnostic. Only sounds with material are taken;
 * a toneme only with a full pair (Q31: «only with clips of both words of the pair»).
 */
export function planSession(input: {
  material: DrillMaterial;
  learner: LearnerSounds;
  chosen?: string | null;
  rand: Rand;
}): SessionPlan | PlanRefusal {
  const { material, learner, rand } = input;
  const ladders = new Map<string, PlannedSound>();
  for (const atom of material.atoms) {
    const ladder = ladderOf(atom, rand);
    if (ladder) ladders.set(atom.atomId, ladder);
  }
  const base = { language: material.language, diagnostic: [], candidates: [] };

  if (input.chosen) {
    const sound = ladders.get(input.chosen);
    return sound ? { ...base, basis: 'chosen', sounds: [sound] } : 'sound_not_drillable';
  }
  if (ladders.size === 0) return 'no_material';

  const order = recordOrder(learner).filter((id) => ladders.has(id));
  if (order.length > 0) {
    return {
      ...base,
      basis: 'record',
      sounds: order.slice(0, MAX_SOUNDS).map((id) => ladders.get(id)!),
    };
  }
  if (learner.cards.length > 0 || learner.flags.length > 0) {
    // A record of sounds that have no material left (a seed dropped them): nothing to drill,
    // and the diagnostic would not be a cold start — the drillable sounds in catalogue order.
    return { ...base, basis: 'record', sounds: [...ladders.values()].slice(0, MAX_SOUNDS) };
  }

  const families = new Map(material.atoms.map((a) => [a.atomId, a.family]));
  const diagnostic = material.diagnostic.flatMap((d) => {
    const family = families.get(d.atomId);
    return family && ladders.has(d.atomId) ? [{ atomId: d.atomId, family, word: d.word }] : [];
  });
  if (diagnostic.length === 0) {
    return { ...base, basis: 'record', sounds: [...ladders.values()].slice(0, MAX_SOUNDS) };
  }
  return { ...base, basis: 'diagnostic', sounds: [], diagnostic, candidates: [...ladders.values()] };
}

/**
 * The sounds of the session once its diagnostic is over: the families found weak, in catalogue
 * order (the diagnostic's own), at most `MAX_SOUNDS`. None weak — none to drill.
 */
export function soundsAfterDiagnostic(plan: SessionPlan, weak: readonly string[]): PlannedSound[] {
  const wanted = new Set(weak);
  return plan.candidates.filter((c) => wanted.has(c.atomId)).slice(0, MAX_SOUNDS);
}

/** Due cards, then flagged sounds (more distinct days first, then the latest), then cards not yet due. */
function recordOrder(learner: LearnerSounds): string[] {
  const flagged = [...learner.flags]
    .sort((a, b) => b.days - a.days || b.lastFlaggedOn.localeCompare(a.lastFlaggedOn))
    .map((f) => f.atomId);
  const ids = [
    ...learner.cards.filter((c) => c.due).map((c) => c.atomId),
    ...flagged,
    ...learner.cards.filter((c) => !c.due).map((c) => c.atomId),
  ];
  return [...new Set(ids)];
}

/**
 * A sound's ladder (§5.2), drawn now: a word, then a second word — a pair for the paired
 * families — then a course line. Null when the sound has nothing to start from: no word with a
 * clip, or a toneme without a full pair. A rung without material is skipped, not invented.
 */
export function ladderOf(atom: SoundMaterial, rand: Rand): PlannedSound | null {
  if (atom.words.length === 0) return null;
  const paired = PAIRED_FAMILIES.has(atom.family);
  if (atom.family === TONE_FAMILY && atom.pairs.length === 0) return null;

  const words = shuffled(atom.words, rand);
  const elements: SessionElement[] = [{ kind: 'word', word: words[0]! }];

  if (paired) {
    const pair = atom.pairs.length > 0 ? pick(atom.pairs, rand) : null;
    if (pair) {
      elements.push({
        kind: 'pair',
        words: pair,
        // A length pair is long — short and only the long vowel is scored; both tonemes are heard.
        judged: atom.family === TONE_FAMILY ? [0, 1] : [0],
      });
    }
  } else {
    if (words.length > 1) elements.push({ kind: 'word', word: words[1]! });
    const phrases = atom.phrases.filter((p) => p.carriers.length > 0);
    if (phrases.length > 0) {
      const phrase = pick(phrases, rand);
      elements.push({
        kind: 'phrase',
        text: phrase.text,
        carriers: phrase.carriers.map((c) => c.word),
        source: phrase.source,
      });
    }
  }
  return { atomId: atom.atomId, family: atom.family, elements };
}

function pick<T>(items: readonly T[], rand: Rand): T {
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))]!;
}

/** Fisher–Yates over a copy: ~15 words a sound, so the order is not the same day after day (Q29). */
function shuffled<T>(items: readonly T[], rand: Rand): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
