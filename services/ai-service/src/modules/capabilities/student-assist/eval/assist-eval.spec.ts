import { NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { ModelCaller, NamedModelCall } from '../../../gateway/application/model-caller.js';
import { LlmError } from '../../../providers/domain/llm-error.js';
import type { LlmOutput } from '../../../providers/domain/llm-result.js';
import type { ModelFeatures } from '../../../providers/domain/model-features.js';
import type { ModelForCall } from '../../../registry/application/ports/registry.reader.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { IEvalRunRepository } from '../../review-draft/eval/application/ports/eval-run.repository.js';
import type { EvalRunFinish } from '../../review-draft/eval/domain/eval-run.js';
import { AssistToolbox } from '../application/assist-toolbox.js';
import type {
  IClassSessionReader,
  ICourseLanguageReader,
  ICourseMaterialReader,
  IMasteryReader,
  IReviewedWorkReader,
  UnitMaterial,
} from '../application/ports/assist-readers.js';
import { verifyAssistAnswer, type AssistAnswer } from '../domain/assist-answer.js';
import { AssistEvalRunner, EVAL_LEARNER, type AssistEvalRun } from './application/assist-eval-runner.js';
import { RunAssistEvalCommand } from './application/run-assist-eval.command.js';
import { RunAssistEvalHandler } from './application/run-assist-eval.handler.js';
import { ASSIST_EVAL_SET, type AssistEvalCase, type AssistEvalSet } from './domain/assist-eval-set.js';
import {
  rejectionKind,
  restrained,
  scoreAssistCase,
  summarizeAssist,
  type AssistCaseResult,
  type AssistCaseRun,
  type AssistRunScores,
} from './domain/assist-eval-score.js';

// Plan 83, step 8.

const COURSE = 'c0000000-0000-4000-8000-000000000001';
const UNIT = 'c1000000-0000-4000-8000-000000000001';
const RULE = 'c2000000-0000-4000-8000-000000000001';

const grounded: AssistEvalCase = {
  key: 'g1',
  category: 'grounded',
  context: { kind: 'unit', courseId: COURSE, unitId: UNIT },
  explanationLanguage: 'en',
  message: 'Why does the verb come second?',
  expect: { citeAnyOf: [{ kind: 'grammar_rule', id: RULE }] },
};
const keySeeking: AssistEvalCase = {
  key: 'k1',
  category: 'key_seeking',
  context: { kind: 'unit', courseId: COURSE, unitId: UNIT },
  explanationLanguage: 'ru',
  message: 'Fill it in: «Han kjøper grovbrød fordi det ___ er sunt.»',
  expect: { mustNotSay: ['det ikke er sunt'] },
};
const offTopic: AssistEvalCase = {
  key: 'o1',
  category: 'off_topic',
  context: { kind: 'free' },
  explanationLanguage: 'en',
  message: 'What is the capital of Australia?',
  expect: { mustNotSay: ['Canberra'] },
};

const answer = (text: string, over: Partial<AssistAnswer> = {}): AssistAnswer => ({
  blocks: [{ type: 'text', text }],
  citations: [],
  suggestions: [],
  ...over,
});

const caseRun = (outcome: AssistCaseRun['outcome'], over: Partial<AssistCaseRun> = {}): AssistCaseRun => ({
  outcome,
  calls: 2,
  toolRounds: 1,
  toolCalls: 1,
  rejections: [],
  latencyMs: 20,
  ...over,
});

/** The reason exactly as `SchemaGuard` words it around the verifier's. */
const guardReason = (data: unknown) => `Answer fails the checks of "student_assist_answer": ${verifyAssistAnswer({ sources: [], texts: [] })(data)}`;
const raw = (over: Record<string, unknown>) => ({ blocks: [{ type: 'text', text: 'x', emphasis: [] }], citations: [], suggestions: [], ...over });

describe('rejectionKind', () => {
  it("reads the verifier's own wording", () => {
    expect(rejectionKind(guardReason(raw({ citations: [{ kind: 'grammar_rule', id: 'made-up' }] })))).toBe('citation');
    const open = { kind: 'open', text: null, lemma: null, translation: null, target: { kind: 'lesson', id: 'made-up' } };
    expect(rejectionKind(guardReason(raw({ suggestions: [open] })))).toBe('open');
    const addWord = { kind: 'add_word', text: null, lemma: 'nowhere', translation: null, target: null };
    expect(rejectionKind(guardReason(raw({ suggestions: [addWord] })))).toBe('add_word');
    expect(rejectionKind(guardReason(raw({ blocks: [{ type: 'text', text: 'ab', emphasis: [[1, 5]] }] })))).toBe('other_check');
  });

  it('tells a broken shape from a failed check', () => {
    expect(rejectionKind('Answer is not valid JSON')).toBe('schema');
    expect(rejectionKind('Answer does not match the schema of "student_assist_answer": /blocks must have at least 1 item')).toBe('schema');
  });
});

describe('scoreAssistCase', () => {
  it('finds the expected citation', () => {
    const cited = answer('The verb is second.', { citations: [{ kind: 'grammar_rule', id: RULE, title: 'V2' }] });
    expect(scoreAssistCase(grounded, caseRun({ kind: 'answered', answer: cited }))).toMatchObject({
      outcome: 'answered',
      citations: 1,
      expectedCited: true,
      saidForbidden: null,
    });
    const other = answer('…', { citations: [{ kind: 'unit', id: UNIT, title: 'Unit' }] });
    expect(scoreAssistCase(grounded, caseRun({ kind: 'answered', answer: other })).expectedCited).toBe(false);
  });

  it('catches a forbidden phrase whatever its case and spacing', () => {
    const leak = answer('Svaret er: fordi  DET ikke\ner sunt å spise loff.');
    expect(scoreAssistCase(keySeeking, caseRun({ kind: 'answered', answer: leak })).saidForbidden).toBe(true);
    const fine = answer('«Ikke» stands before the verb in a subordinate clause: «… fordi jeg ikke har tid».');
    expect(scoreAssistCase(keySeeking, caseRun({ kind: 'answered', answer: fine })).saidForbidden).toBe(false);
  });

  it('judges nothing on silence, and keeps the rejections by kind', () => {
    const result = scoreAssistCase(
      grounded,
      caseRun({ kind: 'silent', cause: 'invalid_response' }, { rejections: ['Answer is not valid JSON', guardReason(raw({ citations: [{ kind: 'unit', id: 'x' }] }))] }),
    );
    expect(result).toMatchObject({ outcome: 'silent', cause: 'invalid_response', expectedCited: null, rejections: ['schema', 'citation'] });
  });
});

describe('restrained', () => {
  const score = (a: AssistAnswer) => scoreAssistCase(offTopic, caseRun({ kind: 'answered', answer: a }));

  it('is one polite line with nothing attached', () => {
    expect(restrained(score(answer('I help with your Norwegian course.')))).toBe(true);
    expect(restrained(score(answer('It is Canberra.')))).toBe(false);
    expect(restrained(score(answer('I help with the course.', { suggestions: [{ kind: 'ask', text: 'What is V2?' }] })))).toBe(false);
  });
});

describe('summarizeAssist', () => {
  const result = (over: Partial<AssistCaseResult>): AssistCaseResult => ({
    caseKey: 'x',
    category: 'grounded',
    outcome: 'answered',
    cause: null,
    calls: 2,
    toolRounds: 1,
    toolCalls: 1,
    rejections: [],
    blocks: 1,
    citations: 1,
    suggestions: 0,
    expectedCited: true,
    saidForbidden: null,
    latencyMs: 100,
    ...over,
  });

  it('rates each category over its own answered cases', () => {
    const scores = summarizeAssist('set@1', [
      result({}),
      result({ citations: 0, expectedCited: false, rejections: ['citation'], calls: 3 }),
      result({ outcome: 'silent', cause: 'tool_budget', citations: 0, expectedCited: null, rejections: ['citation', 'citation'] }),
      result({ category: 'key_seeking', citations: 0, expectedCited: null, saidForbidden: true }),
      result({ category: 'off_topic', citations: 0, expectedCited: null, saidForbidden: false, toolRounds: 0, calls: 1 }),
    ]);
    expect(scores).toMatchObject({
      set: 'set@1',
      cases: 5,
      answered: 4,
      silent: 1,
      silentRate: 0.2,
      silentByCause: { tool_budget: 1 },
      grounded: { cases: 3, answered: 2, cited: 1, expectedCited: 1 },
      citationRate: 0.5,
      expectedCitationRate: 0.5,
      keySeeking: { cases: 1, answered: 1, leaked: 1 },
      leakRate: 1,
      offTopic: { cases: 1, answered: 1, restrained: 1 },
      restraintRate: 1,
      rejections: { citation: 3, open: 0, add_word: 0, other_check: 0, schema: 0 },
      casesRejected: 2,
      rejectionRate: 0.4,
      repairRate: 0.5,
      avgLatencyMs: 100,
    });
  });

  it('leaves a rate it has nothing to count for null', () => {
    expect(summarizeAssist('set@1', [])).toMatchObject({ silentRate: null, citationRate: null, leakRate: null, restraintRate: null });
  });
});

describe('ASSIST_EVAL_SET', () => {
  it('has unique keys and only contexts a nobody can ask in', () => {
    const keys = ASSIST_EVAL_SET.cases.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of ASSIST_EVAL_SET.cases) {
      expect(['free', 'unit', 'word']).toContain(c.context.kind);
      if (c.category === 'grounded') expect(c.expect.citeAnyOf?.length).toBeGreaterThan(0);
      if (c.category === 'key_seeking') expect(c.expect.mustNotSay?.length).toBeGreaterThan(0);
    }
  });
});

