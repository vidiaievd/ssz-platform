import { TEMPLATE_CODE as ERROR_CORRECTION } from '@ssz/shared-kernel/error-correction';
import { TEMPLATE_CODE as READ_ALOUD } from '@ssz/shared-kernel/read-aloud';
import { TEMPLATE_CODE as SHORT_ANSWER } from '@ssz/shared-kernel/short-answer';
import type { TranslateType } from '@ssz/shared-kernel/translate';
import { TEMPLATE_CODE as WRITING_TASK } from '@ssz/shared-kernel/writing-task';

const TRANSLATE_CODES: readonly TranslateType[] = ['translate_to_target', 'translate_from_target'];

/** What "check" can do for a template before hand-in (plan 84 §2, Q3). */
export interface PrecheckCapability {
  /** A deterministic reading against the key, free and rationed by the author (`flow.selfCheck`). */
  selfCheck: boolean;
  /** A model may be asked — the school permitting, and only where the key leaves a doubt. */
  ai: boolean;
}

/**
 * The templates "check" exists for, named one by one rather than derived: a template joins
 * when someone decided it should. Everything checked on the client — gaps, choices, pairs —
 * is absent on purpose: its check is already instant, and a rehearsal would hand out the
 * answer. `monologue` / `dialogue` are `read_aloud` modes the subject reads as "AI off"
 * until speech is transcribed and reviewed for grammar (plan 85).
 */
const CAPABILITIES: Readonly<Record<string, PrecheckCapability>> = {
  [ERROR_CORRECTION]: { selfCheck: true, ai: true },
  ...Object.fromEntries(TRANSLATE_CODES.map((code) => [code, { selfCheck: true, ai: true }])),
  [WRITING_TASK]: { selfCheck: false, ai: true },
  [SHORT_ANSWER]: { selfCheck: false, ai: true },
  // `read` mode only: the subject carries `ai.on = false` for any other (`machineCanCheck`).
  [READ_ALOUD]: { selfCheck: false, ai: true },
};

export function precheckCapability(templateCode: string): PrecheckCapability | null {
  return CAPABILITIES[templateCode] ?? null;
}
