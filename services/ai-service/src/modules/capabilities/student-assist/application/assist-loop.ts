import type { AnswerListener, GatewayRequest } from '../../../gateway/application/model-router.js';
import type { LlmMessage } from '../../../providers/domain/llm-request.js';
import type { LlmOutput } from '../../../providers/domain/llm-result.js';
import { assistantToolTurn, toolResultsTurn, type LlmToolOutcome } from '../../../providers/domain/llm-turns.js';
import { toAssistAnswer, type AssistAnswer, type AssistEvidence, type AssistSource } from '../domain/assist-answer.js';
import { AssistAnswerPreview, type AssistDelta } from '../domain/assist-answer-preview.js';
import { assistRequest, type AssistPrompt, type AssistTurn } from '../prompts/prompts.js';
import type { AssistRefusal } from './assist-refusal.js';
import type { AssistToolbox, AssistToolScope } from './assist-toolbox.js';

/** Q4: tool rounds in one turn; the answer after the last one is a round of its own. */
export const MAX_TOOL_ROUNDS = 4;

/** When the course's language is not known, the prompt describes it rather than names it. */
export const UNKNOWN_TARGET = 'the language they are learning';

/**
 * One round of a turn as the loop reads it, however the model was called — through the
 * gateway for a learner, through `ModelCaller` for a candidate in the eval (step 8).
 */
export type AssistRound =
  /** Accepted by `SchemaGuard` — a checked answer — or tool calls. */
  | { kind: 'output'; callId: string; output: LlmOutput }
  /** The answer failed the schema or the verifier; `reason` is `SchemaGuard`'s. */
  | { kind: 'invalid'; callId: string; output: LlmOutput | null; reason: string | null }
  /** The gate or the switch said no. */
  | { kind: 'refused'; callId: string; reason: AssistRefusal }
  /** Every model failed, or the gate could not be asked. */
  | { kind: 'failed'; callId: string; code: string };

/**
 * Calls the model once with the request the loop builds for the round's prompt version;
 * `listener`, when given, hears the answer as it is written (step 9).
 */
export type AssistRoundCaller = (build: (promptVersion: string) => GatewayRequest, listener?: AnswerListener) => Promise<AssistRound>;

/**
 * What a streamed turn sends before its outcome (plan 83, step 9): the blocks' text as it is
 * written, and `reset` when what was sent is void — the round turned out to be tool calls, the
 * answer went to repair, or the fallback started over. Only the outcome is checked; the client
 * replaces whatever it showed with the answer, or drops it on any other outcome.
 */
export type AssistStreamEvent = { type: 'delta'; delta: AssistDelta } | { type: 'reset' };

export interface AssistStream {
  send(event: AssistStreamEvent): void;
  /** True once the client has gone: no further round is started for it. */
  closed(): boolean;
}

/** How a turn went, in counts — what the eval scores and the handler logs. */
export interface AssistLoopTrace {
  calls: number;
  toolRounds: number;
  toolCalls: number;
  /** `SchemaGuard`'s reason for every answer not accepted, in order. Kept in memory only. */
  rejections: string[];
}

export type AssistLoopOutcome =
  /** `callId` — the ledger row of the round that answered. */
  | { kind: 'answered'; callId: string; answer: AssistAnswer; trace: AssistLoopTrace }
  | { kind: 'refused'; reason: AssistRefusal; callId: string; trace: AssistLoopTrace }
  /** `cause` is a code, never a text. */
  | { kind: 'silent'; cause: string; callId: string | null; trace: AssistLoopTrace };

/** What one turn is asked with: the prompt, what the learner sent and the tools, and the toolbox's scope. */
export interface AssistLoopInput {
  prompt: AssistPrompt;
  turn: AssistTurn;
  scope: AssistToolScope;
  /** A streamed turn's client (step 9); absent, every round is a plain call. */
  stream?: AssistStream;
}

