import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { Payer } from '../../../../access/domain/payer.js';
import type { RefusalCode } from '../../../../access/domain/refusal.js';
import { AiGateway, type GatewayCall } from '../../../../gateway/application/ai-gateway.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import type { LlmMessage } from '../../../../providers/domain/llm-request.js';
import type { LlmOutput } from '../../../../providers/domain/llm-result.js';
import { assistantToolTurn, toolResultsTurn, type LlmToolOutcome } from '../../../../providers/domain/llm-turns.js';
import { describeCall } from '../../../application/describe-call.js';
import { LEARNER_LANGUAGE_READER, type ILearnerLanguageReader } from '../../../review-direct/application/ports/learner-language.reader.js';
import { languageName } from '../../../review-draft/domain/comment-language.js';
import {
  SCHOOL_LANGUAGE_READER,
  type ISchoolLanguageReader,
} from '../../../review-draft/application/ports/school-language.reader.js';
import { toAssistAnswer, type AssistAnswer, type AssistContext, type AssistEvidence, type AssistSource } from '../../domain/assist-answer.js';
import { assistRequest, type AssistPrompt, type AssistTurn } from '../../prompts/prompts.js';
import { STUDENT_ASSIST } from '../../student-assist.capability.js';
import { AssistPayerResolver, type AssistAccessError } from '../assist-payer.resolver.js';
import { AssistToolbox, type AssistToolScope } from '../assist-toolbox.js';
import { COURSE_LANGUAGE_READER, type ICourseLanguageReader } from '../ports/assist-readers.js';
import { AskAssistantCommand } from './ask-assistant.command.js';

/** Q4: tool rounds in one turn; the answer after the last one is a round of its own. */
export const MAX_TOOL_ROUNDS = 4;

/** The ledger's surface of a turn: one per entry point of the client (R-k). */
export const assistSurface = (context: AssistContext): string => `assistant_${context.kind}`;

/** Why the assistant is not there for this payer (§3's 409 `reason`). */
export type AssistRefusal = 'no_key' | 'policy' | 'quota' | 'disabled' | 'no_binding';

const REFUSAL_REASON: Record<RefusalCode, AssistRefusal> = {
  ai_disabled: 'policy',
  region_not_allowed: 'policy',
  not_entitled: 'no_key',
  quota_exhausted: 'quota',
};

/** When nothing better is known: the language most of the platform's learners read. */
const DEFAULT_EXPLANATION = 'en';
const UNKNOWN_TARGET = 'the language they are learning';

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
 * the request (step 1's prompt, the context's tools) → the gateway; on tool calls the
 * toolbox (step 2) runs them, their results join the turn and the gateway is called again,
 * up to `MAX_TOOL_ROUNDS`. Every round is a gateway call of its own — gated, routed, recorded
 * and charged — so a quota spent mid-turn refuses the next round like the first.
 *
 * The answer is checked by `SchemaGuard` against the schema and the verifier, which reads the
 * sources and texts the tools returned so far. An answer that fails gets one repair round:
 * the model reads its answer and why it was not accepted. A second failure is silence (R-f).
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

    // What the answer may cite and name: grows with every tool round of this turn only.
    const sources: AssistSource[] = [];
    const texts: string[] = [...command.history.map((h) => h.text), command.message, ...(context.lemma ? [context.lemma] : [])];
    const rounds: LlmMessage[] = [];
    let toolRounds = 0;
    let repaired = false;
    let calls = 0;

    for (;;) {
      const evidence: AssistEvidence = { sources: [...sources], texts: [...texts] };
      const call = await this.gateway.call(STUDENT_ASSIST.code, callContext, (promptVersion) => {
        const request = assistRequest(promptVersion, prompt, turn, evidence);
        return { ...request, messages: [...request.messages, ...rounds] };
      });
      calls++;
      const report = describeCall(STUDENT_ASSIST.code, callContext, call);

      if (report.outcome === 'ok') {
        const output = report.output!;
        if (output.kind === 'structured') {
          return { kind: 'answered', callId: report.callId, answer: toAssistAnswer(output.data, evidence), rounds: calls };
        }
        if (output.kind !== 'tool_calls') return { kind: 'silent', cause: 'invalid_response', callId: report.callId, rounds: calls };
        if (toolRounds >= MAX_TOOL_ROUNDS) return { kind: 'silent', cause: 'tool_budget', callId: report.callId, rounds: calls };
        toolRounds++;

        const outcomes: LlmToolOutcome[] = [];
        for (const toolCall of output.calls) {
          const result = await this.toolbox.run(toolCall, scope);
          sources.push(...result.sources);
          texts.push(result.content);
          outcomes.push({ callId: toolCall.id, content: result.content });
        }
        rounds.push(assistantToolTurn(output), toolResultsTurn(outcomes));
        continue;
      }

      const refusal = refusalOf(call);
      if (refusal) return { kind: 'refused', reason: refusal, callId: report.callId };

      if (report.outcome === 'invalid_response' && !repaired && report.output && report.output.kind !== 'tool_calls') {
        repaired = true;
        rounds.push(...repairTurn(report.output, report.errorMessage));
        continue;
      }
      return { kind: 'silent', cause: report.errorCode ?? report.outcome, callId: report.callId, rounds: calls };
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
  if (failure.kind === 'disabled') return failure.binding ? 'disabled' : 'no_binding';
  if (failure.kind === 'refused') return REFUSAL_REASON[failure.code];
  return null;
}

/**
 * The repair round: the model's own answer back as its turn, and why it was not accepted.
 * The reason is `SchemaGuard`'s — a schema path or which citation was invented — never a text
 * of the learner's beyond what the model itself wrote.
 */
function repairTurn(output: Exclude<LlmOutput, { kind: 'tool_calls' }>, reason: string | null): LlmMessage[] {
  const answer = output.kind === 'structured' ? JSON.stringify(output.data) : output.text;
  return [
    { role: 'assistant', parts: [{ type: 'text', text: answer }] },
    {
      role: 'user',
      parts: [
        {
          type: 'text',
          text:
            `That answer was not accepted: ${reason ?? 'it does not match the required format'}.\n` +
            'Give the answer again in the required format, fixing only that. Cite only what a tool returned in this turn.',
        },
      ],
    },
  ];
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
