import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CheckMode,
  ExerciseDefinition,
  ExercisePlacement,
  ExerciseTemplateDefinition,
  IContentClient,
  PracticedAtomRef,
} from '../../../../shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { ProbeTask } from '../../domain/entities/probe-task.entity.js';
import {
  PROBE_TASK_REPOSITORY,
  type IProbeTaskRepository,
} from '../../domain/repositories/probe-task.repository.js';

/**
 * Where a disposable task joins the ordinary tract — plan 63 phase 9, step 2.
 *
 * This is the whole of "an attempt on a probe is an ordinary attempt". Everything that
 * runs an attempt — starting it, submitting it, revealing, self-checking, answering one
 * question of a set — reads the task through `IContentClient.getExerciseForAttempt`, and
 * none of them needs to know that a second place exists. They ask for an id; this
 * decorator looks in the probe table first and in Content Service second.
 *
 * Probes first, and the order is not arbitrary. A local primary-key lookup is cheaper
 * than the HTTP call it replaces, and — the reason that matters — a probe id that is not
 * a probe is a catalogue id, while asking Content Service first would spend a round trip
 * and a 404 on every probe attempt before getting to the right table.
 *
 * What it deliberately does not do is invent anything the catalogue would have supplied:
 * a probe has no placement, and no relation graph knows it. Both answer emptily rather
 * than plausibly, because the alternative — a made-up course, an atom nobody linked — is
 * a lie that would reach a teacher's review queue and a learner's progress.
 */
@Injectable()
export class ProbeAwareContentClient implements IContentClient {
  private readonly logger = new Logger(ProbeAwareContentClient.name);

  constructor(
    private readonly catalogue: IContentClient,
    @Inject(PROBE_TASK_REPOSITORY) private readonly probes: IProbeTaskRepository,
  ) {}

  async getExerciseForAttempt(
    exerciseId: string,
    language: string,
    mode: CheckMode,
  ): Promise<Result<ExerciseDefinition, ContentClientError>> {
    const probe = await this.probes.findById(exerciseId);
    if (!probe) return this.catalogue.getExerciseForAttempt(exerciseId, language, mode);

    /*
      An expired probe is refused here rather than in the caller.

      This is the moment that matters for the learner: the definition is what the runner
      draws and what the validator judges, so a task whose time is up must stop being
      readable at the same instant for everyone who reads it — the opener, the submitter
      and the resumer alike. 404 rather than 410, because this is the content port: its
      callers already know what to do with "no such exercise", and none of them has any
      use for the distinction.

      An attempt already open on it is not rescued by this: the sweep leaves that row
      alone, but the definition stops resolving, and the work cannot be handed in. That
      is the honest outcome — a probe is a question asked for a few hours, and a task
      nobody finished in its window has not been answered.
    */
    if (probe.isExpired()) {
      return Result.fail(new ContentClientError(404, `Probe ${exerciseId} has expired`));
    }

    /*
      The mode is not honoured, and `expectedAnswers` always travels.

      Content Service withholds the key in `graded` mode before the envelope leaves it;
      here there is no second service to protect the key from — the engine is both the
      store and the reader. Everything the learner is allowed to see is decided one step
      later, by `withheldWhereNeeded` in start-attempt, which applies the template's own
      masking rules and ships `expectedAnswers: null` for every template that hides one.
      That step needs the key in order to take it away (see its comment on
      `error_correction`), so taking it away here would leave it with nothing to work
      from and a probe would be masked *less* than a catalogue exercise, not more.
    */
    const template = await this.catalogue.getTemplateByCode(probe.definition.templateCode);
    if (template.isFail) {
      this.logger.warn(
        `Probe ${exerciseId} names template '${probe.definition.templateCode}', which ` +
          `Content Service could not supply: ${template.error.message}`,
      );
      return Result.fail(template.error);
    }

    return Result.ok(toDefinition(probe, template.value));
  }

  /**
   * Nothing. A probe is not in the relation graph and never will be.
   *
   * Answered without a round trip, and this is not only an optimisation: the graph would
   * answer "no atoms" for an id it has never heard of, which is the same list, reached by
   * a 404 that the log would report as a failure every time a probe is opened.
   *
   * The probe's own atoms are not missing from the attempt as a result — they travel as
   * `targets` on the definition, and start-attempt merges the two lists.
   */
  async getPracticedAtoms(
    exerciseId: string,
  ): Promise<Result<PracticedAtomRef[], ContentClientError>> {
    if (await this.isProbe(exerciseId)) return Result.ok([]);
    return this.catalogue.getPracticedAtoms(exerciseId);
  }

  /**
   * A probe sits in no course, and saying so is the point.
   *
   * The placement is what puts a submission in a teacher's queue and gives it a path to
   * be named by. A probe has neither: it is the learner's own practice, made for them
   * this afternoon. The resolver treats a missing placement as the "learner outside a
   * group" case it already knows (plan 44 §0.4), which is exactly right here.
   */
  async getExercisePlacement(
    exerciseId: string,
  ): Promise<Result<ExercisePlacement, ContentClientError>> {
    if (await this.isProbe(exerciseId)) {
      return Result.fail(new ContentClientError(404, 'A probe sits in no course'));
    }
    return this.catalogue.getExercisePlacement(exerciseId);
  }

  async getTemplateByCode(
    code: string,
  ): Promise<Result<ExerciseTemplateDefinition, ContentClientError>> {
    return this.catalogue.getTemplateByCode(code);
  }

  private async isProbe(exerciseId: string): Promise<boolean> {
    return (await this.probes.findById(exerciseId)) !== null;
  }
}

/**
 * A probe, in the shape every attempt-running code path already reads.
 *
 * The axes are the probe's own declaration rather than anything derived: there is no
 * placement to derive them from, which is what a probe *is*. `modality` in particular is
 * the required modality — the reason the probe was made at all, since what is usually
 * missing from a learner's record is not practice of an atom but practice of a kind they
 * have never been asked for.
 */
function toDefinition(probe: ProbeTask, template: ExerciseTemplateDefinition): ExerciseDefinition {
  return {
    exercise: {
      id: probe.id,
      templateCode: probe.definition.templateCode,
      targetLanguage: probe.definition.targetLanguage,
      difficultyLevel: probe.definition.difficultyLevel,
      content: probe.definition.content,
      expectedAnswers: probe.definition.expectedAnswers,
      answerCheckSettings: probe.definition.answerCheckSettings,
    },
    template: {
      code: template.code,
      contentSchema: template.contentSchema,
      answerSchema: template.answerSchema,
      defaultCheckSettings: template.defaultCheckSettings,
      supportedLanguages: template.supportedLanguages,
    },
    // The instruction the probe carries, whatever language the caller asked for. Content
    // Service picks a translation out of a set; a probe has one instruction, written with
    // the task, and answering `null` because the languages differ would drop the only
    // thing telling the learner what to do.
    instruction: probe.definition.instruction,
    axes: {
      skills: probe.skills,
      focus: probe.focus,
      modality: probe.requiredModality,
    },
    targets: probe.targets,
    ephemeral: true,
  };
}