/**
 * The agent loop of `student_assist` (plan 83, step 4e; taken out of the handler in step 8 so
 * the eval runs a candidate through the very same loop): the request (step 1's prompt, the
 * context's tools) → the round caller; on tool calls the toolbox (step 2) runs them, their
 * results join the turn and the model is called again, up to `MAX_TOOL_ROUNDS`.
 *
 * The answer is checked by `SchemaGuard` against the schema and the verifier, which reads the
 * sources and texts the tools returned so far. An answer that fails gets one repair round:
 * the model reads its answer and why it was not accepted. A second failure is silence (R-f).
 *
 * Streamed (step 9), each round's answer is read as it arrives and its blocks' text sent on;
 * a client that has gone stops the turn before its next round — the round under way is paid
 * for either way.
 */
export async function runAssistLoop(
  call: AssistRoundCaller,
  toolbox: Pick<AssistToolbox, 'run'>,
  { prompt, turn, scope, stream }: AssistLoopInput,
): Promise<AssistLoopOutcome> {
  // What the answer may cite and name: grows with every tool round of this turn only.
  const sources: AssistSource[] = [];
  const texts: string[] = [...turn.history.map((h) => h.text), turn.message, ...(turn.context.lemma ? [turn.context.lemma] : [])];
  const rounds: LlmMessage[] = [];
  const trace: AssistLoopTrace = { calls: 0, toolRounds: 0, toolCalls: 0, rejections: [] };
  let repaired = false;

  // What this round's answer has sent so far; void it when the answer will not stand.
  let preview = new AssistAnswerPreview();
  const discard = () => {
    if (preview.spoke) stream!.send({ type: 'reset' });
    preview = new AssistAnswerPreview();
  };
  const listener: AnswerListener | undefined = stream && {
    text: (piece) => preview.push(piece).forEach((delta) => stream.send({ type: 'delta', delta })),
    restart: discard,
  };

  for (;;) {
    if (stream?.closed()) return { kind: 'silent', cause: 'client_closed', callId: null, trace };
    const evidence: AssistEvidence = { sources: [...sources], texts: [...texts] };
    const round = await call((promptVersion) => {
      const request = assistRequest(promptVersion, prompt, turn, evidence);
      return { ...request, messages: [...request.messages, ...rounds] };
    }, listener);
    trace.calls++;

    switch (round.kind) {
      case 'output': {
        const { output } = round;
        if (output.kind === 'structured') {
          return { kind: 'answered', callId: round.callId, answer: toAssistAnswer(output.data, evidence), trace };
        }
        if (output.kind !== 'tool_calls') return { kind: 'silent', cause: 'invalid_response', callId: round.callId, trace };
        if (trace.toolRounds >= MAX_TOOL_ROUNDS) return { kind: 'silent', cause: 'tool_budget', callId: round.callId, trace };
        trace.toolRounds++;
        // Whatever the model wrote beside its calls is not the answer.
        if (stream) discard();

        const outcomes: LlmToolOutcome[] = [];
        for (const toolCall of output.calls) {
          const result = await toolbox.run(toolCall, scope);
          sources.push(...result.sources);
          texts.push(result.content);
          outcomes.push({ callId: toolCall.id, content: result.content });
          trace.toolCalls++;
        }
        rounds.push(assistantToolTurn(output), toolResultsTurn(outcomes));
        continue;
      }
      case 'refused':
        return { kind: 'refused', reason: round.reason, callId: round.callId, trace };
      case 'invalid':
        trace.rejections.push(round.reason ?? 'invalid_response');
        if (!repaired && round.output && round.output.kind !== 'tool_calls') {
          repaired = true;
          rounds.push(...repairTurn(round.output, round.reason));
          if (stream) discard();
          continue;
        }
        return { kind: 'silent', cause: 'invalid_response', callId: round.callId, trace };
      case 'failed':
        return { kind: 'silent', cause: round.code, callId: round.callId, trace };
    }
  }
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
