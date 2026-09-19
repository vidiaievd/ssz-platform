// Deriving what an exercise trains — plan 55 §3.4.
//
// The decision this file encodes: **the axis is derived, not authored.** 452 seeded
// exercises get their axes for no authoring work at all, and the coverage report is
// truthful on the day it ships. Hand-tagging would mean the report lies until somebody
// tags the catalogue — that is to say, always.
//
// The chain for `skill`, first rung that fires wins outright:
//
//   1. override   — the author said so
//   2. placement  — where the exercise stands in the lesson
//   3. document   — a flag inside the exercise itself
//   4. template   — the table in by-template.ts
//
// Placement outranks the template because of a fact in the schema, not a preference:
// `LessonListeningStage` links a lesson variant to an `Exercise` by foreign key, and an
// exercise standing as a listening stage **is** listening, whatever template sits under
// it. A `short_answer` about a recording is not a reading exercise.
//
// `focus` has its own, shorter chain — override → atoms → template — because placement
// and the document say nothing about the subject. Two chains means two sources reported;
// one combined `source` would have to lie about one of them.

import { templateProfile } from './by-template.js';
import type { Focus, FocusSource, Form, Modality, Skill, SkillSource } from './model.js';
import { isModality, orderFocuses, orderSkills, parseFocuses, parseSkills } from './model.js';

/** How the exercise sits in its lesson. Every field optional: most exercises have none. */
export interface Placement {
  /** Set when the exercise is a stage of an AUDIO lesson (`LessonListeningStage`). */
  listeningStage?: 'gap_fill' | 'comprehension' | null;
  /** Set when the exercise is the comprehension question of a VIDEO lesson. */
  videoQuestion?: boolean;
  /** The kind of the lesson placing it, when known. */
  lessonKind?: 'text' | 'video' | 'audio' | 'live' | null;
}

/**
 * What the author said, if anything.
 *
 * `setAt` is the whole point of the shape: an empty `skills` array with `setAt` set means
 * "this exercise trains nothing I want counted" — a deliberate statement — while an empty
 * array without it means the author never spoke and the chain should carry on. Prisma
 * cannot express a nullable array, so the marker is a separate column (plan 55 §3.5).
 *
 * One marker covers both axes, so **a partial override is not expressible**: speaking
 * about the skill means speaking about the focus too. Deliberate. Two markers would let
 * an exercise sit half-derived and half-declared, and the strip would have to explain a
 * state nobody asked for; the authoring UI writes the pair, and an author who wants the
 * derived focus back copies it into the field it already shows them.
 */
export interface SkillOverride {
  skills?: unknown;
  focus?: unknown;
  /**
   * What the author said about *how* the exercise is answered (plan 63 §2 E).
   *
   * Nothing writes it yet — there is no column for it — and the field is here so that the
   * rung exists in one place when something does. An unrecognised value is ignored rather
   * than trusted, exactly as the two lists above are filtered.
   */
  modality?: unknown;
  setAt?: Date | string | null;
}

export interface AtomRef {
  atomType: string;
  atomId?: string;
  /**
   * Which element of the exercise names this atom, where the catalogue records it
   * (`ExerciseItemTarget.itemKey`). Null for an atom named by the whole exercise, which
   * is all the older `PRACTICED_BY` graph can say.
   *
   * The key is what makes a subject a share rather than a flag: a set of eight questions,
   * three about words and five about a rule, is three-eighths vocabulary — not "both
   * subjects, equally" (plan 64, decision H).
   */
  itemKey?: string | null;
}

export interface DeriveInput {
  templateCode: string;
  /** The persisted `content` document. Read for flags only, never for the key. */
  content?: unknown;
  /** `PRACTICED_BY` atoms, as snapshotted for the attempt event (plan 21 §3). */
  atoms?: readonly AtomRef[];
  placement?: Placement | null;
  override?: SkillOverride | null;
}

/**
 * How much of the exercise each subject accounts for, 0–1 per subject.
 *
 * Shares of *elements*, not of exercises, and they need not sum to 1: an element about a
 * word inside a rule names both subjects and counts in both. Empty whenever the subject
 * did not come from the atom graph — a template's hint is a claim about the type, and
 * weighing it would invent a precision nobody recorded.
 */
export type FocusWeights = Partial<Record<Focus, number>>;

export interface DerivedProfile {
  skills: Skill[];
  focus: Focus[];
  /** Empty unless `focusSource` is `atoms`. See `FocusWeights`. */
  focusWeights: FocusWeights;
  form: Form;
  /** How the learner had to know it — plan 63 §2 E. */
  modality: Modality;
  skillSource: SkillSource;
  focusSource: FocusSource;
  /**
   * Which rung answered the modality. Its own chain — override → document → template —
   * because placement says nothing about how an answer is produced: a `short_answer`
   * standing as a listening stage is heard rather than read, and still written from
   * nothing.
   */
  modalitySource: SkillSource;
}

function hasSpoken(override: SkillOverride | null | undefined): boolean {
  return override?.setAt !== undefined && override?.setAt !== null;
}

