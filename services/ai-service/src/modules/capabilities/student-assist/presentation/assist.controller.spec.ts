import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { EventEmitter } from 'node:events';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { AskAssistantCommand } from '../application/ask-assistant/ask-assistant.command.js';
import type { AskAssistantOutcome } from '../application/ask-assistant/ask-assistant.handler.js';
import type { AssistAvailability } from '../application/assist-availability/assist-availability.query.js';
import { GiveAssistFeedbackCommand } from '../application/give-feedback/give-assist-feedback.command.js';
import type { GiveAssistFeedbackOutcome } from '../application/give-feedback/give-assist-feedback.handler.js';
import { AssistController } from './assist.controller.js';
import type { AskAssistantDto, AskAssistantQueryDto } from './assist.dto.js';

const LEARNER: AuthenticatedUser = { userId: 'c8655ecd-0000-4000-8000-000000000001', roles: ['student'], isPlatformAdmin: false };
const COURSE = 'b1000000-0000-4000-8000-000000000001';
const UNIT = 'b2000000-0000-4000-8000-000000000002';
const ANSWER = { blocks: [{ type: 'text' as const, text: 'V2.' }], citations: [], suggestions: [] };

function setup(
  outcome: AskAssistantOutcome | AssistAvailability | GiveAssistFeedbackOutcome,
  /** What the handler does with a streamed turn's client before it returns. */
  during?: (command: AskAssistantCommand) => void,
) {
  const sent: unknown[] = [];
  const bus = {
    execute: async (message: unknown) => {
      sent.push(message);
      if (during && message instanceof AskAssistantCommand) during(message);
      return outcome;
    },
  };
  return { controller: new AssistController(bus as unknown as CommandBus, bus as unknown as QueryBus), sent };
}

/** Just what the controller writes to a response. */
class FakeResponse extends EventEmitter {
  statusCode = 0;
  readonly headers: Record<string, string> = {};
  body: unknown = undefined;
  written = '';
  ended = false;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(body: unknown) {
    this.body = body;
    this.ended = true;
    return this;
  }
  setHeader(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
  }
  flushHeaders() {}
  write(chunk: string) {
    this.written += chunk;
    return true;
  }
  end() {
    this.ended = true;
  }
  /** The events written, as `[name, data]`. */
  events(): [string, unknown][] {
    return this.written
      .split('\n\n')
      .filter(Boolean)
      .map((frame) => {
        const [event, data] = frame.split('\n');
        return [event!.replace('event: ', ''), JSON.parse(data!.replace('data: ', ''))];
      });
  }
}

async function post(controller: AssistController, dto: AskAssistantDto, query: AskAssistantQueryDto = {}) {
  const res = new FakeResponse();
  await controller.message(dto, query, LEARNER, res as unknown as Response);
  return res;
}

const body = (over: Partial<AskAssistantDto> = {}): AskAssistantDto =>
  ({ context: { kind: 'unit', courseId: COURSE, unitId: UNIT }, history: [], message: 'Hvorfor?', ...over }) as AskAssistantDto;

