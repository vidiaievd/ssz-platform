import { Logger } from '@nestjs/common';
import type { AdmissionFailure, AiGateway } from '../../../../gateway/application/ai-gateway.js';
import type { AiBinding } from '../../../../registry/domain/binding.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AssistContext } from '../../domain/assist-answer.js';
import type { AssistAccess, AssistAccessError, AssistPayerResolver } from '../assist-payer.resolver.js';
import { GetAssistAvailabilityHandler, GetAssistAvailabilityQuery } from './assist-availability.query.js';

const LEARNER = 'c8655ecd-0000-4000-8000-000000000001';
const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const UNIT_CONTEXT: AssistContext = { kind: 'unit', courseId: 'b1000000-0000-4000-8000-000000000001', unitId: 'b2000000-0000-4000-8000-000000000002' };
const BINDING = { promptVersion: 'student_assist@1' } as AiBinding;

function setup(opts: {
  resolved?: Result<AssistAccess, AssistAccessError> | Error;
  admitted?: Result<void, AdmissionFailure>;
}) {
  const asked: { capability: string; payer: unknown }[] = [];
  const access = {
    resolve: async () => {
      if (opts.resolved instanceof Error) throw opts.resolved;
      return opts.resolved ?? Result.ok({ payer: { type: 'workspace', id: SCHOOL }, context: UNIT_CONTEXT });
    },
  } as unknown as AssistPayerResolver;
  const gateway = {
    admits: async (capability: string, payer: unknown) => {
      asked.push({ capability, payer });
      return opts.admitted ?? Result.ok();
    },
  } as unknown as AiGateway;
  return { handler: new GetAssistAvailabilityHandler(gateway, access), asked };
}

const ask = (handler: GetAssistAvailabilityHandler) => handler.execute(new GetAssistAvailabilityQuery(LEARNER, UNIT_CONTEXT));

describe('GetAssistAvailabilityHandler', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));

  it('asks the gateway for the payer the turn would get', async () => {
    const { handler, asked } = setup({});
    expect(await ask(handler)).toEqual({ kind: 'available' });
    expect(asked).toEqual([{ capability: 'student_assist', payer: { type: 'workspace', id: SCHOOL } }]);
  });

  it.each([
    [{ kind: 'refused', code: 'not_entitled', binding: BINDING }, 'no_key'],
    [{ kind: 'refused', code: 'ai_disabled', binding: BINDING }, 'policy'],
    [{ kind: 'refused', code: 'region_not_allowed', binding: BINDING }, 'policy'],
    [{ kind: 'refused', code: 'quota_exhausted', binding: BINDING }, 'quota'],
    [{ kind: 'disabled', binding: BINDING }, 'disabled'],
    [{ kind: 'disabled', binding: null }, 'no_binding'],
    [{ kind: 'gate_unavailable', binding: BINDING }, null],
  ] as [AdmissionFailure, string | null][])('tells %o as reason %s', async (failure, reason) => {
    const { handler } = setup({ admitted: Result.fail(failure) });
    expect(await ask(handler)).toEqual({ kind: 'unavailable', reason });
  });

  it('passes a rejected context on without asking the gateway', async () => {
    const { handler, asked } = setup({ resolved: Result.fail({ code: 'not_enrolled' }) });
    expect(await ask(handler)).toEqual({ kind: 'rejected', error: { code: 'not_enrolled' } });
    expect(asked).toEqual([]);
  });

  it('is unavailable without a reason when the context cannot be read', async () => {
    const { handler, asked } = setup({ resolved: new Error('learning-service down') });
    expect(await ask(handler)).toEqual({ kind: 'unavailable', reason: null });
    expect(asked).toEqual([]);
  });
});
