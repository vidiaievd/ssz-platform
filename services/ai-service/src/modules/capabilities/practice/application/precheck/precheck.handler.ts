import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { AiFeedback } from '@ssz/contracts';
import { AiGateway, type GatewayFailureOf } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import {
  SCHOOL_LANGUAGE_READER,
  type ISchoolLanguageReader,
} from '../../../review-draft/application/ports/school-language.reader.js';
import { SchoolPayerResolver } from '../../../review-draft/application/school-payer.resolver.js';
import { toAiFeedback } from '../../domain/practice-feedback.js';
import { PRACTICE } from '../../practice.capability.js';
import { practiceRequest } from '../../prompts/prompts.js';
import { practiceUnaskable, toPracticeSubject } from '../practice-subject.js';
import { PrecheckCommand, type PracticeSubject } from './precheck.command.js';
import type { EngineSubject } from '../../../review-draft/application/ports/review-attempts.client.js';

/** The ledger's surface for rehearsals; what the limits of step 3 count by. */
export const PRECHECK_SURFACE = 'precheck';

/**
 * Why no check was made, on purpose:
 * - `unaskable` — nothing to ask about (`detail`: AI off for the exercise, no aspect, empty answer);
 * - `not_available` — the agent is switched off, or the school may not use it (policy, tariff);
 * - `pool_empty` — the school's `ai.practice` credits for the period are spent;
 * - `template_not_supported` — not a template a rehearsal reads.
 */
export type PrecheckRefusal = 'unaskable' | 'not_available' | 'pool_empty' | 'template_not_supported';

export type PrecheckOutcome =
  | { status: 'ok'; feedback: AiFeedback; aiCallIds: string[] }
  | { status: 'refused'; reason: PrecheckRefusal; detail: string | null }
  /** A model was wanted and none answered usably; the call ids, for the log. */
  | { status: 'failed'; errorCode: string; aiCallIds: string[] };

/**
 * A rehearsal before hand-in (plan 84, step 2): work in progress, sent by exercise-engine,
 * → the gateway under the school's `ai.practice` (surface `precheck`) → hints in the
 * `AiFeedback` shape, straight back to the caller. Nothing is written anywhere but the
 * ledger: the attempt stays in progress, no event, no verdict — the hand-in is the only
 * thing that counts (§3, rule 1).
 *
 * Whether the school lets its learners rehearse at all, and with which limits, is the
 * engine's to read; the gate here still checks the school's tariff and policy.
 */
@CommandHandler(PrecheckCommand)
export class PrecheckHandler implements ICommandHandler<PrecheckCommand, PrecheckOutcome> {
  private readonly logger = new Logger(PrecheckHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    private readonly schoolPayers: SchoolPayerResolver,
    @Inject(SCHOOL_LANGUAGE_READER) private readonly schools: ISchoolLanguageReader,
  ) {}

  async execute({ request }: PrecheckCommand): Promise<PrecheckOutcome> {
    const { subject } = request;
    if (!isTextSubject(subject)) return refused('template_not_supported', String((subject as { template?: unknown }).template));

    const unasked = practiceUnaskable(subject);
    if (unasked) return refused('unaskable', unasked);

    const prepared = toPracticeSubject(subject, await this.schoolLanguage(request.schoolId));
    const context: CallContext = {
      payer: await this.schoolPayers.resolve({ schoolId: request.schoolId }),
      actor: { userId: request.userId, role: 'student' },
      surface: PRECHECK_SURFACE,
    };
    const call = await this.gateway.call(PRACTICE.code, context, (promptVersion) => practiceRequest(promptVersion, prepared));
    const callIds = [call.recorded.callId];

    if (call.routed.isFail) return notAnswered(call.routed.error, callIds);
    const { output } = call.routed.value.result;
    if (output.kind !== 'structured') return { status: 'failed', errorCode: 'invalid_response', aiCallIds: callIds };
    return { status: 'ok', feedback: toAiFeedback(output.data, prepared.input), aiCallIds: callIds };
  }

  /** A nicety, as for the draft: unreadable → the exercise's own label. */
  private async schoolLanguage(schoolId: string): Promise<string | null> {
    try {
      return await this.schools.explanationLanguage(schoolId);
    } catch (err) {
      this.logger.warn(`Explanation language of school ${schoolId} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

const TEXT_TEMPLATES: ReadonlySet<string> = new Set<EngineSubject['template']>(['translate', 'error_correction', 'writing_task', 'short_answer']);

/** The subject's shape is the engine's and is not validated at the door: the template is checked here. */
function isTextSubject(subject: PracticeSubject): subject is EngineSubject {
  return TEXT_TEMPLATES.has(subject.template);
}

function refused(reason: PrecheckRefusal, detail: string | null): PrecheckOutcome {
  return { status: 'refused', reason, detail };
}

/** A call that reached no usable answer: refused on purpose, or failed. */
export function notAnswered<R>(failure: GatewayFailureOf<R>, aiCallIds: string[]): PrecheckOutcome {
  switch (failure.kind) {
    case 'disabled':
      return refused('not_available', 'disabled');
    case 'refused':
      return failure.code === 'quota_exhausted' ? refused('pool_empty', null) : refused('not_available', failure.code);
    case 'gate_unavailable':
    case 'unavailable':
      return { status: 'failed', errorCode: failure.kind, aiCallIds };
    case 'error':
      return { status: 'failed', errorCode: failure.error.code, aiCallIds };
  }
}