describe('AssistController', () => {
  describe('messages', () => {
    it('answers with the callId of the answering round beside the answer, and hands the turn on whole', async () => {
      const { controller, sent } = setup({ kind: 'answered', callId: 'call-2', answer: ANSWER, rounds: 2 });
      const history = [{ role: 'user' as const, text: 'Hei' }, { role: 'assistant' as const, text: 'Hei!' }];
      const res = await post(controller, body({ history }));
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ callId: 'call-2', ...ANSWER });
      expect(sent[0]).toEqual(new AskAssistantCommand(LEARNER.userId, { kind: 'unit', courseId: COURSE, unitId: UNIT }, history, 'Hvorfor?'));
    });

    it('refuses a history longer than 4000 characters together before any turn', async () => {
      const { controller, sent } = setup({ kind: 'answered', callId: 'c', answer: ANSWER, rounds: 1 });
      const history = Array.from({ length: 5 }, () => ({ role: 'user' as const, text: 'x'.repeat(801) }));
      await expect(post(controller, body({ history }))).rejects.toThrow(BadRequestException);
      expect(sent).toEqual([]);
    });

    it('tells a refusal as 409 with its reason', async () => {
      const { controller } = setup({ kind: 'refused', reason: 'quota', callId: 'c' });
      const err = await post(controller, body()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({ statusCode: 409, reason: 'quota' });
    });

    it('tells silence as 503 without its cause', async () => {
      const { controller } = setup({ kind: 'silent', cause: 'tool_budget', callId: 'c', rounds: 5 });
      const err = await post(controller, body()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(JSON.stringify((err as ServiceUnavailableException).getResponse())).not.toContain('tool_budget');
    });

    it.each([
      [{ code: 'invalid_context', message: 'A unit context needs courseId and unitId' }, UnprocessableEntityException],
      [{ code: 'not_found' }, NotFoundException],
      [{ code: 'not_enrolled' }, ForbiddenException],
    ] as const)('tells a rejected context %o as its status', async (error, type) => {
      const { controller } = setup({ kind: 'rejected', error });
      await expect(post(controller, body())).rejects.toThrow(type);
    });
  });

  describe('messages ?stream=1 (step 9)', () => {
    const STREAM = { stream: '1' } as const;
    const speak = (command: AskAssistantCommand) => {
      command.stream!.send({ type: 'reset' });
      command.stream!.send({ type: 'delta', delta: { block: 0, type: 'text', text: 'V' } });
      command.stream!.send({ type: 'reset' });
      command.stream!.send({ type: 'delta', delta: { block: 0, type: 'text', text: 'V2.' } });
    };

    it('streams the text as events and ends with the answer', async () => {
      const { controller } = setup({ kind: 'answered', callId: 'call-2', answer: ANSWER, rounds: 2 }, speak);
      const res = await post(controller, body(), STREAM);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/event-stream; charset=utf-8');
      expect(res.headers['x-accel-buffering']).toBe('no');
      // The first reset came before anything was sent: nothing to void, nothing written.
      expect(res.events()).toEqual([
        ['delta', { block: 0, type: 'text', text: 'V' }],
        ['reset', {}],
        ['delta', { block: 0, type: 'text', text: 'V2.' }],
        ['answer', { callId: 'call-2', ...ANSWER }],
      ]);
      expect(res.ended).toBe(true);
      expect(res.body).toBeUndefined();
    });

    it.each([
      [{ kind: 'refused', reason: 'quota', callId: 'c' }, ['refused', { reason: 'quota' }]],
      [{ kind: 'silent', cause: 'invalid_response', callId: 'c', rounds: 2 }, ['unavailable', {}]],
    ] as const)('ends a stream that had started with %o as an event, not a status', async (outcome, last) => {
      const { controller } = setup(outcome, speak);
      const res = await post(controller, body(), STREAM);
      expect(res.events().at(-1)).toEqual(last);
      expect(res.ended).toBe(true);
    });

    it('answers as without stream when nothing was sent before the outcome', async () => {
      const { controller } = setup({ kind: 'answered', callId: 'call-1', answer: ANSWER, rounds: 1 });
      const res = await post(controller, body(), STREAM);
      expect(res.written).toBe('');
      expect(res.body).toEqual({ callId: 'call-1', ...ANSWER });
      const refused = setup({ kind: 'refused', reason: 'no_key', callId: 'c' });
      await expect(post(refused.controller, body(), STREAM)).rejects.toThrow(ConflictException);
    });

    it('hands the turn a client only when asked to stream, and tells it when the client has gone', async () => {
      const res = new FakeResponse();
      const closed: (boolean | undefined)[] = [];
      const { controller, sent } = setup({ kind: 'silent', cause: 'client_closed', callId: null, rounds: 1 }, (command) => {
        closed.push(command.stream?.closed());
        res.emit('close');
        closed.push(command.stream?.closed());
      });
      await post(controller, body(), { stream: '0' }).catch(() => undefined);
      expect((sent[0] as AskAssistantCommand).stream).toBeUndefined();

      await controller.message(body(), STREAM, LEARNER, res as unknown as Response).catch(() => undefined);
      expect(closed.slice(2)).toEqual([false, true]);
    });
  });

  describe('availability', () => {
    it.each([
      [{ kind: 'available' }, { available: true }],
      [{ kind: 'unavailable', reason: 'no_key' }, { available: false, reason: 'no_key' }],
      [{ kind: 'unavailable', reason: null }, { available: false }],
    ] as [AssistAvailability, unknown][])('answers %o as %o', async (result, expected) => {
      const { controller } = setup(result);
      expect(await controller.availability({ kind: 'unit', courseId: COURSE, unitId: UNIT }, LEARNER)).toEqual(expected);
    });

    it('rejects a context as a message in it would be', async () => {
      const { controller } = setup({ kind: 'rejected', error: { code: 'not_found' } });
      await expect(controller.availability({ kind: 'class' }, LEARNER)).rejects.toThrow(NotFoundException);
    });
  });

  describe('feedback', () => {
    const CALL = 'a1000000-0000-4000-8000-000000000001';

    it('hands the mark on with the caller from the token, and answers nothing', async () => {
      const { controller, sent } = setup({ kind: 'recorded' });
      expect(await controller.feedback({ callId: CALL, helpful: false, reason: 'Feil' }, LEARNER)).toBeUndefined();
      expect(sent[0]).toEqual(new GiveAssistFeedbackCommand(LEARNER.userId, CALL, false, 'Feil'));
    });

    it('sends no reason as null', async () => {
      const { controller, sent } = setup({ kind: 'recorded' });
      await controller.feedback({ callId: CALL, helpful: true }, LEARNER);
      expect(sent[0]).toEqual(new GiveAssistFeedbackCommand(LEARNER.userId, CALL, true, null));
    });

    it('is 404 for an answer that is not the learner’s, 409 for a second mark', async () => {
      await expect(setup({ kind: 'not_found' }).controller.feedback({ callId: CALL, helpful: true }, LEARNER)).rejects.toThrow(
        NotFoundException,
      );
      await expect(setup({ kind: 'already_given' }).controller.feedback({ callId: CALL, helpful: true }, LEARNER)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
