import { Logger } from '@nestjs/common';
import type { AiGateway, GatewayCall } from '../../../../gateway/application/ai-gateway.js';
import type { GatewayInput, GatewayRequest } from '../../../../gateway/application/model-router.js';
import type { CallContext } from '../../../../ledger/domain/ai-call.js';
import type { LlmOutput } from '../../../../providers/domain/llm-result.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AssistContext, AssistSource } from '../../domain/assist-answer.js';
import type { AssistPayerResolver } from '../assist-payer.resolver.js';
import type { AssistToolbox, AssistToolOutcome, AssistToolScope } from '../assist-toolbox.js';
import { AskAssistantCommand } from './ask-assistant.command.js';
import { AskAssistantHandler, MAX_TOOL_ROUNDS } from './ask-assistant.handler.js';

const LEARNER = 'c8655ecd-0000-4000-8000-000000000001';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const COURSE = 'b1000000-0000-4000-8000-000000000001';
const UNIT = 'b2000000-0000-4000-8000-000000000002';
const RULE = 'b3000000-0000-4000-8000-000000000003';

const UNIT_CONTEXT: AssistContext = { kind: 'unit', courseId: COURSE, unitId: UNIT };
const RULE_SOURCE: AssistSource = { kind: 'grammar_rule', id: RULE, title: 'Inversjon', unitId: UNIT, courseId: COURSE };
const SECRET = 'Hva betyr «hemmelig»?';

const MODEL = {
  model: { id: 'model-1', providerId: 'provider-1', providerModelId: 'fake-1' },
  provider: { code: 'fake' },
};
const BINDING = { promptVersion: 'student_assist@1' };
const USAGE = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 };

let callNo = 0;
const recorded = () => ({ callId: `call-${++callNo}`, cost: null, credits: '0' });

const ok = (output: LlmOutput): GatewayCall =>
  ({
    routed: Result.ok({ result: { output, usage: USAGE, stop: 'end' }, model: MODEL, role: 'primary', binding: BINDING, attempts: [] }),
    recorded: recorded(),
    latencyMs: 5,
  }) as unknown as GatewayCall;

const toolCall = (id = 'tu_1'): GatewayCall => ok({ kind: 'tool_calls', calls: [{ id, name: 'get_unit_material', input: {} }] });

const ANSWER = {
  blocks: [{ type: 'text', text: 'The verb comes second.', emphasis: [] }],
  citations: [{ kind: 'grammar_rule', id: RULE }],
  suggestions: [],
};
const answer = (data: unknown = ANSWER): GatewayCall => ok({ kind: 'structured', data });

const invalid = (raw: LlmOutput | null = { kind: 'structured', data: { blocks: [] } }): GatewayCall =>
  ({
    routed: Result.fail({
      kind: 'error',
      error: { code: 'invalid_response', message: 'Answer fails the checks: citation 1 was not returned by a tool' },
      model: MODEL,
      role: 'primary',
      binding: BINDING,
      raw: raw ? { output: raw, usage: USAGE } : null,
      attempts: [],
    }),
    recorded: recorded(),
    latencyMs: 5,
  }) as unknown as GatewayCall;

const notRouted = (failure: Record<string, unknown>): GatewayCall =>
  ({ routed: Result.fail({ binding: BINDING, attempts: [], ...failure }), recorded: recorded(), latencyMs: 1 }) as unknown as GatewayCall;

type Read = string | null | 'throws';
const reader = (value: Read) => async () => {
  if (value === 'throws') throw new Error('service down');
  return value;
};

interface Setup {
  script?: GatewayCall[];
  access?: Awaited<ReturnType<AssistPayerResolver['resolve']>> | 'throws';
  tool?: AssistToolOutcome;
  courseLanguage?: Read;
  schoolLanguage?: Read;
  learnerLanguage?: Read;
}

