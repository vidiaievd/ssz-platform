import { jest } from '@jest/globals';
import { Result } from '../../../src/shared/kernel/result.js';
import { StartSoundSessionHandler } from '../../../src/modules/sound-sessions/application/commands/start-sound-session/start-sound-session.handler.js';
import { StartSoundSessionCommand } from '../../../src/modules/sound-sessions/application/commands/start-sound-session/start-sound-session.command.js';
import { StartAttemptCommand } from '../../../src/modules/attempts/application/commands/start-attempt/start-attempt.command.js';
import { AbandonAttemptCommand } from '../../../src/modules/attempts/application/commands/abandon-attempt/abandon-attempt.command.js';
import { CreateProbeCommand } from '../../../src/modules/probes/application/commands/create-probe/create-probe.command.js';
import { ProbeTask } from '../../../src/modules/probes/domain/entities/probe-task.entity.js';
import { SoundSessionSourceError } from '../../../src/modules/sound-sessions/application/ports/sound-session.ports.js';
import { planSession, type SessionPlan } from '../../../src/modules/sound-sessions/domain/session-plan.js';
import { startState, type SessionState } from '../../../src/modules/sound-sessions/domain/session-step.js';
import { readState, toContent } from '../../../src/modules/sound-sessions/domain/sound-session-template.js';
import { first, material, noRecord } from './fixtures.js';

const USER = '11111111-1111-4111-8111-111111111111';

function probeOf(plan: SessionPlan, opts: { expired?: boolean; userId?: string } = {}): ProbeTask {
  return ProbeTask.create({
    userId: opts.userId ?? USER,
    subject: { atomType: 'sound', atomId: 'nb:kj' },
    requiredModality: 'production',
    definition: {
      templateCode: 'sound_session',
      targetLanguage: plan.language,
      difficultyLevel: 'A1',
      content: toContent(plan),
      expectedAnswers: null,
      answerCheckSettings: null,
      instruction: null,
    },
    ttlSeconds: opts.expired ? 1 : 3600,
    now: opts.expired ? new Date(Date.now() - 10_000) : new Date(),
  });
}

/** An attempt as far as the handler reads it. */
function attemptOf(id: string, exerciseId: string, state: SessionState | null) {
  let stored: unknown = state;
  return {
    id,
    exerciseId,
    userId: USER,
    get sessionState() {
      return stored;
    },
    recordSessionState: jest.fn((s: unknown) => {
      stored = s;
      return Result.ok<void, Error>();
    }),
  };
}

function setup(over: { open?: ReturnType<typeof attemptOf>[]; probes?: ProbeTask[]; learner?: unknown; drill?: unknown } = {}) {
  const created: ProbeTask[] = [];
  const started = attemptOf('attempt-new', 'probe-new', null);
  const commandBus = {
    execute: jest.fn(async (command: unknown) => {
      if (command instanceof CreateProbeCommand) {
        const probe = ProbeTask.create({
          userId: command.userId,
          subject: command.subject,
          requiredModality: command.requiredModality,
          definition: command.definition,
          skills: command.skills,
          focus: command.focus,
          targets: command.targets ?? undefined,
          source: command.source,
          ttlSeconds: 3600,
        });
        created.push(probe);
        return Result.ok(probe);
      }
      if (command instanceof StartAttemptCommand) return Result.ok({ attemptId: 'attempt-new' });
      if (command instanceof AbandonAttemptCommand) return Result.ok();
      throw new Error('unexpected command');
    }),
  };
  const attempts = {
    findInProgressByTemplate: jest.fn(async () => over.open ?? []),
    findById: jest.fn(async (id: string) => (id === 'attempt-new' ? started : null)),
    save: jest.fn(async () => undefined),
  };
  const probes = {
    findById: jest.fn(async (id: string) => (over.probes ?? []).find((p) => p.id === id) ?? null),
  };
  const learner = { read: jest.fn(async () => over.learner ?? Result.ok(noRecord)) };
  const drill = { read: jest.fn(async () => over.drill ?? Result.ok(material())) };
  const handler = new StartSoundSessionHandler(
    commandBus as any,
    attempts as any,
    probes as any,
    learner as any,
    drill as any,
  );
  handler.rand = first;
  return { handler, commandBus, attempts, learner, drill, created, started };
}

