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

/**
 * Where a template keeps a clip **of its own** on each item — plan 56 phase 6.
 *
 * Only `translate` has one, and it predates this layer: plan 42 gave every sentence its
 * own recording because the sentences come from different sources, which is a shape one
 * clip with timecodes cannot express. Phase 6 does not delete it and does not set a
 * second control beside it — it becomes the fourth `AudioSource` (`items`), so the
 * teacher makes one decision and the rules for hearing apply either way.
 *
 * A template absent from this table simply cannot have per-item clips, and `source:
 * 'items'` on one is an exercise with nothing to play — which is the blocker it should be.
 */
const ITEM_CLIP_KEY: Record<string, string> = {
  translate_to_target: 'mediaId',
  translate_from_target: 'mediaId',
};

export interface IdentifiedItem {
  id: string;
  audio?: unknown;
  /**
   * The item's own recording, for a template that keeps one (`source: 'items'`).
   *
   * Read off the template's own field by `itemsOf`, so that nothing downstream has to
   * know that `translate` spells it `mediaId`.
   */
  clip?: string;
}

/** Which field of the document holds its items, or `null` for a template with none. */
export function itemKey(templateCode: string): string | null {
  return ITEM_KEY[templateCode] ?? null;
}

/** The items of a document, as far as the audio layer is concerned. */
export function itemsOf(templateCode: string, content: unknown): IdentifiedItem[] {
  const key = ITEM_KEY[templateCode];
  if (key === undefined || typeof content !== 'object' || content === null) return [];

  const items = (content as Record<string, unknown>)[key];
  if (!Array.isArray(items)) return [];

  const clipKey = ITEM_CLIP_KEY[templateCode];

  return items.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record['id'] !== 'string') return [];

    // Spread rather than cast: the clip is read off a field whose name belongs to the
    // template, and this is the one module allowed to know that name.
    const clip = clipKey === undefined ? undefined : record[clipKey];
    return [
      {
        ...(item as IdentifiedItem),
        ...(typeof clip === 'string' && clip !== '' ? { clip } : {}),
      },
    ];
  });
}

/** Whether this template can hold a clip on each item at all. */
export function hasItemClips(templateCode: string): boolean {
  return ITEM_CLIP_KEY[templateCode] !== undefined;
}
