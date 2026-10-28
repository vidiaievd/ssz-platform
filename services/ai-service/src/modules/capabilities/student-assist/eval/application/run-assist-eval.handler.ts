import { randomUUID } from 'node:crypto';
import { Inject, NotFoundException, Optional, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { ModelCaller } from '../../../../gateway/application/model-caller.js';
import type { CapabilityBinding } from '../../../../registry/application/queries/list-bindings/list-bindings.handler.js';
import { GetBindingQuery } from '../../../../registry/application/queries/get-binding/get-binding.query.js';
import { capabilityGaps } from '../../../domain/capability.js';
import { EVAL_RUN_REPOSITORY, type IEvalRunRepository } from '../../../review-draft/eval/application/ports/eval-run.repository.js';
import { unitSources } from '../../application/assist-toolbox.js';
import {
  COURSE_LANGUAGE_READER,
  COURSE_MATERIAL_READER,
  type ICourseLanguageReader,
  type ICourseMaterialReader,
} from '../../application/ports/assist-readers.js';
import type { AssistSource } from '../../domain/assist-answer.js';
import { STUDENT_ASSIST_PROMPT_VERSIONS } from '../../prompts/prompts.js';
import { STUDENT_ASSIST } from '../../student-assist.capability.js';
import { ASSIST_EVAL_SET, type AssistEvalSet } from '../domain/assist-eval-set.js';
import type { AssistCaseResult, AssistRunScores } from '../domain/assist-eval-score.js';
import { AssistEvalRunner, type AssistEvalRun, type PreparedAssistCase } from './assist-eval-runner.js';
import { RunAssistEvalCommand } from './run-assist-eval.command.js';

/** The set a run takes — `ASSIST_EVAL_SET` unless a test hands in its own. */
export const ASSIST_EVAL_SET_SOURCE = Symbol('ASSIST_EVAL_SET_SOURCE');

/**
 * Checks everything that can be checked before spending money — the prompt version, the
 * model and what it can do, the set's material on this stand — then starts the run and
 * answers with it, `running`.
 *
 * The set names seeded material. A case whose course is not on this stand (`COURSE_MISSING`),
 * whose unit is not published in it (`UNIT_MISSING`), or which expects a citation the unit no
 * longer holds (`EXPECTATION_STALE`) is left out and counted, rather than scored as the
 * candidate's failure.
 */
@CommandHandler(RunAssistEvalCommand)
export class RunAssistEvalHandler implements ICommandHandler<RunAssistEvalCommand, AssistEvalRun> {
  constructor(
    private readonly caller: ModelCaller,
    private readonly runner: AssistEvalRunner,
    private readonly queryBus: QueryBus,
    @Inject(COURSE_LANGUAGE_READER) private readonly courses: ICourseLanguageReader,
    @Inject(COURSE_MATERIAL_READER) private readonly material: ICourseMaterialReader,
    @Inject(EVAL_RUN_REPOSITORY) private readonly runs: IEvalRunRepository<AssistRunScores, AssistCaseResult>,
    @Optional() @Inject(ASSIST_EVAL_SET_SOURCE) private readonly set: AssistEvalSet = ASSIST_EVAL_SET,
  ) {}

  async execute(command: RunAssistEvalCommand): Promise<AssistEvalRun> {
    const { binding }: CapabilityBinding = await this.queryBus.execute(new GetBindingQuery(STUDENT_ASSIST.code));
    const promptVersion = command.promptVersion ?? binding?.promptVersion ?? null;
    if (!promptVersion) throw new UnprocessableEntityException('student_assist is not bound: name a promptVersion');
    if (!STUDENT_ASSIST_PROMPT_VERSIONS.includes(promptVersion)) {
      throw new UnprocessableEntityException(
        `student_assist has no prompt version "${promptVersion}" (known: ${STUDENT_ASSIST_PROMPT_VERSIONS.join(', ')})`,
      );
    }

    const resolved = await this.caller.resolve(command.modelId);
    if (resolved.isFail) {
      if (resolved.error.kind === 'not_found') throw new NotFoundException(`Model ${command.modelId} not found`);
      throw new UnprocessableEntityException({ message: 'The model cannot be called', missing: resolved.error.missing });
    }
    const model = resolved.value;
    const lacking = capabilityGaps(model.model, STUDENT_ASSIST);
    if (lacking.length > 0) {
      throw new UnprocessableEntityException({ message: 'The model lacks what student_assist needs', missing: lacking });
    }

    let prepared: { cases: PreparedAssistCase[]; skipped: Record<string, number> };
    try {
      prepared = await this.prepare();
    } catch (err) {
      throw new ServiceUnavailableException(
        `The set's material could not be read from content-service: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const { cases, skipped } = prepared;
    if (cases.length === 0) {
      throw new UnprocessableEntityException({ message: "None of the set's material is on this stand", skipped });
    }

    const run: AssistEvalRun = {
      id: randomUUID(),
      capability: STUDENT_ASSIST.code,
      modelId: model.model.id,
      promptVersion,
      status: 'running',
      startedBy: command.actorUserId,
      bindingAtStart: binding
        ? { primaryModelId: binding.primaryModelId, fallbackModelId: binding.fallbackModelId, promptVersion: binding.promptVersion }
        : null,
      caseCount: cases.length,
      skipped,
      scores: null,
      cases: null,
      cost: null,
      credits: null,
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    };
    await this.runs.create(run);
    void this.runner.start(run, model, this.set.version, cases);
    return run;
  }

  /** Each course and unit of the set read once. Throws when content-service cannot answer. */
  private async prepare(): Promise<{ cases: PreparedAssistCase[]; skipped: Record<string, number> }> {
    const languages = new Map<string, string | null>();
    const units = new Map<string, AssistSource[] | null>();
    const cases: PreparedAssistCase[] = [];
    const skipped: Record<string, number> = {};
    const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

    for (const evalCase of this.set.cases) {
      const { courseId, unitId } = evalCase.context;
      if (!courseId) {
        cases.push({ case: evalCase, targetLanguage: null });
        continue;
      }
      if (!languages.has(courseId)) languages.set(courseId, await this.courses.targetLanguage(courseId));
      const targetLanguage = languages.get(courseId)!;
      if (!targetLanguage) {
        skip('COURSE_MISSING');
        continue;
      }
      if (evalCase.context.kind === 'unit' && unitId) {
        const key = `${courseId}/${unitId}`;
        if (!units.has(key)) {
          const material = await this.material.unitMaterial(courseId, unitId, evalCase.explanationLanguage);
          units.set(key, material ? unitSources(material) : null);
        }
        const sources = units.get(key)!;
        if (!sources) {
          skip('UNIT_MISSING');
          continue;
        }
        const expected = evalCase.expect.citeAnyOf ?? [];
        if (expected.length > 0 && !expected.some((e) => sources.some((s) => s.kind === e.kind && s.id === e.id))) {
          skip('EXPECTATION_STALE');
          continue;
        }
      }
      cases.push({ case: evalCase, targetLanguage });
    }
    return { cases, skipped };
  }
}
