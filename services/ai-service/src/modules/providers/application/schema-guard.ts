import { Injectable } from '@nestjs/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { Result } from '../../../shared/kernel/result.js';
import { LlmError } from '../domain/llm-error.js';
import type { LlmRequest } from '../domain/llm-request.js';
import type { LlmResult } from '../domain/llm-result.js';

type ValidateFn = ((data: unknown) => boolean) & { errors?: unknown[] | null };

/**
 * The last word on whether a model's answer is usable. Runs on every structured call,
 * whatever the provider's `structuredOutput` mode — `native` providers still drift, and
 * `json_mode` / `none` promise nothing about the shape.
 *
 * Strict by design: no type coercion, no defaults, no stripping of extra properties. An
 * answer either satisfies the schema as written or is `invalid_response` — never "close
 * enough", because the caller hands it to the kernel's validator or to a learner.
 *
 * After the schema, the request's own `verify` (if any) has its say, with the same verdict.
 *
 * On success the result comes back with `output.kind = 'structured'`: a text answer from a
 * `json_mode` / `none` model is parsed here, so callers read one shape.
 */
@Injectable()
export class SchemaGuard {
  // Typed loosely: ajv + ajv-formats are CJS and their default exports do not line up with
  // moduleResolution nodenext (same workaround as exercise-engine's answer validator).
  private readonly ajv: any;
  private readonly compiled = new WeakMap<object, ValidateFn>();

  constructor() {
    this.ajv = new (Ajv as any)({ allErrors: true, strict: false });
    (addFormats as any)(this.ajv);
  }

  check(result: LlmResult, request: LlmRequest): Result<LlmResult, LlmError> {
    if (result.stop === 'refusal' || result.stop === 'filtered') {
      return Result.fail(new LlmError('filtered', `Model stopped with "${result.stop}"`));
    }

    const schema = request.responseSchema?.schema;
    // No schema asked for, or the model is mid-loop asking for a tool — nothing to check yet.
    if (!schema || result.output.kind === 'tool_calls') return Result.ok(result);

    let data: unknown;
    if (result.output.kind === 'structured') {
      data = result.output.data;
    } else {
      try {
        data = JSON.parse(result.output.text);
      } catch {
        const reason = result.stop === 'length' ? 'truncated at the output limit' : 'not valid JSON';
        return Result.fail(new LlmError('invalid_response', `Answer is ${reason}`));
      }
    }

    let validate: ValidateFn;
    try {
      validate = this.validatorFor(schema);
    } catch (err) {
      // The schema is ours, not the model's — a broken one is a programming error.
      throw new Error(
        `Response schema "${request.responseSchema!.name}" does not compile: ${(err as Error).message}`,
      );
    }

    if (!validate(data)) {
      return Result.fail(
        new LlmError(
          'invalid_response',
          `Answer does not match schema "${request.responseSchema!.name}": ${this.ajv.errorsText(validate.errors)}`,
        ),
      );
    }

    const problem = request.responseSchema!.verify?.(data) ?? null;
    if (problem) {
      return Result.fail(
        new LlmError('invalid_response', `Answer fails the checks of "${request.responseSchema!.name}": ${problem}`),
      );
    }

    return Result.ok({ ...result, output: { kind: 'structured', data } });
  }

  private validatorFor(schema: object): ValidateFn {
    let fn = this.compiled.get(schema);
    if (!fn) {
      fn = this.ajv.compile(schema) as ValidateFn;
      this.compiled.set(schema, fn);
    }
    return fn;
  }
}
