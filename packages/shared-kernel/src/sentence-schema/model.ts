// Model for the `sentence_schema` exercise — the topological-field board.
//
// Source of truth: docs/design/activity-specs/design_handoff_sentence_schema/README.md
// in ssz-platform-web, as amended by the decisions in docs/plan/52-sentence-schema.md.
//
// The governing idea: **the field set is data, not behaviour.** Nothing here knows about
// Norwegian. A schema is an ordered list of named fields per clause type, seeded from a
// language pack (presets.ts) and freely editable per exercise — so the same runtime
// serves the Norwegian setningsskjema, the German Feldermodell, or three unnamed boxes.
//
// The second rule, from IMPLEMENTATION.md: **never store the key twice.** `row.chunks` is
// the answer key *and* the source of the word bank. There is no separate answer array,
// so there is nothing that can drift out of sync with it.

/**
 * The clause types a schema can describe.
 *
 * Fixed, not data: five is what the handoff draws, the builder shows one toggle chip per
 * type, and every pack supplies a field list for each. A sixth would be a new chip and a
 * new column in every pack — a change to the type, not to content.
 */
export type ClauseId = 'main' | 'sub' | 'yesno' | 'hv' | 'imp';

export const CLAUSE_IDS: readonly ClauseId[] = ['main', 'sub', 'yesno', 'hv', 'imp'];

/**
 * One column of the board.
 *
 * `id` is scoped to the clause type it lives in, and that is the single most consequential
 * fact in this model: `chunk.field` points at a `Field.id` inside `schema[row.clause]`, so
 * changing a row's clause type — or swapping the language pack — invalidates every
 * placement in reach. The kernel clears them and says so; it never tries to remap
 * heuristically (IMPLEMENTATION.md, first pitfall).
 */
export interface Field {
  id: string;
  /** The key shown on the board: "F", "v", "n", "VF", "1". Mono, and deliberately terse. */
  short: string;
  /** "Forfelt", "Finitt verbal". Hidden when `settings.labels` is off. */
  label: string;
  /** One student-facing line. Optional; hidden when `settings.hints` is off. */
  hint: string;
  /** May legitimately stay empty. Drives the `—` in an empty cell and the grading. */
  optional: boolean;
}

/**
 * One draggable piece of the sentence — one word, or several joined into one element.
 *
 * Joining is how "one constituent" gets expressed: `"I" + "morgen" → "I morgen"` is what
 * makes the V2 rule checkable, because the Forfelt holds one *element*, not one word.
 */
export interface Chunk {
  id: string;
  text: string;
  /**
   * The `Field.id` this chunk belongs in. `null` = not placed yet, which is a builder
   * state only: a row with an unplaced chunk is not deliverable and never reaches a
   * student. **This is the answer key** — stripped from the student projection.
   */
  field: string | null;
  /** Other `Field.id`s where this chunk is ALSO accepted. Also the answer key. */
  alt: string[];
}

/** A piece that belongs to no field — a distractor. Always graded wrong. */
export interface Extra {
  id: string;
  text: string;
}

/** One sentence of the set. */
export interface Row {
  id: string;
  clause: ClauseId;
  /**
   * The sentence as the student must end up with it. Chunks are derived from it by
   * whitespace, and placements survive an edit where the text of a token survives
   * (tokenize.ts).
   *
   * **This is answer-bearing** — it is the word order, written out. The runner never
   * renders it (verified against the prototype), so the student projection strips it
   * along with the rest of the key. The handoff's Security section omits it; plan 52
   * §3.2 adds it.
   */
  text: string;
  /**
   * The sentence the student starts from, when the task is "rewrite, then lay out"
   * rather than "lay out". Empty string = a plain layout task.
   *
   * **An extension beyond the handoff** (plan 52 §3.8, decision Q1): every seeded
   * exercise of this type is a transformation, and the model as drawn cannot express
   * one. It is a prompt and nothing else — never tokenized, never banked, never graded.
   * There is a test for exactly that, because deriving chunks from it is the obvious
   * wrong idea for anyone reading the model without this paragraph.
   */
  source: string;
  /** Ordered as in the sentence. Order matters: it is what `strict` grading reads. */
  chunks: Chunk[];
  extras: Extra[];
  /** Why the sentence is built this way. Required to publish — see issues.ts. */
  why: string;
  /** chunkId → explanation shown instead of the default when that chunk lands wrong. */
  fb: Record<string, string>;
}

/** Whether order inside a single field is graded. */
export type OrderMode = 'strict' | 'loose';

/** Whether the first chunk of each row starts on the board. */
export type PrefillMode = 'none' | 'first';

/**
 * Nine switches over one answer key — the same exercise from "heavily scaffolded" to
 * "bare". Ordered here as the builder lists them: strongest support first.
 */
