// How a `read_aloud` document maps onto the platform's storage (plan 70 §3.1).
//
//   content          → title, instruction, language, mode; per prompt its id, label, the material
//                       of every mode and the three numbers; per criterion its id, name,
//                       description, weight and visibility; the recording dials, settings and the
//                       AI stage
//   expected_answers → per prompt, by id: the listening note and the focus words; per criterion,
//                       by id: the four level descriptors
//
// The model comment of the handoff: «Rubric level descriptors and the teacher's listening notes
// live in expected_answers and reach the student only in the verdict.» Focus words go with them —
// README: «the student sees them only in the feedback».
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown` and must not throw.
// It coerces and fills defaults, leaving issues.ts to report what is missing.

import type {
  AiVisibility,
  Criterion,
  FocusWord,
  Mode,
  PlanPoint,
  Prompt,
  ReadAloudContent,
  Recording,
  RevisionPolicy,
  Review,
  Settings,
  ShowModelPolicy,
  ShowRubricPolicy,
} from './model.js';
import {
  AI_VISIBILITIES,
  DEFAULT_RECORDING,
  DEFAULT_REVIEW,
  DEFAULT_SETTINGS,
  isMode,
  LEN,
  RA_MAX_PREP_SECONDS,
  RA_MAX_TAKES,
  REVISIONS,
  SHOW_MODEL,
  SHOW_RUBRIC,
} from './model.js';

export const TEMPLATE_CODE = 'read_aloud';

export interface PersistedPrompt {
  id: string;
  label: string;
  text: string;
  image: { assetId: string; caption: string; alt: string };
  plan: PlanPoint[];
  turn: { situation: string; partner: string };
  minSeconds: number;
  maxSeconds: number;
  prepSeconds: number;
}

export interface PersistedCriterion {
  id: string;
  name: string;
  desc: string;
  weight: 1 | 2;
  studentVisible: boolean;
}

/** The `content` column. Carries no note, no focus word and no descriptor, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  language: string;
  mode: Mode;
  prompts: PersistedPrompt[];
  rubric: PersistedCriterion[];
  recording: Recording;
  settings: Settings;
  review: Review;
}

export interface PersistedPromptKey {
  note: string;
  focus: FocusWord[];
}

/** The `expected_answers` column, keyed by id so reordering cannot shuffle it. */
export interface PersistedAnswers {
  prompts: Record<string, PersistedPromptKey>;
  rubric: Record<string, { levels: [string, string, string, string] }>;
}

export function toContent(ex: ReadAloudContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    language: ex.language,
    mode: ex.mode,
    prompts: ex.prompts.map((p) => ({
      id: p.id,
      label: p.label,
      text: p.text,
      image: { ...p.image },
      plan: p.plan.map((x) => ({ ...x })),
      turn: { ...p.turn },
      minSeconds: p.minSeconds,
      maxSeconds: p.maxSeconds,
      prepSeconds: p.prepSeconds,
    })),
    rubric: ex.rubric.map((c) => ({
      id: c.id,
      name: c.name,
      desc: c.desc,
      weight: c.weight,
      studentVisible: c.studentVisible,
    })),
    recording: { ...ex.recording },
    settings: { ...ex.settings },
    review: { ...ex.review, ai: { ...ex.review.ai } },
  };
}

export function toExpectedAnswers(ex: ReadAloudContent): PersistedAnswers {
  const prompts: PersistedAnswers['prompts'] = {};
  for (const p of ex.prompts) {
    prompts[p.id] = { note: p.note, focus: p.focus.map((f) => ({ ...f })) };
  }
  const rubric: PersistedAnswers['rubric'] = {};
  for (const c of ex.rubric) rubric[c.id] = { levels: [...c.levels] as [string, string, string, string] };
  return { prompts, rubric };
}

export function fromPersisted(content: unknown, expectedAnswers: unknown): ReadAloudContent {
  const c = readContent(content);
  const a = readAnswers(expectedAnswers);
  return {
    title: c.title,
    instruction: c.instruction,
    language: c.language,
    mode: c.mode,
    prompts: c.prompts.map(
      (p): Prompt => ({
        ...p,
        note: a.prompts[p.id]?.note ?? '',
        focus: a.prompts[p.id]?.focus ?? [],
      }),
    ),
    rubric: c.rubric.map(
      (r): Criterion => ({
        ...r,
        levels: a.rubric[r.id]?.levels ?? ['', '', '', ''],
      }),
    ),
    recording: c.recording,
    settings: c.settings,
    review: c.review,
  };
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

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function seconds(value: unknown, fallback: number, max = Infinity): number {
  return Math.min(max, Math.max(0, Math.round(num(value, fallback))));
}

export function readContent(content: unknown): PersistedContent {
  const c = rec(content);
  const mode: Mode = isMode(c['mode']) ? c['mode'] : 'read';
  const len = LEN[mode];
  const prompts = (Array.isArray(c['prompts']) ? c['prompts'] : []).flatMap(
    (raw): PersistedPrompt[] => {
      const p = rec(raw);
      const id = str(p['id']);
      if (id === '') return [];
      const image = rec(p['image']);
      const turn = rec(p['turn']);
      return [
        {
          id,
          label: str(p['label']),
          text: str(p['text']),
          image: { assetId: str(image['assetId']), caption: str(image['caption']), alt: str(image['alt']) },
          plan: (Array.isArray(p['plan']) ? p['plan'] : []).flatMap((x): PlanPoint[] => {
            const point = rec(x);
            const pid = str(point['id']);
            return pid === ''
              ? []
              : [{ id: pid, text: str(point['text']), required: bool(point['required'], true) }];
          }),
          turn: { situation: str(turn['situation']), partner: str(turn['partner']) },
          minSeconds: seconds(p['minSeconds'], len.min),
          maxSeconds: seconds(p['maxSeconds'], len.max),
          prepSeconds: seconds(p['prepSeconds'], len.prep, RA_MAX_PREP_SECONDS),
        },
      ];
    },
  );
  const rubric = (Array.isArray(c['rubric']) ? c['rubric'] : []).flatMap(
    (raw): PersistedCriterion[] => {
      const r = rec(raw);
      const id = str(r['id']);
      if (id === '') return [];
      return [
        {
          id,
          name: str(r['name']),
          desc: str(r['desc']),
          weight: r['weight'] === 2 ? 2 : 1,
          studentVisible: bool(r['studentVisible'], true),
        },
      ];
    },
  );
  const recording = rec(c['recording']);
  const settings = rec(c['settings']);
  const review = rec(c['review']);
  const ai = rec(review['ai']);
  return {
    title: str(c['title']),
    instruction: str(c['instruction']),
    language: str(c['language']),
    mode,
    prompts,
    rubric,
    recording: {
      takes: Math.min(RA_MAX_TAKES, Math.max(1, Math.round(num(recording['takes'], DEFAULT_RECORDING.takes)))),
      chooseBest: bool(recording['chooseBest'], DEFAULT_RECORDING.chooseBest),
      listenBack: bool(recording['listenBack'], DEFAULT_RECORDING.listenBack),
      countdown: bool(recording['countdown'], DEFAULT_RECORDING.countdown),
      micCheck: bool(recording['micCheck'], DEFAULT_RECORDING.micCheck),
      keepAllTakes: bool(recording['keepAllTakes'], DEFAULT_RECORDING.keepAllTakes),
    },
    settings: {
      passScore: Math.max(0, Math.round(num(settings['passScore'], DEFAULT_SETTINGS.passScore))),
      showRubric: oneOf<ShowRubricPolicy>(settings['showRubric'], SHOW_RUBRIC, DEFAULT_SETTINGS.showRubric),
      showModel: oneOf<ShowModelPolicy>(settings['showModel'], SHOW_MODEL, DEFAULT_SETTINGS.showModel),
      revision: oneOf<RevisionPolicy>(settings['revision'], REVISIONS, DEFAULT_SETTINGS.revision),
    },
    review: {
      aiStage: bool(review['aiStage'], DEFAULT_REVIEW.aiStage),
      ai: {
        transcript: bool(ai['transcript'], DEFAULT_REVIEW.ai.transcript),
        pronunciation: bool(ai['pronunciation'], DEFAULT_REVIEW.ai.pronunciation),
        fluency: bool(ai['fluency'], DEFAULT_REVIEW.ai.fluency),
        draft: bool(ai['draft'], DEFAULT_REVIEW.ai.draft),
      },
      aiVisibility: oneOf<AiVisibility>(review['aiVisibility'], AI_VISIBILITIES, DEFAULT_REVIEW.aiVisibility),
    },
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const a = rec(expectedAnswers);
  const prompts: PersistedAnswers['prompts'] = {};
  for (const [id, raw] of Object.entries(rec(a['prompts']))) {
    const p = rec(raw);
    prompts[id] = {
      note: str(p['note']),
      focus: (Array.isArray(p['focus']) ? p['focus'] : []).flatMap((x): FocusWord[] => {
        const f = rec(x);
        const fid = str(f['id']);
        const word = str(f['word']);
        return fid === '' || word === '' ? [] : [{ id: fid, word, note: str(f['note']) }];
      }),
    };
  }
  const rubric: PersistedAnswers['rubric'] = {};
  for (const [id, raw] of Object.entries(rec(a['rubric']))) {
    const levels = Array.isArray(rec(raw)['levels']) ? (rec(raw)['levels'] as unknown[]) : [];
    rubric[id] = { levels: [str(levels[0]), str(levels[1]), str(levels[2]), str(levels[3])] };
  }
  return { prompts, rubric };
}
