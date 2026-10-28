import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { Payer } from '../../../../access/domain/payer.js';
import { AiGateway, type GatewayCall } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import { describeCall } from '../../../application/describe-call.js';
import { LEARNER_LANGUAGE_READER, type ILearnerLanguageReader } from '../../../review-direct/application/ports/learner-language.reader.js';
import { languageName } from '../../../review-draft/domain/comment-language.js';
import {
  SCHOOL_LANGUAGE_READER,
  type ISchoolLanguageReader,
} from '../../../review-draft/application/ports/school-language.reader.js';
import type { AssistAnswer, AssistContext } from '../../domain/assist-answer.js';
import type { AssistPrompt, AssistTurn } from '../../prompts/prompts.js';
import { STUDENT_ASSIST } from '../../student-assist.capability.js';
import { runAssistLoop, UNKNOWN_TARGET, type AssistRoundCaller } from '../assist-loop.js';
import { AssistPayerResolver, type AssistAccessError } from '../assist-payer.resolver.js';
import { assistRefusalOf, type AssistRefusal } from '../assist-refusal.js';
import { AssistToolbox, type AssistToolScope } from '../assist-toolbox.js';
import { COURSE_LANGUAGE_READER, type ICourseLanguageReader } from '../ports/assist-readers.js';
import { AskAssistantCommand } from './ask-assistant.command.js';

/** The ledger's surface of a turn: one per entry point of the client (R-k). */
export const assistSurface = (context: AssistContext): string => `assistant_${context.kind}`;

/** When nothing better is known: the language most of the platform's learners read. */
const DEFAULT_EXPLANATION = 'en';

export { MAX_TOOL_ROUNDS } from '../assist-loop.js';

export type AskAssistantOutcome =
  /** `callId` — the ledger row of the round that answered; feedback (step 7) is given on it. */
  | { kind: 'answered'; callId: string; answer: AssistAnswer; rounds: number }
  /** The learner's request cannot be asked in this context (422 / 404 / 403). No model, no ledger row. */
  | { kind: 'rejected'; error: AssistAccessError }
  /** The gate or the switch said no (409 with `reason`). */
  | { kind: 'refused'; reason: AssistRefusal; callId: string }
  /**
   * No usable answer (R-f — 503, the client behaves as if there were no assistant): every
   * model failed, the answer stayed off-schema after the repair, the tool budget ran out,
   * or what the turn needs could not be read. `cause` is a code, never a text.
   */
  | { kind: 'silent'; cause: string; callId: string | null; rounds: number };

/**
 * One turn of `student_assist` (plan 83, step 4e): who pays and what may be read (step 3) →
 * the agent loop (`runAssistLoop`) with the gateway as its round caller. Every round is a
 * gateway call of its own — gated, routed, recorded and charged — so a quota spent mid-turn
 * refuses the next round like the first.
 *
 * Nothing the learner wrote, nothing a tool returned and nothing a model answered goes to
 * the log (R-j): only codes, counts and ledger ids.
 */
@CommandHandler(AskAssistantCommand)
export class AskAssistantHandler implements ICommandHandler<AskAssistantCommand, AskAssistantOutcome> {
  private readonly logger = new Logger(AskAssistantHandler.name);

  constructor(
    private readonly gateway: AiGateway,
    private readonly access: AssistPayerResolver,
    private readonly toolbox: AssistToolbox,
    @Inject(COURSE_LANGUAGE_READER) private readonly courses: ICourseLanguageReader,
    @Inject(SCHOOL_LANGUAGE_READER) private readonly schools: ISchoolLanguageReader,
    @Inject(LEARNER_LANGUAGE_READER) private readonly learners: ILearnerLanguageReader,
  ) {}

  async execute(command: AskAssistantCommand): Promise<AskAssistantOutcome> {
    const outcome = await this.turn(command);
    const at = 'callId' in outcome && outcome.callId ? ` (call ${outcome.callId})` : '';
    const detail =
      outcome.kind === 'answered'
        ? `${outcome.rounds} round(s)`
        : outcome.kind === 'silent'
          ? `${outcome.cause} after ${outcome.rounds} round(s)`
          : outcome.kind === 'refused'
            ? outcome.reason
            : outcome.error.code;
    this.logger.log(`Assistant turn of ${command.userId} on ${command.context.kind}: ${outcome.kind}, ${detail}${at}`);
    return outcome;
  }