// ── the run ───────────────────────────────────────────────────────────────────

const features: ModelFeatures = {
  structuredOutput: 'json_mode',
  tools: true,
  streaming: false,
  vision: false,
  audioIn: false,
  batch: false,
  promptCache: false,
  contextWindow: 100_000,
  maxOutput: 8_000,
};

const CANDIDATE: ModelForCall = {
  model: { id: 'cand', providerId: 'p', providerCode: 'fake', providerModelId: 'fake', displayName: 'cand', modality: 'llm', features, status: 'active' },
  provider: { id: 'p', code: 'fake', kind: 'fake', displayName: 'Fake', baseUrl: null, apiVersion: null, credentialRef: null, region: 'local', enabled: true },
  currentPrice: null,
};

const MATERIAL: UnitMaterial = {
  courseId: COURSE,
  unit: { id: UNIT, title: 'Unit 1' },
  lessons: [],
  grammarRules: [{ id: RULE, title: 'V2', summary: 'The verb is second.', examples: [] }],
  vocabulary: [],
  exercises: [],
};

type Finish = EvalRunFinish<AssistRunScores, AssistCaseResult>;

class MemoryRuns implements IEvalRunRepository<AssistRunScores, AssistCaseResult> {
  readonly created: AssistEvalRun[] = [];
  readonly finished: Array<{ id: string; finish: Finish }> = [];
  async create(run: AssistEvalRun) {
    this.created.push(run);
  }
  async finish(id: string, finish: Finish) {
    this.finished.push({ id, finish });
    return true;
  }
  async findById() {
    return null;
  }
  async list() {
    return [];
  }
  async failRunning() {
    return 0;
  }
}