/** `listening`, when the exercise stands somewhere that plays a recording. */
function fromPlacement(placement: Placement | null | undefined): Skill[] | null {
  if (!placement) return null;
  if (placement.listeningStage) return ['listening'];
  if (placement.videoQuestion === true) return ['listening'];
  if (placement.lessonKind === 'audio' || placement.lessonKind === 'video') return ['listening'];
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Flags inside the document itself.
 *
 * Two live sources today, and a third arriving with plan 56:
 *
 * - `audio.enabled` — the audio layer of plan 56 turns any exercise into listening. This
 *   is the single point where the two plans meet, and it is read defensively so that it
 *   starts working the moment the field exists, without a change here.
 * - `settings.input` on `word_bank_gap_fill` — `free` means typed from nothing (written
 *   production), `bank` means chosen from a strip (recognition). The template merged two
 *   old types, so the document is the only thing that can tell them apart.
 */
function fromDocument(
  templateCode: string,
  content: unknown,
): { skills: Skill[]; form?: Form; modality?: Modality } | null {
  const doc = record(content);
  if (!doc) return null;

  const audio = record(doc['audio']);
  if (audio?.['enabled'] === true) return { skills: ['listening'] };

  if (templateCode === 'word_bank_gap_fill') {
    const input = record(doc['settings'])?.['input'];
    // Typed from nothing is retrieval; chosen off a strip is recognition. The same flag
    // settles all three columns, which is the whole argument for reading the document
    // here rather than splitting the template back in two.
    if (input === 'free') return { skills: ['written'], form: 'free', modality: 'recall' };
    if (input === 'bank') return { skills: ['reading'], form: 'bank', modality: 'recognition' };
  }

  return null;
}

/**
 * The subject, read off the atom graph.
 *
 * Today this returns nothing for the seeded catalogue: no `ContentRelation` rows are
 * seeded at all, so `practicedAtoms` is empty on every attempt against seeded content.
 * That is not a reason to guess harder in the table — it is the reason the report has an
 * `unknown` bucket, and the reason the grammar-rule pool (audit 34 §5 item 3) matters
 * beyond spaced repetition.
 */
function atomFocus(atom: AtomRef): Focus | null {
  const type = atom.atomType.toLowerCase();
  if (type.includes('grammar')) return 'grammar';
  if (type.includes('word') || type.includes('vocab')) return 'vocabulary';
  return null;
}

function fromAtoms(atoms: readonly AtomRef[] | undefined): Focus[] | null {
  if (!atoms || atoms.length === 0) return null;
  const found = new Set<Focus>();
  for (const atom of atoms) {
    const focus = atomFocus(atom);
    if (focus) found.add(focus);
  }
  return found.size > 0 ? orderFocuses(found) : null;
}

/**
 * The same graph, read by element rather than by exercise.
 *
 * An atom with no `itemKey` stands for the whole exercise and gets a bucket of its own,
 * so a catalogue that predates element-level targets still weighs in at 1 — the older
 * shape says "this exercise is about grammar", which is exactly one element's worth of
 * evidence and should not read as eight.
 */
function weighAtoms(atoms: readonly AtomRef[] | undefined): FocusWeights {
  if (!atoms || atoms.length === 0) return {};

  const byItem = new Map<string, Set<Focus>>();
  for (const atom of atoms) {
    const focus = atomFocus(atom);
    if (!focus) continue;
    const key = atom.itemKey ?? '';
    const bucket = byItem.get(key) ?? new Set<Focus>();
    bucket.add(focus);
    byItem.set(key, bucket);
  }

  if (byItem.size === 0) return {};

  const weights: FocusWeights = {};
  for (const foci of byItem.values()) {
    for (const focus of foci) weights[focus] = (weights[focus] ?? 0) + 1 / byItem.size;
  }
  return weights;
}

export function deriveSkills(input: DeriveInput): DerivedProfile {
  const profile = templateProfile(input.templateCode);
  const document = fromDocument(input.templateCode, input.content);

  // `form` is not part of either chain: it is a property of how the answer is produced,
  // and only the template and the document have anything to say about it.
  const form: Form = document?.form ?? profile?.form ?? 'unknown';

  let skills: Skill[];
  let skillSource: SkillSource;

  if (hasSpoken(input.override)) {
    skills = parseSkills(input.override?.skills);
    skillSource = 'override';
  } else {
    const placed = fromPlacement(input.placement);
    if (placed) {
      skills = orderSkills(placed);
      skillSource = 'placement';
    } else if (document) {
      skills = orderSkills(document.skills);
      skillSource = 'document';
    } else if (profile) {
      skills = orderSkills(profile.skills);
      skillSource = 'template';
    } else {
      skills = [];
      skillSource = 'unknown';
    }
  }

  let focus: Focus[];
  let focusSource: FocusSource;
  let focusWeights: FocusWeights = {};

  if (hasSpoken(input.override)) {
    focus = parseFocuses(input.override?.focus);
    focusSource = 'override';
  } else {
    const fromGraph = fromAtoms(input.atoms);
    if (fromGraph) {
      focus = fromGraph;
      focusSource = 'atoms';
      focusWeights = weighAtoms(input.atoms);
    } else if (profile && profile.focus.length > 0) {
      focus = orderFocuses(profile.focus);
      focusSource = 'template';
    } else {
      focus = [];
      focusSource = 'unknown';
    }
  }

  const overriddenModality = hasSpoken(input.override) && isModality(input.override?.modality);
  const modality: Modality = overriddenModality
    ? (input.override?.modality as Modality)
    : (document?.modality ?? profile?.modality ?? 'unknown');
  const modalitySource: SkillSource = overriddenModality
    ? 'override'
    : document?.modality
      ? 'document'
      : profile?.modality && profile.modality !== 'unknown'
        ? 'template'
        : 'unknown';

  return { skills, focus, focusWeights, form, modality, skillSource, focusSource, modalitySource };
}
