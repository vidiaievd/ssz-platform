import {
  fromPersisted,
  readEdits,
  selfCheckFeedback,
  TEMPLATE_CODE,
} from '@ssz/shared-kernel/error-correction';
import type { SelfCheckItem, StudentEdits } from '@ssz/shared-kernel/error-correction';
import {
  fromPersisted as trFromPersisted,
  readSubmission as trReadSubmission,
  runItems as trRunItems,
  selfCheckFeedback as trSelfCheckFeedback,
} from '@ssz/shared-kernel/translate';
import type { SelfCheckItem as TrSelfCheckItem } from '@ssz/shared-kernel/translate';

/*
  The deterministic self-check of the two templates that have one — a reading of the draft
  against the answer key, no model. Shared by `self-check` and by the check before hand-in
  (plan 84, step 5), which runs it first and asks a model only where the key leaves a doubt.
*/

/**
 * What one self-check reports, which is template-specific: error correction counts
 * mistakes reached, translate scores each sentence against the key it must not show.
 * The envelope — whose attempt, and how many checks are left — is common.
 */
export type SelfCheckPayload =
  | {
      templateCode: typeof TEMPLATE_CODE;
      items: SelfCheckItem[];
      fixedCount: number;
      spanCount: number;
    }
  | {
      templateCode: 'translate_to_target' | 'translate_from_target';
      items: TrSelfCheckItem[];
      /** Sentences a hit on the key would close on its own, as things stand. */
      passing: number;
    };

/** The budget for this exercise, and what the check has to say. */
export interface Graded {
  budget: number;
  payload: SelfCheckPayload;
}

export function gradeErrorCorrection(
  envelope: {
    id: string;
    moduleId: string;
    title: string;
    instructions: string;
    updatedAt: string;
  },
  content: unknown,
  expectedAnswers: unknown,
  edits: Record<string, StudentEdits>,
): Graded {
  const document = fromPersisted(envelope, content, expectedAnswers);
  const items = document.items.filter((item) => item.wrong.trim() !== '');
  const feedback = selfCheckFeedback(
    { items, check: document.check, hints: document.hints },
    edits,
  );

  return {
    // `check.on` off means the author wanted no machine reading of this exercise at all.
    // A self-check would be exactly that, one item at a time.
    budget: document.check.on ? document.flow.selfCheck : 0,
    payload: {
      templateCode: TEMPLATE_CODE,
      items: feedback.items,
      fixedCount: feedback.fixedCount,
      spanCount: feedback.spanCount,
    },
  };
}

export function gradeTranslate(
  templateCode: 'translate_to_target' | 'translate_from_target',
  envelope: {
    id: string;
    moduleId: string;
    title: string;
    instructions: string;
    updatedAt: string;
  },
  content: unknown,
  expectedAnswers: unknown,
  answers: Record<string, string>,
): Graded {
  const document = trFromPersisted(envelope, templateCode, content, expectedAnswers);
  const items = trRunItems(document);
  const feedback = trSelfCheckFeedback(
    { items, check: document.check, flow: document.flow },
    answers,
  );

  return {
    budget: document.check.on ? document.flow.selfCheck : 0,
    payload: { templateCode, items: feedback.items, passing: feedback.passing },
  };
}

/**
 * The draft arrives in the shape a submission uses, because it is one — the same edits,
 * asked about early. Kept lenient about the edits themselves (`readEdits` coerces) and
 * strict about the envelope, where a bad shape is a client bug rather than a bad answer.
 */
export function readEcDraft(draft: unknown): Record<string, StudentEdits> | null {
  if (typeof draft !== 'object' || draft === null || Array.isArray(draft)) return null;

  const { items } = draft as { items?: unknown };
  if (typeof items !== 'object' || items === null || Array.isArray(items)) return null;

  const out: Record<string, StudentEdits> = {};
  for (const [itemId, raw] of Object.entries(items)) {
    out[itemId] = readEdits(raw);
  }
  return out;
}

/** The same, for translate: the sentences typed so far, in the shape a submission uses. */
export function readTrDraft(draft: unknown): Record<string, string> | null {
  const list = Array.isArray(draft)
    ? draft
    : typeof draft === 'object' && draft !== null
      ? (draft as { answers?: unknown }).answers
      : undefined;

  if (!Array.isArray(list)) return null;
  return trReadSubmission(list);
}

/**
 * Whether the key alone settles the draft, so a model has nothing to add (plan 84 §2, Q1):
 * every mistake corrected with no edit where there was none, or every sentence a hit on an
 * accepted translation. A sentence with no key to compare against (`noref`) is a doubt.
 */
export function keySettles(payload: SelfCheckPayload): boolean {
  if (payload.templateCode === TEMPLATE_CODE) {
    return payload.spanCount > 0 && payload.fixedCount === payload.spanCount && payload.items.every((item) => item.strayEdits === 0);
  }
  return payload.items.length > 0 && payload.passing === payload.items.length;
}