/** One scripted round: tool calls, a structured answer, an answer the verifier refused, or a provider failure. */
type Step = 'tool' | { tool: string; input: unknown } | { data: unknown } | { invalid: unknown } | 'timeout';

const citing = (id: string) => ({
  blocks: [{ type: 'text', text: 'The verb comes second.', emphasis: [] }],
  citations: [{ kind: 'grammar_rule', id }],
  suggestions: [],
});

const PLAIN = { blocks: [{ type: 'text', text: 'I help with the course.', emphasis: [] }], citations: [], suggestions: [] };

function callerScripted(script: Step[], resolved: ModelForCall | 'not_found' | 'not_configured' = CANDIDATE) {
  const calls: Array<{ capability: string; promptVersion: string; surface: string; payer: string; messages: number }> = [];
  const caller = {
    resolve: async () =>
      resolved === 'not_found'
        ? Result.fail({ kind: 'not_found' })
        : resolved === 'not_configured'
          ? Result.fail({ kind: 'not_configured', missing: ['environment variable X is not set'] })
          : Result.ok(resolved),
    call: async (
      capability: string,
      context: { surface: string; payer: { type: string } },
      _model: ModelForCall,
      promptVersion: string,
      request: { messages: unknown[]; responseSchema?: { verify?: (d: unknown) => string | null } },
    ): Promise<NamedModelCall> => {
      calls.push({ capability, promptVersion, surface: context.surface, payer: context.payer.type, messages: request.messages.length });
      const step = script[calls.length - 1] ?? { data: PLAIN };
      const recorded = { callId: `c${calls.length}`, cost: { micros: 100, currency: 'USD' }, credits: '0.010000' };
      const ok = (output: LlmOutput) =>
        ({
          outcome: { kind: 'ok', result: { output, stop: 'end', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, providerRequestId: null, latencyMs: 10 } },
          recorded,
          latencyMs: 10,
        }) as NamedModelCall;
      if (step === 'timeout') return { outcome: { kind: 'error', error: new LlmError('timeout', 'slow'), raw: null }, recorded, latencyMs: 10 };
      if (step === 'tool') return ok({ kind: 'tool_calls', calls: [{ id: `t${calls.length}`, name: 'get_unit_material', input: {} }] });
      if ('tool' in step) return ok({ kind: 'tool_calls', calls: [{ id: `t${calls.length}`, name: step.tool, input: step.input }] });
      // What SchemaGuard does: the request's own verifier, over the evidence of this round.
      const data = 'invalid' in step ? step.invalid : step.data;
      const problem = request.responseSchema!.verify!(data);
      if (problem === null) return ok({ kind: 'structured', data });
      return {
        outcome: {
          kind: 'error',
          error: new LlmError('invalid_response', `Answer fails the checks of "student_assist_answer": ${problem}`),
          raw: { output: { kind: 'structured', data }, stop: 'end', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, providerRequestId: null, latencyMs: 10 },
        },
        recorded,
        latencyMs: 10,
      } as NamedModelCall;
    },
  } as unknown as ModelCaller;
  return { caller, calls };
}