function setup({
  script = [toolCall(), answer()],
  access = Result.ok({ payer: { type: 'workspace', id: SCHOOL }, context: UNIT_CONTEXT }),
  tool = { content: '{"unit":"Leksjon 3"}', sources: [RULE_SOURCE] },
  courseLanguage = 'nb',
  schoolLanguage = 'uk',
  learnerLanguage = 'en',
}: Setup = {}) {
  const requests: GatewayRequest[] = [];
  const contexts: CallContext[] = [];
  const queue = [...script];
  const gateway = {
    call: async (_capability: string, context: CallContext, input: GatewayInput) => {
      contexts.push(context);
      requests.push(typeof input === 'function' ? input('student_assist@1') : input);
      const next = queue.shift();
      if (!next) throw new Error('script ran out');
      return next;
    },
  } as unknown as AiGateway;
  const resolver = {
    resolve: async () => {
      if (access === 'throws') throw new Error('learning down');
      return access;
    },
  } as unknown as AssistPayerResolver;
  const scopes: AssistToolScope[] = [];
  const toolbox = {
    toolsFor: () => [{ name: 'get_unit_material', description: 'd', inputSchema: { type: 'object' } }],
    run: async (_call: unknown, scope: AssistToolScope) => {
      scopes.push(scope);
      return tool;
    },
  } as unknown as AssistToolbox;

  const handler = new AskAssistantHandler(
    gateway,
    resolver,
    toolbox,
    { targetLanguage: reader(courseLanguage) },
    { explanationLanguage: reader(schoolLanguage) },
    { interfaceLanguage: reader(learnerLanguage) },
  );
  const ask = (context: AssistContext = UNIT_CONTEXT) =>
    handler.execute(new AskAssistantCommand(LEARNER, context, [{ role: 'assistant', text: 'Hei!' }], SECRET));
  return { ask, requests, contexts, scopes };
}