const commandsOf = (bus: { execute: jest.Mock }) => bus.execute.mock.calls.map(([c]) => (c as object).constructor.name);

describe('StartSoundSessionHandler — a new session', () => {
  it('a cold start: the diagnostic, on a probe of `sound_session`, with its first state written', async () => {
    const { handler, commandBus, attempts, created, started } = setup();
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'NB', null));

    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({
      attemptId: 'attempt-new',
      resumed: false,
      language: 'nb',
      basis: 'diagnostic',
      phase: 'diagnostic',
      takes: 0,
      maxTakes: 10,
      sounds: [],
      diagnostic: { measured: 0, total: 5 },
      step: { phase: 'diagnostic', atomId: 'nb:kj', index: 0, word: 'kjenne' },
    });
    expect(commandsOf(commandBus)).toEqual(['CreateProbeCommand', 'StartAttemptCommand']);

    const probe = created[0]!;
    expect(probe.definition.templateCode).toBe('sound_session');
    expect(probe).toMatchObject({ requiredModality: 'production', skills: ['spoken'], focus: ['pronunciation'], source: 'generated' });
    // The subject as context: the session rates sounds by its gaps, never by the attempt's score.
    expect(probe.targets).toEqual([{ itemKey: null, atomType: 'sound', atomId: 'nb:kj', role: 'context' }]);

    const start = commandBus.execute.mock.calls[1]![0] as StartAttemptCommand;
    expect(start).toMatchObject({ userId: USER, exerciseId: probe.id, checkMode: 'PRACTICE' });
    expect(readState(started.sessionState)).toMatchObject({ phase: 'diagnostic' });
    expect(attempts.save).toHaveBeenCalledWith(started);
  });

  it('the record decides when there is one', async () => {
    const { handler } = setup({ learner: Result.ok({ cards: [{ atomId: 'nb:sj', due: true }], flags: [] }) });
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', null));
    expect(result.value).toMatchObject({
      basis: 'record',
      phase: 'drill',
      sounds: [{ atomId: 'nb:sj', family: 'sj', status: 'open' }],
      diagnostic: null,
      step: { phase: 'drill', atomId: 'nb:sj', element: { kind: 'word' } },
    });
  });

  it('a chosen sound', async () => {
    const { handler, created } = setup();
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', 'nb:tone'));
    expect(result.value).toMatchObject({ basis: 'chosen', sounds: [{ atomId: 'nb:tone' }] });
    expect(created[0]!.subject).toEqual({ atomType: 'sound', atomId: 'nb:tone' });
  });

  it('the material of every sound is read: the diagnostic may need any of them', async () => {
    const { handler, drill } = setup();
    await handler.execute(new StartSoundSessionCommand(USER, 'nb', null));
    expect(drill.read).toHaveBeenCalledWith('nb', []);
  });

  it('learning away is a refusal, never «no record»', async () => {
    const { handler, commandBus } = setup({
      learner: Result.fail(new SoundSessionSourceError('learning', 401, 'Invalid or missing x-service-token')),
    });
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', null));
    expect(result.error).toEqual({ code: 'SOURCE_UNAVAILABLE', source: 'learning', statusCode: 401 });
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('content away is a refusal', async () => {
    const { handler } = setup({ drill: Result.fail(new SoundSessionSourceError('content', 503, 'down')) });
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', null));
    expect(result.error).toMatchObject({ code: 'SOURCE_UNAVAILABLE', source: 'content' });
  });

  it('a chosen sound without material', async () => {
    const { handler } = setup();
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', 'nb:retroflex'));
    expect(result.error).toEqual({ code: 'SOUND_NOT_DRILLABLE', atomId: 'nb:retroflex' });
  });

  it('no material at all', async () => {
    const { handler } = setup({ drill: Result.ok({ language: 'nb', atoms: [], diagnostic: [] }) });
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', null));
    expect(result.error).toEqual({ code: 'NO_MATERIAL', language: 'nb' });
  });
});

