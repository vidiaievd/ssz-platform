// Where each template keeps the things a timecode can hang on — plan 56.
//
// The rest of this module is written against "an item", which is what lets one
// implementation serve all thirteen templates. This is the one place that has to know
// more than that, and it is deliberately the only one: the projection needs it to carry
// the timecodes past a per-template projection that would drop them, and the publish
// preflight needs it to find the timecodes worth warning about.
//
// A template missing from the table is not an oversight. `writing_task` has nothing to
// time — its audio is stimulus, not an item — and the two retired forms have no builder
// to write timecodes with. They get the exercise-level rules and nothing else, which is
// all they can fail.

const ITEM_KEY: Record<string, string> = {
  multiple_choice: 'questions',
  multiple_choice_group: 'rows',
  word_bank_gap_fill: 'sentences',
  text_order: 'items',
  error_correction: 'items',
  match_pairs: 'pairs',
  short_answer: 'questions',
  sentence_schema: 'rows',
  translate_to_target: 'items',
  translate_from_target: 'items',
};

export interface IdentifiedItem {
  id: string;
  audio?: unknown;
}

/** The items of a document, as far as the audio layer is concerned. */
export function itemsOf(templateCode: string, content: unknown): IdentifiedItem[] {
  const key = ITEM_KEY[templateCode];
  if (key === undefined || typeof content !== 'object' || content === null) return [];

  const items = (content as Record<string, unknown>)[key];
  if (!Array.isArray(items)) return [];

  return items.flatMap((item) =>
    typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string'
      ? [item as IdentifiedItem]
      : [],
  );
}
