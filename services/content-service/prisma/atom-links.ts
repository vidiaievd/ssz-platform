/**
 * `PRACTICED_BY` — which atoms an exercise actually practises (plan 55, phase 7.2).
 *
 * This is the edge the whole can-do tract is entered through: exercise-engine snapshots
 * it into `practicedAtoms` at attempt start, learning-service walks from those atoms back
 * to the modules that introduce them, and the `focus` axis reads its subject off the same
 * graph. Without it the other two edges are links nobody ever traverses.
 *
 * Two sources, both measured rather than guessed:
 *
 *   - **grammar rules** — mirrored from `GrammarRuleExercisePool`. That table is the
 *     author placing an exercise in a rule's practice pool, so the claim "this exercise
 *     practises this rule" is one the catalogue already makes; here it is only restated
 *     in the graph the rest of the platform reads.
 *   - **vocabulary items** — a word of the sub-lesson's «Nye ord» that literally occurs
 *     in the exercise document, in any form the data declares for it. Same tokenizer as
 *     the glossary marks: whole-word boundaries by Unicode letter class, because `\b`
 *     treats æøå as non-letters.
 *
 * The candidate list is deliberately narrow — the words the module itself teaches, not
 * the whole course. A hit on a word from another leksjon would say "practises" about an
 * exercise that merely happens to contain a common noun.
 */
import type { PrismaClient } from '../generated/prisma/client.js';

/** A word and every surface form the seed data declares for it. */
export interface CandidateWord {
  vocabularyItemId: string;
  surfaces: string[];
}

export interface ExerciseCandidates {
  exerciseId: string;
  /** Words the module holding this exercise teaches. May be empty. */
  words: CandidateWord[];
}

export interface AtomLinkOptions {
  candidates: ExerciseCandidates[];
  createdByUserId: string;
  ownerSchoolId: string;
}

export interface AtomLinkResult {
  vocabulary: number;
  grammar: number;
  /** Exercises that matched nothing at all — no word of their module, no rule pool. */
  unlinked: number;
}

/**
 * Grammar metadata that lives in `grammaticalProperties` next to the real inflections.
 * Filtered explicitly: `masculine` never occurs in a Norwegian exercise, but relying on
 * that is relying on luck, and one stray match creates a false atom.
 */
const GRAMMAR_METADATA_VALUES = new Set(['masculine', 'feminine', 'neuter', 'a-verb', 'e-verb']);

/** One-character surfaces are dropped: «å» as a lemma would match every infinitive. */
const MIN_SURFACE_LENGTH = 2;

export async function linkPracticedAtoms(
  prisma: PrismaClient,
  options: AtomLinkOptions,
): Promise<AtomLinkResult> {
  const exerciseIds = options.candidates.map((c) => c.exerciseId);
  const pool = await grammarPool(prisma, exerciseIds);

  let vocabulary = 0;
  let grammar = 0;
  let unlinked = 0;

  for (const candidate of options.candidates) {
    const exercise = await prisma.exercise.findFirst({
      where: { id: candidate.exerciseId, deletedAt: null },
      select: { content: true, expectedAnswers: true },
    });
    if (!exercise) continue;

    // The prompt and the answer key both count: a word the learner has to produce is
    // practised at least as hard as one they only read.
    const text = collectText([exercise.content, exercise.expectedAnswers]);

    const wantedVocabulary = new Set<string>();
    for (const word of candidate.words) {
      if (word.surfaces.some((surface) => occursIn(text, surface))) {
        wantedVocabulary.add(word.vocabularyItemId);
      }
    }

    const wantedGrammar = pool.get(candidate.exerciseId) ?? new Set<string>();

    vocabulary += await reconcile(
      prisma,
      options,
      candidate.exerciseId,
      'VOCABULARY_ITEM',
      wantedVocabulary,
    );
    grammar += await reconcile(
      prisma,
      options,
      candidate.exerciseId,
      'GRAMMAR_RULE',
      wantedGrammar,
    );

    if (wantedVocabulary.size === 0 && wantedGrammar.size === 0) unlinked++;
  }

  return { vocabulary, grammar, unlinked };
}

