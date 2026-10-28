import type { AiAssistFeedbackPayload } from '@ssz/contracts';

/** One stored row of `ai_assist_quality_daily`, as the reader needs it. */
export interface AssistQualityRow {
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  helpful: number;
  notHelpful: number;
  withReason: number;
}

/** One model and prompt version of the assistant over the whole range asked for (plan 83, step 7). */
export interface AssistQualityGroup {
  capability: string;
  modelId: string | null;
  promptVersion: string | null;
  helpful: number;
  notHelpful: number;
  /** Marks either way the learner wrote a reason beside. */
  withReason: number;
  /** Share of marks that said «helpful», four places; null with no marks. */
  helpfulRate: number | null;
}

/** Days folded away: quality is compared per agent × model × prompt version, as for drafts. */
export function aggregateAssistQuality(rows: AssistQualityRow[]): AssistQualityGroup[] {
  const groups = new Map<string, AssistQualityGroup>();
  for (const row of rows) {
    const key = JSON.stringify([row.capability, row.modelId, row.promptVersion]);
    let group = groups.get(key);
    if (!group) {
      group = {
        capability: row.capability,
        modelId: row.modelId,
        promptVersion: row.promptVersion,
        helpful: 0,
        notHelpful: 0,
        withReason: 0,
        helpfulRate: null,
      };
      groups.set(key, group);
    }
    group.helpful += row.helpful;
    group.notHelpful += row.notHelpful;
    group.withReason += row.withReason;
  }

  for (const group of groups.values()) {
    const marks = group.helpful + group.notHelpful;
    group.helpfulRate = marks === 0 ? null : Math.round((group.helpful / marks) * 10_000) / 10_000;
  }
  return [...groups.values()];
}

/** Only what the fold reads is checked: the axes, the two flags and the answer's day. */
export function isFoldableAssistFeedback(value: unknown): value is AiAssistFeedbackPayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  const nullableString = (v: unknown) => v === null || typeof v === 'string';
  return (
    typeof p.capability === 'string' &&
    nullableString(p.modelId) &&
    nullableString(p.promptVersion) &&
    typeof p.helpful === 'boolean' &&
    typeof p.reasonGiven === 'boolean' &&
    typeof p.answeredAt === 'string' &&
    !Number.isNaN(Date.parse(p.answeredAt))
  );
}