describe('AskAssistantHandler', () => {
  beforeEach(() => {
    callNo = 0;
  });

  it('runs a tool round, then answers with citations resolved from what the tool returned', async () => {
    const { ask, requests, contexts } = setup();
    const outcome = await ask();

    expect(outcome).toEqual({
      kind: 'answered',
      callId: 'call-2',
      rounds: 2,
      answer: { blocks: [{ type: 'text', text: 'The verb comes second.' }], citations: [RULE_SOURCE], suggestions: [] },
    });
    // Every round is a gateway call of its own, under the resolved payer and the context's surface.
    expect(contexts).toEqual([
      { payer: { type: 'workspace', id: SCHOOL }, actor: { userId: LEARNER, role: 'student' }, surface: 'assistant_unit' },
      { payer: { type: 'workspace', id: SCHOOL }, actor: { userId: LEARNER, role: 'student' }, surface: 'assistant_unit' },
    ]);
    const [first, second] = requests;
    expect(first!.messages).toHaveLength(2);
    expect(second!.messages.slice(2)).toEqual([
      { role: 'assistant', parts: [{ type: 'tool_call', id: 'tu_1', name: 'get_unit_material', input: {} }] },
      { role: 'user', parts: [{ type: 'tool_result', callId: 'tu_1', content: '{"unit":"Leksjon 3"}' }] },
    ]);
    expect(second!.tools?.map((t) => t.name)).toEqual(['get_unit_material']);
  });

  it('lets a round cite only what the tools returned before it', async () => {
    const { ask, requests } = setup();
    await ask();
    const cites = { ...ANSWER };
    expect(requests[0]!.responseSchema!.verify!(cites)).toContain('was not returned by a tool');
    expect(requests[1]!.responseSchema!.verify!(cites)).toBeNull();
  });

  it('answers straight away when the model needs no tool', async () => {
    const { ask, requests } = setup({ script: [answer({ ...ANSWER, citations: [] })] });
    expect(await ask()).toMatchObject({ kind: 'answered', callId: 'call-1', rounds: 1 });
    expect(requests).toHaveLength(1);
  });

  it(`stops after ${MAX_TOOL_ROUNDS} tool rounds — silence, not a fifth`, async () => {
    const script = Array.from({ length: MAX_TOOL_ROUNDS + 1 }, (_, i) => toolCall(`tu_${i}`));
    const { ask, requests } = setup({ script });
    expect(await ask()).toEqual({ kind: 'silent', cause: 'tool_budget', callId: `call-${MAX_TOOL_ROUNDS + 1}`, rounds: MAX_TOOL_ROUNDS + 1 });
    expect(requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
  });

  it('repairs an off-schema answer once, showing the model its answer and why', async () => {
    const { ask, requests } = setup({ script: [invalid(), answer({ ...ANSWER, citations: [] })] });
    expect(await ask()).toMatchObject({ kind: 'answered', callId: 'call-2', rounds: 2 });
    const repair = requests[1]!.messages.slice(-2);
    expect(repair[0]).toEqual({ role: 'assistant', parts: [{ type: 'text', text: '{"blocks":[]}' }] });
    expect(repair[1]!.role).toBe('user');
    expect(JSON.stringify(repair[1])).toContain('citation 1 was not returned by a tool');
  });

  it('is silent after a second off-schema answer', async () => {
    const { ask, requests } = setup({ script: [invalid(), invalid()] });
    expect(await ask()).toEqual({ kind: 'silent', cause: 'invalid_response', callId: 'call-2', rounds: 2 });
    expect(requests).toHaveLength(2);
  });

  it('is silent without a repair when the refused answer did not come back', async () => {
    const { ask } = setup({ script: [invalid(null)] });
    expect(await ask()).toMatchObject({ kind: 'silent', cause: 'invalid_response', rounds: 1 });
  });

  it('is silent when every model failed', async () => {
    const failed = {
      ...(invalid() as object),
      routed: Result.fail({ kind: 'error', error: { code: 'timeout', message: 't' }, model: MODEL, role: 'fallback', binding: BINDING, raw: null, attempts: [] }),
    } as unknown as GatewayCall;
    const { ask } = setup({ script: [failed] });
    expect(await ask()).toMatchObject({ kind: 'silent', cause: 'timeout' });
  });

  it.each([
    [{ kind: 'refused', code: 'not_entitled' }, 'no_key'],
    [{ kind: 'refused', code: 'quota_exhausted' }, 'quota'],
    [{ kind: 'refused', code: 'ai_disabled' }, 'policy'],
    [{ kind: 'refused', code: 'region_not_allowed' }, 'policy'],
    [{ kind: 'disabled' }, 'disabled'],
    [{ kind: 'disabled', binding: null }, 'no_binding'],
  ])('maps the refusal %j to reason %s', async (failure, reason) => {
    const { ask } = setup({ script: [notRouted(failure)] });
    expect(await ask()).toEqual({ kind: 'refused', reason, callId: 'call-1' });
  });

  it('refuses a round mid-turn like the first: the quota ran out after a tool round', async () => {
    const { ask } = setup({ script: [toolCall(), notRouted({ kind: 'refused', code: 'quota_exhausted' })] });
    expect(await ask()).toEqual({ kind: 'refused', reason: 'quota', callId: 'call-2' });
  });

  it('is silent, not refused, when the gate could not read the tariff', async () => {
    const { ask } = setup({ script: [notRouted({ kind: 'gate_unavailable' })] });
    expect(await ask()).toMatchObject({ kind: 'silent', cause: 'gate_unavailable' });
  });

  it('passes the resolver refusal through without calling a model', async () => {
    const { ask, requests } = setup({ access: Result.fail({ code: 'not_enrolled' }) });
    expect(await ask()).toEqual({ kind: 'rejected', error: { code: 'not_enrolled' } });
    expect(requests).toHaveLength(0);
  });

  it('is silent when the context could not be checked', async () => {
    const { ask, requests } = setup({ access: 'throws' });
    expect(await ask()).toEqual({ kind: 'silent', cause: 'context_unavailable', callId: null, rounds: 0 });
    expect(requests).toHaveLength(0);
  });

  describe('languages (Q5)', () => {
    it("a school's course: the school's explanation language and the course's target language", async () => {
      const { ask, requests, scopes } = setup();
      await ask();
      expect(requests[0]!.system).toContain('a learner of Norwegian Bokmål');
      expect(requests[0]!.system).toContain('Write every explanation in Ukrainian');
      expect(scopes[0]!.language).toBe('uk');
    });

    it("a school without one, or the learner's own plan: the learner's interface language", async () => {
      const noSchool = setup({ schoolLanguage: null });
      await noSchool.ask();
      expect(noSchool.scopes[0]!.language).toBe('en');

      const own = setup({ access: Result.ok({ payer: { type: 'user', id: LEARNER }, context: UNIT_CONTEXT }), learnerLanguage: 'ru' });
      await own.ask();
      expect(own.requests[0]!.system).toContain('Write every explanation in Russian');
    });

    it('unreadable languages fall back rather than fail the turn', async () => {
      const { ask, requests } = setup({ courseLanguage: 'throws', schoolLanguage: 'throws', learnerLanguage: 'throws' });
      expect(await ask()).toMatchObject({ kind: 'answered' });
      expect(requests[0]!.system).toContain('a learner of the language they are learning');
      expect(requests[0]!.system).toContain('Write every explanation in English');
    });
  });

  it('logs codes and ids, never what the learner wrote or a tool returned (R-j)', async () => {
    const logged: string[] = [];
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => void logged.push(String(m)));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => void logged.push(String(m)));
    try {
      await setup({ courseLanguage: 'throws' }).ask();
      await setup({ script: [invalid(), invalid()] }).ask();
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) {
      expect(line).not.toContain('hemmelig');
      expect(line).not.toContain('Leksjon 3');
      expect(line).not.toContain('Hei!');
      expect(line).not.toContain('citation 1');
    }
  });
});
