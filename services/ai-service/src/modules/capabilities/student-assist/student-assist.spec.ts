import { SchemaGuard } from '../../providers/application/schema-guard.js';
import type { LlmRequest } from '../../providers/domain/llm-request.js';
import type { LlmResult } from '../../providers/domain/llm-result.js';
import type { ModelFeatures } from '../../providers/domain/model-features.js';
import { FakeLlmProvider } from '../../providers/infrastructure/fake/fake-llm.provider.js';
import type { AiModel } from '../../registry/domain/registry.types.js';
import { findCapability } from '../catalog.js';
import { capabilityGaps } from '../domain/capability.js';
import { occursAsWord, toAssistAnswer, type AssistEvidence, type AssistSource } from './domain/assist-answer.js';
import { STUDENT_ASSIST_PROMPT_VERSIONS, assistRequest, type AssistPrompt, type AssistTurn } from './prompts/prompts.js';

// Plan 83, step 1: student_assist@1 — the capability, its prompt, the answer schema and verifier.

const prompt: AssistPrompt = { targetLanguage: 'Norsk', explanationLanguage: 'Russisk', contextKind: 'unit' };

const turn: AssistTurn = {
  context: { kind: 'unit', courseId: 'c1', unitId: 'u1' },
  history: [
    { role: 'user', text: 'Hva betyr «bil»?' },
    { role: 'assistant', text: '«Bil» — машина.' },
  ],
  message: 'Почему «en bil», а не «et bil»?',
  tools: [
    {
      name: 'get_unit_material',
      description: 'The published material of a unit',
      inputSchema: { type: 'object', required: ['unitId'], properties: { unitId: { type: 'string' } } },
    },
  ],
};

const rule: AssistSource = { kind: 'grammar_rule', id: 'r-gender', title: 'Kjønn: en, ei, et', unitId: 'u1', courseId: 'c1' };
const lesson: AssistSource = { kind: 'lesson', id: 'l-1', title: 'Leksjon 1', unitId: 'u1', courseId: 'c1' };

const evidence: AssistEvidence = {
  sources: [rule, lesson],
  texts: [...turn.history.map((h) => h.text), turn.message, '{"vocabulary":[{"lemma":"bil","gender":"m"}]}'],
};

function request(ev: AssistEvidence = evidence): LlmRequest {
  return { ...assistRequest('student_assist@1', prompt, turn, ev), maxOutputTokens: 600, timeoutMs: 30_000 };
}

function structured(data: unknown): LlmResult {
  return {
    output: { kind: 'structured', data },
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    stop: 'end',
    providerRequestId: null,
    latencyMs: 1,
  };
}

const guard = new SchemaGuard();

function check(data: unknown, ev: AssistEvidence = evidence) {
  return guard.check(structured(data), request(ev));
}

const block = (text: string, emphasis: [number, number][] = []) => ({ type: 'text', text, emphasis });
const none = { text: null, lemma: null, translation: null, target: null };

const answer = (overrides: Record<string, unknown> = {}) => ({
  blocks: [block('«Bil» — мужского рода, поэтому en bil.', [[1, 4]]), { type: 'example', text: 'Jeg har en bil.', emphasis: [] }],
  citations: [{ kind: 'grammar_rule', id: 'r-gender' }],
  suggestions: [
    { ...none, kind: 'ask', text: 'А какие слова среднего рода?' },
    { ...none, kind: 'add_word', lemma: 'bil', translation: 'машина' },
    { ...none, kind: 'open', target: { kind: 'lesson', id: 'l-1' } },
  ],
  ...overrides,
});

describe('student_assist capability', () => {
  const capability = findCapability('student_assist')!;
  const features: ModelFeatures = {
    structuredOutput: 'json_mode',
    tools: true,
    streaming: false,
    vision: false,
    audioIn: false,
    batch: false,
    promptCache: false,
    contextWindow: 128_000,
    maxOutput: 4_000,
  };
  const model = (f: Partial<ModelFeatures>): AiModel => ({
    id: 'm',
    providerId: 'p',
    providerCode: 'fake',
    providerModelId: 'm',
    displayName: 'm',
    status: 'active',
    modality: 'llm',
    features: { ...features, ...f },
  });

  it('is in the catalogue with its prompt line', () => {
    expect(capability).toBeDefined();
    expect(capability.promptVersions).toEqual(['student_assist@1']);
    expect(STUDENT_ASSIST_PROMPT_VERSIONS).toEqual(['student_assist@1']);
  });

  it('accepts a model with tools and JSON, and refuses one without tools (R-c)', () => {
    expect(capabilityGaps(model({}), capability)).toEqual([]);
    expect(capabilityGaps(model({ tools: false }), capability)).toEqual(['tools']);
    expect(capabilityGaps(model({ structuredOutput: 'none' }), capability)).toEqual(['structuredOutput json_mode (has none)']);
  });

  it('refuses a prompt version it does not have', () => {
    expect(() => assistRequest('student_assist@9', prompt, turn, evidence)).toThrow('no prompt version');
  });
});

