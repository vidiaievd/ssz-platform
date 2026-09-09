import { Injectable } from '@nestjs/common';
import { deriveSkills } from '@ssz/shared-kernel/skills';
import type { AtomRef, DerivedProfile, Placement } from '@ssz/shared-kernel/skills';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AxesScope, IExerciseAxes } from '../domain/exercise-axes.port.js';

/**
 * Where the exercise is placed and what it practises, read once for a whole batch.
 *
 * Everything here is a bulk query keyed on a list of exercise ids: the coverage report
 * walks a course of 452 exercises, and a per-exercise round trip would turn one report
 * into two thousand statements.
 */
@Injectable()
export class PrismaExerciseAxesService implements IExerciseAxes {
  constructor(private readonly prisma: PrismaService) {}

  /** The axes of one exercise, or null when there is no such exercise. */
  async forExercise(exerciseId: string, scope: AxesScope = 'live'): Promise<DerivedProfile | null> {
    const derived = await this.forExercises([exerciseId], scope);
    return derived.get(exerciseId) ?? null;
  }

  /**
   * The axes of many exercises, keyed by id. Ids that do not resolve are simply absent —
   * a placement pointing at a deleted exercise is a gap in the catalogue, not an error
   * the caller has to handle to get the rest of its report.
   */
  async forExercises(
    exerciseIds: readonly string[],
    scope: AxesScope = 'live',
  ): Promise<Map<string, DerivedProfile>> {
    const ids = [...new Set(exerciseIds)];
    const out = new Map<string, DerivedProfile>();
    if (ids.length === 0) return out;

    const [exercises, placements, atoms] = await Promise.all([
      this.prisma.exercise.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: {
          id: true,
          content: true,
          draftContent: true,
          draftUpdatedAt: true,
          skillsOverride: true,
          focusOverride: true,
          overrideSetAt: true,
          template: { select: { code: true } },
        },
      }),
      this.placements(ids),
      this.atoms(ids),
    ]);

    for (const exercise of exercises) {
      // The draft columns only hold a document when `draft_updated_at` is set — the same
      // flag the entity mapper reads. Falling back to the live document rather than to an
      // empty one means an exercise nobody has edited counts identically in both scopes.
      const content =
        scope === 'draft' && exercise.draftUpdatedAt !== null
          ? exercise.draftContent
          : exercise.content;

      out.set(
        exercise.id,
        deriveSkills({
          templateCode: exercise.template.code,
          content,
          atoms: atoms.get(exercise.id) ?? [],
          placement: placements.get(exercise.id) ?? null,
          override:
            exercise.overrideSetAt === null
              ? null
              : {
                  skills: exercise.skillsOverride,
                  focus: exercise.focusOverride,
                  setAt: exercise.overrideSetAt,
                },
        }),
      );
    }

    return out;
  }

  /**
   * How each exercise stands in its lesson.
   *
   * Two tables, because those are the only two places the schema links an exercise to a
   * lesson variant by foreign key: `LessonListeningStage` and `LessonVideoQuestion`. An
   * exercise sitting in a module through `ContainerItem` has no lesson to speak of, and
   * therefore no placement — its template decides.
   *
   * Prisma returns enum member NAMES, not their `@map` values: `AUDIO`, not `audio`, and
   * `GAP_FILL`, not `gap_fill`. The kernel speaks the mapped form, so both are lowered on
   * the way through — casting the raw name would compile and then match nothing.
   */
  private async placements(ids: string[]): Promise<Map<string, Placement>> {
    const [stages, videoQuestions] = await Promise.all([
      this.prisma.lessonListeningStage.findMany({
        where: { exerciseId: { in: ids } },
        select: {
          exerciseId: true,
          stageType: true,
          variant: { select: { lesson: { select: { kind: true } } } },
        },
      }),
      this.prisma.lessonVideoQuestion.findMany({
        where: { exerciseId: { in: ids } },
        select: {
          exerciseId: true,
          variant: { select: { lesson: { select: { kind: true } } } },
        },
      }),
    ]);

    const out = new Map<string, Placement>();

    for (const stage of stages) {
      out.set(stage.exerciseId, {
        listeningStage: stage.stageType === 'GAP_FILL' ? 'gap_fill' : 'comprehension',
        lessonKind: lessonKind(stage.variant.lesson.kind),
      });
    }

    for (const question of videoQuestions) {
      // A listening stage already answers the question, and it answers it more precisely;
      // an exercise reused as both is authoring gone sideways, not a case to arbitrate.
      if (out.has(question.exerciseId)) continue;
      out.set(question.exerciseId, {
        videoQuestion: true,
        lessonKind: lessonKind(question.variant.lesson.kind),
      });
    }

    return out;
  }

  /** `PRACTICED_BY` edges, atom → exercise: the same graph the attempt snapshot uses. */
  private async atoms(ids: string[]): Promise<Map<string, AtomRef[]>> {
    const relations = await this.prisma.contentRelation.findMany({
      where: { targetType: 'EXERCISE', targetId: { in: ids }, relationKind: 'PRACTICED_BY' },
      select: { sourceType: true, sourceId: true, targetId: true },
    });

    const out = new Map<string, AtomRef[]>();
    for (const relation of relations) {
      const list = out.get(relation.targetId) ?? [];
      // Lowered for the same reason as the enums above: the kernel reads `atomType` as
      // the mapped value (`grammar_rule`, `vocabulary_item`).
      list.push({ atomType: relation.sourceType.toLowerCase(), atomId: relation.sourceId });
      out.set(relation.targetId, list);
    }
    return out;
  }
}

function lessonKind(kind: string): Placement['lessonKind'] {
  const lowered = kind.toLowerCase();
  return lowered === 'text' || lowered === 'video' || lowered === 'audio' || lowered === 'live'
    ? lowered
    : null;
}