describe('StartSoundSessionHandler — an open session', () => {
  const plan = planSession({ material: material(), learner: noRecord, rand: first }) as SessionPlan;
  const chosenKj = planSession({ material: material(), learner: noRecord, chosen: 'nb:kj', rand: first }) as SessionPlan;

  it('is handed back as it stands, nothing read, nothing made', async () => {
    const probe = probeOf(plan);
    const open = attemptOf('attempt-open', probe.id, startState(plan));
    const { handler, commandBus, learner } = setup({ open: [open], probes: [probe] });

    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', null));
    expect(result.value).toMatchObject({ attemptId: 'attempt-open', probeId: probe.id, resumed: true, phase: 'diagnostic' });
    expect(commandBus.execute).not.toHaveBeenCalled();
    expect(learner.read).not.toHaveBeenCalled();
  });

  it.each<[string, () => { probe: ProbeTask; state: SessionState | null; language: string; atomId: string | null }]>([
    ['its probe has expired', () => ({ probe: probeOf(plan, { expired: true }), state: startState(plan), language: 'nb', atomId: null })],
    ['another language', () => ({ probe: probeOf(plan), state: startState(plan), language: 'sv', atomId: null })],
    ['another sound chosen', () => ({ probe: probeOf(chosenKj), state: startState(chosenKj), language: 'nb', atomId: 'nb:sj' })],
    ['a sound chosen over a planned session', () => ({ probe: probeOf(plan), state: startState(plan), language: 'nb', atomId: 'nb:kj' })],
    ['no state on it', () => ({ probe: probeOf(plan), state: null, language: 'nb', atomId: null })],
  ])('is abandoned and a new one begun when %s', async (_name, make) => {
    const { probe, state, language, atomId } = make();
    const open = attemptOf('attempt-open', probe.id, state);
    const drill = language === 'sv' ? Result.ok({ ...material(), language: 'sv' }) : undefined;
    const { handler, commandBus } = setup({ open: [open], probes: [probe], drill });

    const result = await handler.execute(new StartSoundSessionCommand(USER, language, atomId));
    expect(result.isOk).toBe(true);
    expect(result.value).toMatchObject({ attemptId: 'attempt-new', resumed: false });
    expect(commandsOf(commandBus)).toEqual(['AbandonAttemptCommand', 'CreateProbeCommand', 'StartAttemptCommand']);
    expect(commandBus.execute.mock.calls[0]![0]).toEqual(new AbandonAttemptCommand('attempt-open', USER));
  });

  it.each<[string, string, unknown]>([
    ['a sound that cannot be drilled', 'nb:retroflex', undefined],
    ['content away', 'nb:sj', Result.fail(new SoundSessionSourceError('content', 503, 'down'))],
  ])('a refused request leaves the open session alone: %s', async (_name, atomId, drill) => {
    const probe = probeOf(chosenKj);
    const open = attemptOf('attempt-open', probe.id, startState(chosenKj));
    const { handler, commandBus } = setup({ open: [open], probes: [probe], drill });
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', atomId));
    expect(result.isFail).toBe(true);
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('the same chosen sound resumes', async () => {
    const probe = probeOf(chosenKj);
    const open = attemptOf('attempt-open', probe.id, startState(chosenKj));
    const { handler } = setup({ open: [open], probes: [probe] });
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', 'nb:kj'));
    expect(result.value).toMatchObject({ resumed: true, basis: 'chosen' });
  });

  it('two open sessions: the newest is resumed, the older abandoned', async () => {
    const newer = probeOf(plan);
    const older = probeOf(plan);
    const { handler, commandBus } = setup({
      open: [attemptOf('attempt-newer', newer.id, startState(plan)), attemptOf('attempt-older', older.id, startState(plan))],
      probes: [newer, older],
    });
    const result = await handler.execute(new StartSoundSessionCommand(USER, 'nb', null));
    expect(result.value).toMatchObject({ attemptId: 'attempt-newer', resumed: true });
    expect(commandBus.execute.mock.calls.map(([c]) => c)).toEqual([new AbandonAttemptCommand('attempt-older', USER)]);
  });
});
