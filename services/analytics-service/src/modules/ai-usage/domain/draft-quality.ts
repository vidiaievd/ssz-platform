import type { AttemptReviewedAiDraft } from '@ssz/contracts';

/** One stored row of `ai_draft_quality_daily`, as the reader needs it. */
export interface DraftQualityRow {
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  reviews: number;
  remarksAccepted: number;
  remarksEdited: number;
  remarksDiscarded: number;
  remarksUntouched: number;
}

/** One model and prompt version over the whole range asked for. */
export interface DraftQualityGroup {
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  reviews: number;
  remarks: { accepted: number; edited: number; discarded: number; untouched: number; total: number };
  /**
   * Share of remarks that reached the student, as written or reworded — `null` with no
   * remarks. Rounded to four places; the counts beside it are the exact figures.
   */
  takenRate: number | null;
}

/**
 * Days folded away: the quality of a model and prompt is read over a period, and the axes
 * it is compared on are exactly agent × model × prompt version (plan 79 §1.5).
 */
export function aggregateDraftQuality(rows: DraftQualityRow[]): DraftQualityGroup[] {
  const groups = new Map<string, DraftQualityGroup>();
  for (const row of rows) {
    const key = JSON.stringify([row.capability, row.modelId, row.promptVersion]);
    let group = groups.get(key);
    if (!group) {
      group = {
        capability: row.capability,
        modelId: row.modelId,
        promptVersion: row.promptVersion,
        reviews: 0,
        remarks: { accepted: 0, edited: 0, discarded: 0, untouched: 0, total: 0 },
        takenRate: null,
      };
      groups.set(key, group);
    }
    group.reviews += row.reviews;
    group.remarks.accepted += row.remarksAccepted;
    group.remarks.edited += row.remarksEdited;
    group.remarks.discarded += row.remarksDiscarded;
    group.remarks.untouched += row.remarksUntouched;
  }

  for (const group of groups.values()) {
    const r = group.remarks;
    r.total = r.accepted + r.edited + r.discarded + r.untouched;
    group.takenRate = r.total === 0 ? null : Math.round(((r.accepted + r.edited) / r.total) * 10_000) / 10_000;
  }
  return [...groups.values()];
}

const COUNT_KEYS = ['accepted', 'edited', 'discarded', 'untouched'] as const;

/** Only what the fold reads is checked: four non-negative integer counts and the axes. */
export function isFoldableDraft(value: unknown): value is AttemptReviewedAiDraft {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Record<string, unknown>;
  const nullableString = (v: unknown) => v === null || typeof v === 'string';
  return (
    typeof draft.capability === 'string' &&
    nullableString(draft.modelId) &&
    nullableString(draft.promptVersion) &&
    COUNT_KEYS.every((key) => Number.isInteger(draft[key]) && (draft[key] as number) >= 0)
  );
}