  private async turn(command: AskAssistantCommand): Promise<AskAssistantOutcome> {
    let resolved;
    try {
      resolved = await this.access.resolve({ userId: command.userId, context: command.context });
    } catch (err) {
      this.logger.warn(`Assistant context of ${command.userId} unreadable: ${messageOf(err)}`);
      return { kind: 'silent', cause: 'context_unavailable', callId: null, rounds: 0 };
    }
    if (resolved.isFail) return { kind: 'rejected', error: resolved.error };
    const { payer, context } = resolved.value;

    const { explanation, target } = await this.languages(command.userId, payer, context);
    const prompt: AssistPrompt = {
      targetLanguage: target ? languageName(target) : UNKNOWN_TARGET,
      explanationLanguage: languageName(explanation),
      contextKind: context.kind,
    };
    const tools = this.toolbox.toolsFor(context);
    const turn: AssistTurn = { context, history: command.history, message: command.message, tools };
    const scope: AssistToolScope = { userId: command.userId, context, language: explanation };
    const callContext: CallContext = {
      payer,
      actor: { userId: command.userId, role: 'student' },
      surface: assistSurface(context),
    };

    const round: AssistRoundCaller = async (build, listener) => {
      const call = await this.gateway.call(STUDENT_ASSIST.code, callContext, build, listener);
      const report = describeCall(STUDENT_ASSIST.code, callContext, call);
      if (report.outcome === 'ok') return { kind: 'output', callId: report.callId, output: report.output! };
      const refusal = refusalOf(call);
      if (refusal) return { kind: 'refused', callId: report.callId, reason: refusal };
      if (report.outcome === 'invalid_response') {
        return { kind: 'invalid', callId: report.callId, output: report.output, reason: report.errorMessage };
      }
      return { kind: 'failed', callId: report.callId, code: report.errorCode ?? report.outcome };
    };

    const outcome = await runAssistLoop(round, this.toolbox, { prompt, turn, scope, stream: command.stream });
    switch (outcome.kind) {
      case 'answered':
        return { kind: 'answered', callId: outcome.callId, answer: outcome.answer, rounds: outcome.trace.calls };
      case 'refused':
        return { kind: 'refused', reason: outcome.reason, callId: outcome.callId };
      case 'silent':
        return { kind: 'silent', cause: outcome.cause, callId: outcome.callId, rounds: outcome.trace.calls };
    }
  }

  /**
   * Q5: a school's work is explained in the school's language when it set one, anything else
   * in the learner's `uiLocale`. Both are niceties — an unreadable one falls through, as the
   * course's target language falls back to a description.
   */
  private async languages(
    userId: string,
    payer: Payer,
    context: AssistContext,
  ): Promise<{ explanation: string; target: string | null }> {
    const school = payer.type === 'workspace' ? await this.read('school language', () => this.schools.explanationLanguage(payer.id)) : null;
    const explanation = school ?? (await this.read('learner language', () => this.learners.interfaceLanguage(userId))) ?? DEFAULT_EXPLANATION;
    const target = context.courseId ? await this.read('course language', () => this.courses.targetLanguage(context.courseId!)) : null;
    return { explanation, target };
  }

  private async read(what: string, read: () => Promise<string | null>): Promise<string | null> {
    try {
      return await read();
    } catch (err) {
      this.logger.warn(`Assistant: ${what} unreadable: ${messageOf(err)}`);
      return null;
    }
  }
}

/** The refusal the learner's client is told; null when the call failed rather than was refused. */
function refusalOf({ routed }: GatewayCall): AssistRefusal | null {
  if (routed.isOk) return null;
  const failure = routed.error;
  return failure.kind === 'disabled' || failure.kind === 'refused' ? assistRefusalOf(failure) : null;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
