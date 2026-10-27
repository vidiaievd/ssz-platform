import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ModelCaller } from '../../../../gateway/application/model-caller.js';
import type { RecordedCall } from '../../../../ledger/application/call-recorder.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import type { ModelForCall } from '../../../../registry/application/ports/registry.reader.js';
import { PLATFORM_PAYER } from '../../../../access/domain/payer.js';
import { ADMIN_EVAL_SURFACE } from '../../../review-draft/eval/application/review-eval-runner.js';
import { EVAL_RUN_REPOSITORY, type IEvalRunRepository } from '../../../review-draft/eval/application/ports/eval-run.repository.js';
import { totalCost, type EvalRun } from '../../../review-draft/eval/domain/eval-run.js';
import { RECORDING_AUDIO_SOURCE, type IRecordingAudioSource } from '../../application/ports/recording-audio.source.js';
import type { ReadingCase, ReadingCasePrompt } from '../domain/reading-case.js';
import { summarizeReadings, type PromptResult, type ReadingCaseResult, type ReadingRunScores } from '../domain/reading-score.js';
import { READING_CASES_CLIENT, type IReadingCasesClient } from './ports/reading-cases.client.js';

export type ReadingEvalRun = EvalRun<ReadingRunScores, ReadingCaseResult>;

/**
 * Readings in flight at once. The CPU sidecar hears one take at a time and queues four, so more
 * would only queue there — or come back `overloaded`.
 */
export const VOICE_EVAL_CONCURRENCY = Symbol('VOICE_EVAL_CONCURRENCY');
const DEFAULT_CONCURRENCY = 2;

/** What a candidate is asked: the capability it is measured for, and whether to score pronunciation. */
export interface VoiceEvalAsk {
  capability: string;
  pronunciation: boolean;
}

/**
 * Runs a speech model over the readings teachers ruled on, in the background (plan 82, step 10,
 * gate Q5): every take is heard as a learner's would be — the speech WAV from media, the passage
 * as reference, the course language — what was heard is checked by exercise-engine under the
 * exercise's mark, and the machine's pass or fail is set beside the teacher's, prompt by prompt.
 *
 * A prompt that cannot be heard (no speech variant, a take too long) is counted on its own and
 * the reading's other prompts still run. The check failing fails the run: without the engine
 * there is nothing to compare. A run left `running` by a gone process is failed on start-up by
 * the drafts' runner — the table is shared.
 */
@Injectable()
export class VoiceEvalRunner {
  private readonly logger = new Logger(VoiceEvalRunner.name);

  constructor(
    private readonly caller: ModelCaller,
    @Inject(RECORDING_AUDIO_SOURCE) private readonly recordings: IRecordingAudioSource,
    @Inject(READING_CASES_CLIENT) private readonly readings: IReadingCasesClient,
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository<ReadingRunScores, ReadingCaseResult>,
    @Optional() @Inject(VOICE_EVAL_CONCURRENCY) private readonly concurrency: number = DEFAULT_CONCURRENCY,
  ) {}

