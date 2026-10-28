import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { AskAssistantCommand } from '../application/ask-assistant/ask-assistant.command.js';
import type { AskAssistantOutcome } from '../application/ask-assistant/ask-assistant.handler.js';
import type { AssistAvailability } from '../application/assist-availability/assist-availability.query.js';
import { GiveAssistFeedbackCommand } from '../application/give-feedback/give-assist-feedback.command.js';
import type { GiveAssistFeedbackOutcome } from '../application/give-feedback/give-assist-feedback.handler.js';
import { AssistController } from './assist.controller.js';
import type { AskAssistantDto } from './assist.dto.js';

const LEARNER: AuthenticatedUser = { userId: 'c8655ecd-0000-4000-8000-000000000001', roles: ['student'], isPlatformAdmin: false };
const COURSE = 'b1000000-0000-4000-8000-000000000001';
const UNIT = 'b2000000-0000-4000-8000-000000000002';
const ANSWER = { blocks: [{ type: 'text' as const, text: 'V2.' }], citations: [], suggestions: [] };

function setup(outcome: AskAssistantOutcome | AssistAvailability | GiveAssistFeedbackOutcome) {
  const sent: unknown[] = [];
  const bus = {
    execute: async (message: unknown) => {
      sent.push(message);
      return outcome;
    },
  };
  return { controller: new AssistController(bus as unknown as CommandBus, bus as unknown as QueryBus), sent };
}

const body = (over: Partial<AskAssistantDto> = {}): AskAssistantDto =>
  ({ context: { kind: 'unit', courseId: COURSE, unitId: UNIT }, history: [], message: 'Hvorfor?', ...over }) as AskAssistantDto;

describe('AssistController', () => {
  describe('messages', () => {
    it('answers with the callId of the answering round beside the answer, and hands the turn on whole', async () => {
      const { controller, sent } = setup({ kind: 'answered', callId: 'call-2', answer: ANSWER, rounds: 2 });
      const history = [{ role: 'user' as const, text: 'Hei' }, { role: 'assistant' as const, text: 'Hei!' }];
      expect(await controller.message(body({ history }), LEARNER)).toEqual({ callId: 'call-2', ...ANSWER });
      expect(sent[0]).toEqual(new AskAssistantCommand(LEARNER.userId, { kind: 'unit', courseId: COURSE, unitId: UNIT }, history, 'Hvorfor?'));
    });

    it('refuses a history longer than 4000 characters together before any turn', async () => {
      const { controller, sent } = setup({ kind: 'answered', callId: 'c', answer: ANSWER, rounds: 1 });
      const history = Array.from({ length: 5 }, () => ({ role: 'user' as const, text: 'x'.repeat(801) }));
      await expect(controller.message(body({ history }), LEARNER)).rejects.toThrow(BadRequestException);
      expect(sent).toEqual([]);
    });

    it('tells a refusal as 409 with its reason', async () => {
      const { controller } = setup({ kind: 'refused', reason: 'quota', callId: 'c' });
      const err = await controller.message(body(), LEARNER).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({ statusCode: 409, reason: 'quota' });
    });

    it('tells silence as 503 without its cause', async () => {
      const { controller } = setup({ kind: 'silent', cause: 'tool_budget', callId: 'c', rounds: 5 });
      const err = await controller.message(body(), LEARNER).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect(JSON.stringify((err as ServiceUnavailableException).getResponse())).not.toContain('tool_budget');
    });

    it.each([
      [{ code: 'invalid_context', message: 'A unit context needs courseId and unitId' }, UnprocessableEntityException],
      [{ code: 'not_found' }, NotFoundException],
      [{ code: 'not_enrolled' }, ForbiddenException],
    ] as const)('tells a rejected context %o as its status', async (error, type) => {
      const { controller } = setup({ kind: 'rejected', error });
      await expect(controller.message(body(), LEARNER)).rejects.toThrow(type);
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