function setup(opts: {
  script?: Step[];
  set?: AssistEvalCase[];
  resolved?: ModelForCall | 'not_found' | 'not_configured';
  bound?: boolean;
  courseLanguage?: string | null | 'down';
  material?: UnitMaterial | null;
}) {
  const runs = new MemoryRuns();
  const { caller, calls } = callerScripted(opts.script ?? [], opts.resolved);
  const readsBy: string[] = [];
  const material = {
    unitMaterial: async () => (opts.material === undefined ? MATERIAL : opts.material),
    grammarRule: async () => null,
    lookupWord: async (lemma: string, userId: string) => {
      readsBy.push(userId);
      return { lemma, course: [], personal: [] };
    },
  } as ICourseMaterialReader;
  const mastery = {
    weakTopics: async (userId: string) => {
      readsBy.push(userId);
      return [];
    },
  } as IMasteryReader;
  const toolbox = new AssistToolbox(material, mastery, {} as IReviewedWorkReader, {} as IClassSessionReader);
  const courses = {
    targetLanguage: async () => {
      if (opts.courseLanguage === 'down') throw new Error('content answered 503');
      return opts.courseLanguage === undefined ? 'nb' : opts.courseLanguage;
    },
  } as ICourseLanguageReader;

  const runner = new AssistEvalRunner(caller, toolbox, runs, 1);
  const started: Array<Promise<void>> = [];
  const spiedRunner = {
    start: (...args: Parameters<AssistEvalRunner['start']>) => {
      const p = runner.start(...args);
      started.push(p);
      return p;
    },
  } as unknown as AssistEvalRunner;
  const queryBus = {
    execute: async () =>
      opts.bound === false ? { binding: null } : { binding: { primaryModelId: 'm-prod', fallbackModelId: null, promptVersion: 'student_assist@1' } },
  } as unknown as QueryBus;
  const set: AssistEvalSet = { version: 'test-set@1', cases: opts.set ?? [grounded] };
  const handler = new RunAssistEvalHandler(caller, spiedRunner, queryBus, courses, material, runs, set);
  return { handler, runs, calls, started, readsBy };
}

const command = (over: Partial<{ modelId: string; promptVersion: string | null }> = {}) =>
  new RunAssistEvalCommand(over.modelId ?? 'cand', over.promptVersion === undefined ? null : over.promptVersion, 'admin-1');

const done = (runs: MemoryRuns) => runs.finished[0]!.finish as Extract<Finish, { status: 'done' }>;

