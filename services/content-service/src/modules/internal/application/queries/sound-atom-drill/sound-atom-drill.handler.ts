import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import {
  CACHE_SERVICE,
  type ICacheService,
} from '../../../../../shared/application/ports/cache.port.js';
import { GetSoundAtomDrillQuery } from './sound-atom-drill.query.js';

/** The platform's reference clip of a word (media-service `reference_clip`, plan 88). */
export interface DrillReference {
  assetId: string;
  /** The lexicon's toneme the clip was checked against; null on a word without one. */
  tone: 1 | 2 | null;
}

export interface DrillWord {
  word: string;
  reference: DrillReference;
}

export interface DrillPhrase {
  text: string;
  /** The words holding the sound — what the take is judged on; a clip where one was made. */
  carriers: Array<{ word: string; reference: DrillReference | null }>;
  /** `<exercise key>:<prompt id>` of the course line. */
  source: string;
}

export interface SoundAtomDrillEntry {
  atomId: string;
  family: string;
  /** Carrier words with a reference clip, in the data's order; the rest are left out. */
  words: DrillWord[];
  /** Length or toneme pairs where both words have a clip; empty for the other families. */
  pairs: Array<[DrillWord, DrillWord]>;
  phrases: DrillPhrase[];
}

export interface SoundAtomDrillSet {
  language: string;
  atoms: SoundAtomDrillEntry[];
  /**
   * The cold start (§5.5a): one word per scored family of the language, in catalogue order,
   * whatever `atomIds` asked. A family whose word has no clip is missing.
   */
  diagnostic: Array<{ atomId: string; word: DrillWord }>;
}

/** Ten minutes, as the catalogue: the rows change only by a seed or the reference script. */
const DRILL_TTL_SECONDS = 10 * 60;

const cacheKey = (language: string) => `content:sound-atom-drill:${language}`;

interface StoredPhrase {
  text: string;
  carriers: string[];
  source: string;
}

/** Clips are looked up by the word in lower case — the reference script stores them so. */
const keyOf = (word: string) => word.toLowerCase();

/**
 * What a pronunciation session drills each scored sound with (plan 86, step 13.2, Q29–Q31):
 * carrier words and pairs said against a reference clip, the course's short lines, and the
 * cold-start list. Only words with a clip are offered — without a model to hear, the learner
 * has nothing to imitate (Q30 A); a phrase has no clip of its own (Q26), its carriers may.
 * The whole language is cached once and sliced per request.
 */
@QueryHandler(GetSoundAtomDrillQuery)
export class GetSoundAtomDrillHandler implements IQueryHandler<
  GetSoundAtomDrillQuery,
  SoundAtomDrillSet
> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async execute(query: GetSoundAtomDrillQuery): Promise<SoundAtomDrillSet> {
    const all = await this.load(query.language.toLowerCase());
    if (query.atomIds.length === 0) return all;
    const wanted = new Set(query.atomIds);
    return { ...all, atoms: all.atoms.filter((a) => wanted.has(a.atomId)) };
  }

  private async load(language: string): Promise<SoundAtomDrillSet> {
    const key = cacheKey(language);
    const cached = await this.cache.get<SoundAtomDrillSet>(key);
    if (cached !== null) return cached;

    const rows = await this.prisma.soundAtom.findMany({
      where: { language, scored: true },
      orderBy: { position: 'asc' },
      include: { drill: true },
    });
    const drills = rows.flatMap((row) => (row.drill ? [{ row, drill: row.drill }] : []));

    const words = new Set<string>();
    for (const { drill } of drills) {
      drill.words.forEach((w) => words.add(keyOf(w)));
      pairsOf(drill.pairs)
        .flat()
        .forEach((w) => words.add(keyOf(w)));
      words.add(keyOf(drill.diagnostic));
      phrasesOf(drill.phrases).forEach((p) => p.carriers.forEach((w) => words.add(keyOf(w))));
    }
    const clips =
      words.size === 0
        ? []
        : await this.prisma.soundReferenceClip.findMany({
            where: { language, word: { in: [...words] }, assetId: { not: null } },
          });
    const references = new Map(
      clips.map((c) => [c.word, { assetId: c.assetId!, tone: toTone(c.tone) }]),
    );
    const said = (word: string): DrillWord | null => {
      const reference = references.get(keyOf(word));
      return reference ? { word, reference } : null;
    };

    const set: SoundAtomDrillSet = {
      language,
      atoms: drills.map(({ row, drill }) => ({
        atomId: row.id,
        family: row.family,
        words: drill.words.flatMap((w) => {
          const word = said(w);
          return word ? [word] : [];
        }),
        pairs: pairsOf(drill.pairs).flatMap(([a, b]): Array<[DrillWord, DrillWord]> => {
          const first = said(a);
          const second = said(b);
          return first && second ? [[first, second]] : [];
        }),
        phrases: phrasesOf(drill.phrases).map((p) => ({
          text: p.text,
          carriers: p.carriers.map((w) => ({
            word: w,
            reference: references.get(keyOf(w)) ?? null,
          })),
          source: p.source,
        })),
      })),
      diagnostic: drills.flatMap(({ row, drill }) => {
        const word = said(drill.diagnostic);
        return word ? [{ atomId: row.id, word }] : [];
      }),
    };
    await this.cache.set(key, set, DRILL_TTL_SECONDS);
    return set;
  }
}

function toTone(tone: number | null): 1 | 2 | null {
  return tone === 1 || tone === 2 ? tone : null;
}

/** The stored pairs, shape-checked: a JSON column is not trusted to be what the seed wrote. */
function pairsOf(json: unknown): Array<[string, string]> {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (p): p is [string, string] =>
      Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string',
  );
}

function phrasesOf(json: unknown): StoredPhrase[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (p): p is StoredPhrase =>
      typeof p === 'object' &&
      p !== null &&
      typeof p.text === 'string' &&
      typeof p.source === 'string' &&
      Array.isArray(p.carriers) &&
      p.carriers.every((w: unknown) => typeof w === 'string'),
  );
}
