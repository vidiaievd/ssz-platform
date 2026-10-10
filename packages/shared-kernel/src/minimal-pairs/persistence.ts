// How a `minimal_pairs` document maps onto the platform's storage (plan 72 §3.1).
//
//   content          → title, language, contrast, instruction; per pair its id, contrast override
//                       and words with their clips; the probe set, feedback and scoring dials
//   expected_answers → per pair, by id: the teacher's note («never shown to the student»)
//
// The words and their clips are the key — which clip is which word — and yet they live in
// `content`: the student never receives this document at all. The projection carries neither,
// and each probe is handed out by the engine (§3.2, §3.6).
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown` and must not
// throw. It coerces and fills defaults, leaving issues.ts to report what is missing.

import type {
  Clip,
  Feedback,
  GlossPolicy,
  MemoryPolicy,
  MinimalPairsContent,
  OptionsMode,
  Pair,
  PlaysPerProbe,
  ProbeSet,
  Provenance,
  Sampling,
  Scoring,
  Sittings,
  SpellingPolicy,
  Word,
} from './model.js';
import {
  DEFAULT_FEEDBACK,
  DEFAULT_SCORING,
  DEFAULT_SET,
  GLOSS_POLICIES,
  MEMORY_POLICIES,
  OPTIONS_MODES,
  PLAYS_PER_PROBE,
  PROBES_INPUT_MAX,
  PROBES_INPUT_MIN,
  PROVENANCES,
  SAMPLINGS,
  SITTINGS,
  SPELLING_POLICIES,
} from './model.js';

export const TEMPLATE_CODE = 'minimal_pairs';

export interface PersistedPair {
  id: string;
  contrastId: string;
  words: Word[];
}

/** The `content` column. Carries no teacher note, by construction. */
export interface PersistedContent {
  title: string;
  language: string;
  contrastId: string;
  instruction: string;
  pairs: PersistedPair[];
  set: ProbeSet;
  feedback: Feedback;
  scoring: Scoring;
}

/** The `expected_answers` column, keyed by pair id so reordering cannot shuffle it. */
export interface PersistedAnswers {
  pairs: Record<string, { note: string }>;
}

export function toContent(ex: MinimalPairsContent): PersistedContent {
  return {
    title: ex.title,
    language: ex.language,
    contrastId: ex.contrastId,
    instruction: ex.instruction,
    pairs: ex.pairs.map((p) => ({
      id: p.id,
      contrastId: p.contrastId,
      words: p.words.map((w) => ({ ...w, clip: { ...w.clip } })),
    })),
    set: { ...ex.set },
    feedback: { ...ex.feedback },
    scoring: { ...ex.scoring },
  };
}

export function toExpectedAnswers(ex: MinimalPairsContent): PersistedAnswers {
  const pairs: PersistedAnswers['pairs'] = {};
  for (const p of ex.pairs) if (p.note.trim() !== '') pairs[p.id] = { note: p.note };
  return { pairs };
}

export function fromPersisted(content: unknown, expectedAnswers: unknown): MinimalPairsContent {
  const c = readContent(content);
  const a = readAnswers(expectedAnswers);
  return {
    ...c,
    pairs: c.pairs.map((p): Pair => ({ ...p, note: a.pairs[p.id]?.note ?? '' })),
  };
}

/** A `minimal_pairs` document can be told from anything else by its shape. */
export function isMinimalPairsDocument(content: unknown): boolean {
  const c = rec(content);
  return Array.isArray(c['pairs']) && typeof c['contrastId'] === 'string';
}

// ── Readers ─────────────────────────────────────────────────────────────────

function rec(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

function readClip(value: unknown): Clip {
  const c = rec(value);
  return {
    assetId: str(c['assetId']),
    fileName: str(c['fileName']),
    durationMs: Math.max(0, Math.round(num(c['durationMs'], 0))),
    provenance: oneOf<Provenance>(c['provenance'], PROVENANCES, 'studio'),
    voice: str(c['voice']),
    dialect: str(c['dialect']),
  };
}

function readWords(value: unknown): Word[] {
  return (Array.isArray(value) ? value : []).flatMap((raw): Word[] => {
    const w = rec(raw);
    const id = str(w['id']);
    if (id === '') return [];
    return [{ id, text: str(w['text']), gloss: str(w['gloss']), ipa: str(w['ipa']), clip: readClip(w['clip']) }];
  });
}

export function readContent(content: unknown): PersistedContent {
  const c = rec(content);
  const s = rec(c['set']);
  const f = rec(c['feedback']);
  const sc = rec(c['scoring']);
  return {
    title: str(c['title']),
    language: str(c['language']),
    contrastId: str(c['contrastId']),
    instruction: str(c['instruction']),
    pairs: (Array.isArray(c['pairs']) ? c['pairs'] : []).flatMap((raw): PersistedPair[] => {
      const p = rec(raw);
      const id = str(p['id']);
      return id === '' ? [] : [{ id, contrastId: str(p['contrastId']), words: readWords(p['words']) }];
    }),
    set: {
      probes: Math.max(
        PROBES_INPUT_MIN,
        Math.min(PROBES_INPUT_MAX, Math.round(num(s['probes'], DEFAULT_SET.probes))),
      ),
      sampling: oneOf<Sampling>(s['sampling'], SAMPLINGS, DEFAULT_SET.sampling),
      allowRepeat: bool(s['allowRepeat'], DEFAULT_SET.allowRepeat),
      maxSameAnswer: Math.max(1, Math.round(num(s['maxSameAnswer'], DEFAULT_SET.maxSameAnswer))),
      options: oneOf<OptionsMode>(s['options'], OPTIONS_MODES, DEFAULT_SET.options),
      shuffleOptions: bool(s['shuffleOptions'], DEFAULT_SET.shuffleOptions),
      playsPerProbe: oneOf<PlaysPerProbe>(s['playsPerProbe'], PLAYS_PER_PROBE, DEFAULT_SET.playsPerProbe),
      autoplay: bool(s['autoplay'], DEFAULT_SET.autoplay),
    },
    feedback: {
      immediate: bool(f['immediate'], DEFAULT_FEEDBACK.immediate),
      abCompare: bool(f['abCompare'], DEFAULT_FEEDBACK.abCompare),
      showSpelling: oneOf<SpellingPolicy>(f['showSpelling'], SPELLING_POLICIES, DEFAULT_FEEDBACK.showSpelling),
      showGloss: oneOf<GlossPolicy>(f['showGloss'], GLOSS_POLICIES, DEFAULT_FEEDBACK.showGloss),
      showIpa: bool(f['showIpa'], DEFAULT_FEEDBACK.showIpa),
      secondChance: bool(f['secondChance'], DEFAULT_FEEDBACK.secondChance),
    },
    scoring: {
      passPct: Math.max(0, Math.min(100, Math.round(num(sc['passPct'], DEFAULT_SCORING.passPct)))),
      memory: oneOf<MemoryPolicy>(sc['memory'], MEMORY_POLICIES, DEFAULT_SCORING.memory),
      logWordExposure: bool(sc['logWordExposure'], DEFAULT_SCORING.logWordExposure),
      attempts: oneOf<Sittings>(sc['attempts'], SITTINGS, DEFAULT_SCORING.attempts),
    },
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const pairs: PersistedAnswers['pairs'] = {};
  for (const [id, raw] of Object.entries(rec(rec(expectedAnswers)['pairs']))) {
    pairs[id] = { note: str(rec(raw)['note']) };
  }
  return { pairs };
}