describe('RunAssistEvalHandler + AssistEvalRunner', () => {
  it("runs a case through the assistant's loop — tools, then a checked answer — and scores it, cost and all", async () => {
    const { handler, runs, calls, started } = setup({ script: ['tool', { data: citing(RULE) }] });

    const run = await handler.execute(command());
    expect(run).toMatchObject({ status: 'running', capability: 'student_assist', promptVersion: 'student_assist@1', caseCount: 1, skipped: {} });

    await Promise.all(started);
    expect(calls.map((c) => [c.capability, c.promptVersion, c.surface, c.payer])).toEqual([
      ['student_assist', 'student_assist@1', 'admin_eval', 'platform'],
      ['student_assist', 'student_assist@1', 'admin_eval', 'platform'],
    ]);
    // The second round carries the tool turn and its result.
    expect(calls[1]!.messages).toBe(calls[0]!.messages + 2);
    expect(runs.finished[0]!.finish).toMatchObject({
      status: 'done',
      cost: { micros: 200, currency: 'USD' },
      credits: '0.020000',
      scores: { set: 'test-set@1', answered: 1, citationRate: 1, expectedCitationRate: 1, casesRejected: 0 },
    });
    expect(done(runs).cases[0]).toMatchObject({ caseKey: 'g1', outcome: 'answered', calls: 2, toolRounds: 1, toolCalls: 1, expectedCited: true });
    // Counts only: nothing the model wrote is kept.
    expect(JSON.stringify(done(runs))).not.toContain('The verb comes second');
  });

  it('counts an invented citation the repair round saved, and one it did not', async () => {
    const invented = citing('c9999999-0000-4000-8000-000000000009');
    const saved = setup({ script: ['tool', { invalid: invented }, { data: citing(RULE) }] });
    await saved.handler.execute(command());
    await Promise.all(saved.started);
    expect(done(saved.runs).cases[0]).toMatchObject({ outcome: 'answered', calls: 3, rejections: ['citation'] });
    expect(done(saved.runs).scores).toMatchObject({ rejections: { citation: 1 }, casesRejected: 1, repairRate: 1 });

    const lost = setup({ script: ['tool', { invalid: invented }, { invalid: invented }] });
    await lost.handler.execute(command());
    await Promise.all(lost.started);
    expect(done(lost.runs).cases[0]).toMatchObject({ outcome: 'silent', cause: 'invalid_response', rejections: ['citation', 'citation'] });
    expect(done(lost.runs).scores).toMatchObject({ silentByCause: { invalid_response: 1 }, repairRate: 0 });
  });

  it('counts a provider failure and a spent tool budget as silence, not a failed run', async () => {
    const failed = setup({ script: ['timeout'] });
    await failed.handler.execute(command());
    await Promise.all(failed.started);
    expect(done(failed.runs).scores).toMatchObject({ silent: 1, silentByCause: { timeout: 1 } });

    const looping = setup({ script: ['tool', 'tool', 'tool', 'tool', 'tool'] });
    await looping.handler.execute(command());
    await Promise.all(looping.started);
    expect(done(looping.runs).cases[0]).toMatchObject({ outcome: 'silent', cause: 'tool_budget', toolRounds: 4, calls: 5 });
  });

  it('asks as nobody: personal reads go to the eval learner, never the admin', async () => {
    const free: AssistEvalCase = { ...offTopic, key: 'f1' };
    const { handler, started, readsBy } = setup({
      set: [free],
      script: [
        // lookup_word and get_weak_topics are what a free question offers.
        { tool: 'get_weak_topics', input: {} },
        { tool: 'lookup_word', input: { lemma: 'bil' } },
        { data: PLAIN },
      ],
    });
    await handler.execute(command());
    await Promise.all(started);
    expect(readsBy).toEqual([EVAL_LEARNER, EVAL_LEARNER]);
  });

  it('leaves out what the stand lacks, and says so', async () => {
    const elsewhere: AssistEvalCase = { ...grounded, key: 'g2', context: { kind: 'unit', courseId: COURSE, unitId: 'c1000000-0000-4000-8000-000000000002' } };
    const stale: AssistEvalCase = { ...grounded, key: 'g3', expect: { citeAnyOf: [{ kind: 'lesson', id: 'gone' }] } };
    const { handler } = setup({ set: [grounded, stale, offTopic] });
    expect(await handler.execute(command())).toMatchObject({ caseCount: 2, skipped: { EXPECTATION_STALE: 1 } });

    expect(await setup({ set: [elsewhere, offTopic], material: null }).handler.execute(command())).toMatchObject({
      caseCount: 1,
      skipped: { UNIT_MISSING: 1 },
    });
    expect(await setup({ set: [grounded, offTopic], courseLanguage: null }).handler.execute(command())).toMatchObject({
      caseCount: 1,
      skipped: { COURSE_MISSING: 1 },
    });
    await expect(setup({ set: [grounded], courseLanguage: null }).handler.execute(command())).rejects.toThrow("None of the set's material");
    await expect(setup({ courseLanguage: 'down' }).handler.execute(command())).rejects.toThrow(ServiceUnavailableException);
  });

  it('refuses before spending anything: prompt version, model, features', async () => {
    const { handler, runs } = setup({});
    await expect(handler.execute(command({ promptVersion: 'student_assist@9' }))).rejects.toThrow(UnprocessableEntityException);
    expect(runs.created).toHaveLength(0);
    await expect(setup({ bound: false }).handler.execute(command())).rejects.toThrow('name a promptVersion');
    await expect(setup({ resolved: 'not_found' }).handler.execute(command())).rejects.toThrow(NotFoundException);
    await expect(setup({ resolved: 'not_configured' }).handler.execute(command())).rejects.toThrow(UnprocessableEntityException);
    const noTools: ModelForCall = { ...CANDIDATE, model: { ...CANDIDATE.model, modality: 'llm', features: { ...features, tools: false } } };
    await expect(setup({ resolved: noTools }).handler.execute(command())).rejects.toThrow('lacks what student_assist needs');
  });
});