  /** Starts the run and returns at once; the promise is for tests, callers do not wait on it. */
  start(run: ReadingEvalRun, model: ModelForCall, cases: ReadingCase[], ask: VoiceEvalAsk): Promise<void> {
    return this.execute(run, model, cases, ask).catch(async (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Voice eval run ${run.id} failed: ${message}`);
      await this.runs.finish(run.id, { status: 'failed', error: message }, new Date()).catch(() => undefined);
    });
  }

  private async execute(run: ReadingEvalRun, model: ModelForCall, cases: ReadingCase[], ask: VoiceEvalAsk): Promise<void> {
    const context: CallContext = {
      payer: PLATFORM_PAYER,
      actor: { userId: run.startedBy, role: 'platform_admin' },
      surface: ADMIN_EVAL_SURFACE,
    };
    const results: ReadingCaseResult[] = new Array(cases.length);
    const ledger: RecordedCall[] = [];

    let next = 0;
    const worker = async () => {
      while (next < cases.length) {
        const index = next++;
        results[index] = await this.runCase(cases[index]!, model, context, ask, ledger);
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, cases.length) }, worker));

    const { cost, credits } = totalCost(ledger);
    const scores = summarizeReadings(results);
    await this.runs.finish(run.id, { status: 'done', scores, cases: results, cost, credits }, new Date());
    this.logger.log(
      `Voice eval run ${run.id} done: ${scores.heard}/${scores.prompts} prompt(s) heard on ${run.modelId}, ` +
        `agreement ${scores.agreement ?? '—'}, gate ${scores.gate.met ? 'met' : 'not met'}`,
    );
  }

  private async runCase(
    reading: ReadingCase,
    model: ModelForCall,
    context: CallContext,
    ask: VoiceEvalAsk,
    ledger: RecordedCall[],
  ): Promise<ReadingCaseResult> {
    const prompts: PromptResult[] = [];
    const transcripts = new Map<string, string>();
    for (const prompt of reading.prompts) {
      const { result, transcript, recorded } = await this.hear(reading, prompt, model, context, ask);
      if (recorded) ledger.push(recorded);
      if (transcript !== null) transcripts.set(prompt.itemId, transcript);
      prompts.push(result);
    }

    if (transcripts.size > 0) {
      const checks = await this.readings.check(
        reading.targetLanguage,
        reading.passPercent,
        reading.prompts
          .filter((p) => transcripts.has(p.itemId))
          .map((p) => ({ itemId: p.itemId, text: p.text, transcript: transcripts.get(p.itemId)! })),
      );
      const byItem = new Map(checks.map((c) => [c.itemId, c]));
      for (const result of prompts) {
        const check = byItem.get(result.itemId);
        if (result.outcome !== 'ok') continue;
        if (!check) throw new Error(`The reading check left out prompt ${result.itemId} of ${reading.caseId}`);
        result.machinePassed = check.passed;
        result.percent = check.percent;
      }
    }
    return { caseId: reading.caseId, passPercent: reading.passPercent, prompts };
  }

  private async hear(
    reading: ReadingCase,
    prompt: ReadingCasePrompt,
    model: ModelForCall,
    context: CallContext,
    ask: VoiceEvalAsk,
  ): Promise<{ result: PromptResult; transcript: string | null; recorded: RecordedCall | null }> {
    const base: PromptResult = {
      itemId: prompt.itemId,
      outcome: 'skipped',
      errorCode: null,
      teacherApproved: prompt.approved,
      machinePassed: null,
      percent: null,
      latencyMs: 0,
      audioMs: null,
    };
    const skipped = (errorCode: string) => ({ result: { ...base, errorCode }, transcript: null, recorded: null });

    const features = model.model.modality === 'speech' ? model.model.features : null;
    if (features && prompt.seconds > features.maxAudioSeconds) return skipped('audio_too_long');

    let audio: Awaited<ReturnType<IRecordingAudioSource['fetch']>>;
    try {
      audio = await this.recordings.fetch(prompt.assetId);
    } catch (err) {
      this.logger.warn(`Take of ${reading.caseId}/${prompt.itemId} not fetched: ${err instanceof Error ? err.message : String(err)}`);
      return skipped('media_unavailable');
    }
    if (audio.kind === 'missing') return skipped('recording_missing');
    if (audio.kind === 'pending') return skipped('recording_not_ready');

    const { outcome, recorded, latencyMs } = await this.caller.callSpeech(ask.capability, context, model, {
      audio: { format: 'wav', data: audio.wav },
      referenceText: prompt.text,
      language: reading.targetLanguage,
      pronunciation: ask.pronunciation,
    });
    if (outcome.kind === 'error') {
      return { result: { ...base, outcome: 'error', errorCode: outcome.error.code, latencyMs }, transcript: null, recorded };
    }
    return {
      result: { ...base, outcome: 'ok', latencyMs, audioMs: outcome.result.audioMs },
      transcript: outcome.result.transcript,
      recorded,
    };
  }
}