/** Surfaces worth searching for: the lemma plus declared inflections, metadata dropped. */
export function surfacesOf(word: string, grammaticalProperties: unknown): string[] {
  const declared =
    grammaticalProperties !== null && typeof grammaticalProperties === 'object'
      ? Object.values(grammaticalProperties as Record<string, unknown>)
      : [];

  const values = [word, ...declared]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim())
    .filter((v) => !GRAMMAR_METADATA_VALUES.has(v.toLowerCase()))
    .filter((v) => v.length >= MIN_SURFACE_LENGTH);

  return [...new Map(values.map((v) => [v.toLowerCase(), v])).values()];
}

/** `grammarRuleId`s per exercise, straight from the practice pool the author filled. */
async function grammarPool(
  prisma: PrismaClient,
  exerciseIds: string[],
): Promise<Map<string, Set<string>>> {
  const rows = await prisma.grammarRuleExercisePool.findMany({
    where: { exerciseId: { in: exerciseIds } },
    select: { exerciseId: true, grammarRuleId: true },
  });

  const out = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = out.get(row.exerciseId) ?? new Set<string>();
    set.add(row.grammarRuleId);
    out.set(row.exerciseId, set);
  }
  return out;
}

/**
 * The `source` block — a reading passage quoted into the exercise document — is skipped.
 *
 * A comprehension exercise over a text contains every word of that text, and crediting it
 * with all of them would hand the SRS fan-out a rating for thirty words the learner only
 * skimmed. The passage's word-in-context signal is already carried by the lesson's
 * glossary marks; what this graph should say is what the *task* makes the learner do.
 */
const IGNORED_KEYS = new Set(['source']);

/** Every string value in a document, whatever shape the template gave it. */
function collectText(values: unknown[]): string {
  const parts: string[] = [];

  const walk = (value: unknown): void => {
    if (typeof value === 'string') {
      parts.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (value !== null && typeof value === 'object') {
      // Values only: a key like `written` is the schema talking, not the exercise.
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (IGNORED_KEYS.has(key)) continue;
        walk(entry);
      }
    }
  };

  for (const value of values) walk(value);
  return parts.join('\n');
}

/**
 * Whole-word occurrence, with the reader's glossary tokenizer rather than `\b`:
 * `\b` has ASCII semantics and would find «er» inside «hjerte».
 */
function occursIn(text: string, surface: string): boolean {
  const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}])${escaped}(?![\\p{L}\\p{M}\\p{N}])`,
    'iu',
  ).test(text);
}

/** Makes the `PRACTICED_BY` edges of one exercise from one atom type equal to `wanted`. */
async function reconcile(
  prisma: PrismaClient,
  options: AtomLinkOptions,
  exerciseId: string,
  sourceType: 'VOCABULARY_ITEM' | 'GRAMMAR_RULE',
  wanted: Set<string>,
): Promise<number> {
  const existing = await prisma.contentRelation.findMany({
    where: {
      targetType: 'EXERCISE',
      targetId: exerciseId,
      relationKind: 'PRACTICED_BY',
      sourceType,
    },
    select: { id: true, sourceId: true },
  });

  const have = new Set(existing.map((r) => r.sourceId));
  const stale = existing.filter((r) => !wanted.has(r.sourceId)).map((r) => r.id);

  if (stale.length > 0) {
    await prisma.contentRelation.deleteMany({ where: { id: { in: stale } } });
  }

  const missing = [...wanted].filter((sourceId) => !have.has(sourceId));
  if (missing.length > 0) {
    await prisma.contentRelation.createMany({
      data: missing.map((sourceId) => ({
        sourceType,
        sourceId,
        targetType: 'EXERCISE' as const,
        targetId: exerciseId,
        relationKind: 'PRACTICED_BY' as const,
        ownerSchoolId: options.ownerSchoolId,
        createdByUserId: options.createdByUserId,
      })),
      skipDuplicates: true,
    });
  }

  return wanted.size;
}