export interface Settings {
  /** Show field names. Off = the short keys only. */
  labels: boolean;
  /** Show the per-field hint under the name. */
  hints: boolean;
  /** Show how many chunks belong in each field. */
  counts: boolean;
  prefill: PrefillMode;
  /**
   * Reserved: "the student must tick fields that stay empty".
   *
   * Declared by the handoff and left unbuilt by it; plan 52 Q6 keeps that. Carried so
   * that building it later needs no migration. **Nothing reads this field.**
   */
  markEmpty: boolean;
  /** Mark each field on check, not only the sentence as a whole. */
  perField: boolean;
  /** From attempt 2, append `row.why` under the feedback. */
  hintAfterMistake: boolean;
  /** Shuffle the bank. Applied in the projection, server-side — never in the runner. */
  shuffle: boolean;
  /** Include `row.extras` in the bank. Off hides them; it never deletes them. */
  extras: boolean;
  order: OrderMode;
  /**
   * Grade the sequence and nothing else: one slot for the whole sentence, no named
   * fields, no claim about which constituent a piece is.
   *
   * A second exercise inside the type rather than a second type. The schema stays in the
   * document untouched — this collapses the board at runtime, so an author can turn it on
   * to drill word order and off again to drill the chart, over the same sentences, without
   * losing the field work in between.
   *
   * It also changes what a row needs to be deliverable: with no fields to place into,
   * writing the sentence is the whole of the authoring. `isDeliverable` takes the flag
   * for that reason.
   */
  orderOnly: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  labels: true,
  hints: false,
  counts: false,
  prefill: 'none',
  markEmpty: false,
  perField: true,
  hintAfterMistake: true,
  shuffle: true,
  extras: true,
  order: 'strict',
  orderOnly: false,
};

/**
 * The one slot a sequence-only exercise is played on.
 *
 * Nameless on purpose: `short` and `label` are empty, so the board draws a bare cell and
 * no head. A learner told to put the words in order should not be reading a field name —
 * that is the very claim this mode is set up to stop making.
 */
export const ORDER_FIELD_ID = '__order__';

export const ORDER_FIELD: Field = {
  id: ORDER_FIELD_ID,
  short: '',
  label: '',
  hint: '',
  optional: false,
};

/** A field list per clause type. Only the clause types in `clauses` are usable. */
export type Schema = Record<ClauseId, Field[]>;

/** The whole document, as the builder edits it. */
export interface SentenceSchemaContent {
  /** Teacher-facing name of the set. */
  title: string;
  /** One line, shown above the board in the runner. */
  instruction: string;
  /**
   * Which language pack the schema was seeded from. **Provenance only** — the schema in
   * the document is authoritative and may have been edited past recognition. A converted
   * exercise with hand-written fields carries `blank` and that is correct.
   */
  presetId: string;
  /** Which clause types are switched on, and so selectable per sentence. */
  clauses: ClauseId[];
  schema: Schema;
  rows: Row[];
  settings: Settings;
}

export function newField(short: string, label: string, hint = '', optional = false): Field {
  return { id: newId(), short, label, hint, optional };
}

export function newChunk(text: string, field: string | null = null): Chunk {
  return { id: newId(), text, field, alt: [] };
}

export function newExtra(text: string): Extra {
  return { id: newId(), text };
}

export function newRow(clause: ClauseId = 'main'): Row {
  return { id: newId(), clause, text: '', source: '', chunks: [], extras: [], why: '', fb: {} };
}

/**
 * An empty document.
 *
 * `title` and `instruction` are empty on purpose: the builder fills them from the
 * author's own locale. A Norwegian literal here would reach a Ukrainian school and an
 * English one too (plan 51 §5, repeated).
 */
export function emptyContent(schema: Schema, presetId: string): SentenceSchemaContent {
  return {
    title: '',
    instruction: '',
    presetId,
    clauses: ['main'],
    schema,
    rows: [newRow()],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * The fields this row is played on.
 *
 * The single place the sequence-only collapse happens. Everything downstream — the
 * projection, both boards, the grader's caller — asks this rather than reading `schema`,
 * so one branch here is the whole of the mode's effect on layout.
 */
export function fieldsFor(content: SentenceSchemaContent, row: Row): Field[] {
  if (content.settings.orderOnly) return [ORDER_FIELD];
  return content.schema[row.clause] ?? [];
}

/**
 * A row is deliverable when it has text, has chunks, and every chunk is placed.
 *
 * Only deliverable rows reach a student. A half-placed row is a normal state of writing,
 * not an error — it blocks assignment, never editing.
 */
export function isDeliverable(row: Row, orderOnly = false): boolean {
  if (row.text.trim() === '' || row.chunks.length === 0) return false;
  // Sequence-only asks nothing of the fields, so a sentence is finished as soon as it is
  // written. Requiring placements there would be asking the author to answer a question
  // the exercise never puts to anybody.
  if (orderOnly) return true;
  return row.chunks.every((c) => c.field !== null);
}

export function deliverableRows(content: SentenceSchemaContent): Row[] {
  return content.rows.filter((row) => isDeliverable(row, content.settings.orderOnly));
}

function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}