describe('student_assist@1 request', () => {
  it('states the rules the client cannot enforce: no exercise answers, no grading, no invention', () => {
    const { system } = request();
    expect(system).toContain('Never give the answer to an exercise');
    expect(system).toContain('Never grade');
    expect(system).toContain('Do not guess');
    expect(system).toContain('Write every explanation in Russisk');
    expect(system).toContain('Read its material with a tool');
  });

  it('carries the history, then the context and the message, and the tools', () => {
    const { messages, tools } = request();
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[2]!.parts[0]).toEqual({
      type: 'text',
      text: 'Context: {"kind":"unit","courseId":"c1","unitId":"u1"}\n\nПочему «en bil», а не «et bil»?',
    });
    expect(tools?.map((t) => t.name)).toEqual(['get_unit_material']);
  });
});

describe('student_assist@1 answer', () => {
  it('passes a well-formed answer and resolves references to the tools\' own sources', () => {
    const checked = check(answer());
    expect(checked.isOk).toBe(true);
    expect(toAssistAnswer(answer(), evidence)).toEqual({
      blocks: [
        { type: 'text', text: '«Bil» — мужского рода, поэтому en bil.', emphasis: [[1, 4]] },
        { type: 'example', text: 'Jeg har en bil.' },
      ],
      citations: [rule],
      suggestions: [
        { kind: 'ask', text: 'А какие слова среднего рода?' },
        { kind: 'add_word', lemma: 'bil', translation: 'машина' },
        { kind: 'open', target: lesson },
      ],
    });
  });

  it('keeps one citation per source', () => {
    const twice = answer({ citations: [{ kind: 'grammar_rule', id: 'r-gender' }, { kind: 'grammar_rule', id: 'r-gender' }] });
    expect(check(twice).isOk).toBe(true);
    expect(toAssistAnswer(twice, evidence).citations).toEqual([rule]);
  });

  it('refuses a citation no tool returned in this turn (R-e)', () => {
    const invented = check(answer({ citations: [{ kind: 'grammar_rule', id: 'r-from-memory' }] }));
    expect(invented.isFail).toBe(true);
    expect(invented.error.message).toContain('was not returned by a tool');
    // Same id, other kind: a lesson is not a rule.
    expect(check(answer({ citations: [{ kind: 'lesson', id: 'r-gender' }] })).isFail).toBe(true);
    expect(check(answer({ citations: [] }), { ...evidence, sources: [] }).isFail).toBe(true);
  });

  it('refuses material to open that no tool returned', () => {
    const open = answer({ suggestions: [{ ...none, kind: 'open', target: { kind: 'unit', id: 'u-other' } }] });
    expect(check(open).isFail).toBe(true);
    expect(check(answer({ suggestions: [{ ...none, kind: 'open' }] })).isFail).toBe(true);
  });

  it('refuses a word to save that occurs nowhere in the turn (R-i)', () => {
    const add = (lemma: string) => answer({ suggestions: [{ ...none, kind: 'add_word', lemma, translation: null }] });
    expect(check(add('bil')).isOk).toBe(true);
    expect(check(add('BIL')).isOk).toBe(true);
    expect(check(add('sykkel')).error.message).toContain('occurs nowhere');
    expect(check(add('  ')).isFail).toBe(true);
    expect(toAssistAnswer(add('bil'), evidence).suggestions).toEqual([{ kind: 'add_word', lemma: 'bil' }]);
  });

  it('refuses a follow-up question without text', () => {
    expect(check(answer({ suggestions: [{ ...none, kind: 'ask' }] })).isFail).toBe(true);
  });

  it('refuses blank blocks, no blocks, and emphasis outside the text', () => {
    expect(check(answer({ blocks: [block('   ')] })).isFail).toBe(true);
    expect(check(answer({ blocks: [] })).isFail).toBe(true);
    expect(check(answer({ blocks: [block('kort', [[2, 9]])] })).error.message).toContain('outside its text');
    expect(check(answer({ blocks: [block('kort', [[3, 3]])] })).isFail).toBe(true);
  });

  it('refuses what is off the schema', () => {
    expect(check({ text: 'Svaret er …' }).isFail).toBe(true);
    expect(check(answer({ suggestions: [{ kind: 'ask', text: 'Hva?' }] })).isFail).toBe(true);
  });
});

describe('student_assist@1 on fake', () => {
  const fake = new FakeLlmProvider();
  const ref = { providerCode: 'fake', providerModelId: 'fake', features: {} } as never;

  it('the sampled answer passes the guard and the verifier', async () => {
    const result = await fake.complete(request(), ref);
    const checked = guard.check(result, request());
    expect(checked.isOk).toBe(true);
    expect(toAssistAnswer((checked.value.output as { data: unknown }).data, evidence).blocks).toHaveLength(1);
  });

  it('a tool call passes through untouched, for the loop to run', async () => {
    const asked = { ...request(), system: `${request().system}\n@fake:tool_call` };
    const result = await fake.complete(asked, ref);
    const checked = guard.check(result, asked);
    expect(checked.isOk).toBe(true);
    expect(checked.value.output.kind).toBe('tool_calls');
  });
});

describe('occursAsWord', () => {
  it('matches whole words in any case, not parts of words', () => {
    expect(occursAsWord('bil', 'Jeg har en Bil.')).toBe(true);
    expect(occursAsWord('bil', 'bilen er rød')).toBe(false);
    expect(occursAsWord('å', 'Hva betyr «å»?')).toBe(true);
    expect(occursAsWord('ha det', 'Ha det bra!')).toBe(true);
    expect(occursAsWord('c++', 'Jeg skriver c++ hver dag')).toBe(true);
  });
});
