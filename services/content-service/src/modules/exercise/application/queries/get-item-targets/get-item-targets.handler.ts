import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { itemsOf } from '@ssz/shared-kernel/exercise-items';
import { GetItemTargetsQuery } from './get-item-targets.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_ITEM_TARGET_REPOSITORY } from '../../../domain/repositories/exercise-item-target.repository.interface.js';
import type { IExerciseItemTargetRepository } from '../../../domain/repositories/exercise-item-target.repository.interface.js';

export interface ResolvedTarget {
  atomType: string;
  atomId: string;
  role: string;
  /** Null when the atom is gone — the target is then broken and says so. */
  atomTitle: string | null;
  track: string | null;
  /** Why this target cannot be used, or null when it is fine. */
  broken: 'atom_missing' | 'item_missing' | null;
}

export interface ItemTargets {
  /** Null addresses the whole exercise. */
  itemKey: string | null;
  /** What the author sees for this item; null for a key the document no longer has. */
  label: string | null;
  targets: ResolvedTarget[];
}

export interface ExerciseTargetsView {
  exerciseId: string;
  templateCode: string;
  /** Null when the template grades as a whole and only the exercise can be addressed. */
  addressable: boolean;
  items: ItemTargets[];
}

/**
 * Every target of an exercise, resolved against the document as it stands now.
 *
 * Brokenness is computed here and never stored. A gap's key holds a token index, so editing
 * a sentence moves it — a stored flag would need invalidating on every save of the document,
 * which is exactly the bookkeeping `lesson_text_spans` avoids by deciding on read.
 *
 * Two different breakages, kept apart because they need different fixes: `item_missing` is
 * the author's to re-anchor, `atom_missing` means somebody retired the atom underneath.
 */
@QueryHandler(GetItemTargetsQuery)
export class GetItemTargetsHandler implements IQueryHandler<
  GetItemTargetsQuery,
  Result<ExerciseTargetsView, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(EXERCISE_ITEM_TARGET_REPOSITORY)
    private readonly targetRepo: IExerciseItemTargetRepository,
  ) {}

  async execute(
    query: GetItemTargetsQuery,
  ): Promise<Result<ExerciseTargetsView, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(query.exerciseId);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }

    const documentItems = itemsOf(
      exercise.templateCode,
      exercise.authoringContent,
      exercise.authoringExpectedAnswers,
    );
    const labelByKey = new Map((documentItems ?? []).map((item) => [item.key, item.label]));

    const targets = await this.targetRepo.findByExerciseId(query.exerciseId);
    const atoms = await this.targetRepo.describeAtoms(
      targets.map((target) => ({ atomType: target.atomType, atomId: target.atomId })),
    );
    const atomByRef = new Map(atoms.map((atom) => [`${atom.atomType}:${atom.atomId}`, atom]));

    // Every item of the document gets a row, addressed or not — an author has to see which
    // gaps say nothing about themselves, and an item absent from the list is indistinguishable
    // from one nobody has got to yet.
    const byKey = new Map<string | null, ItemTargets>();
    for (const item of documentItems ?? []) {
      byKey.set(item.key, { itemKey: item.key, label: item.label, targets: [] });
    }

    for (const target of targets) {
      const itemMissing = target.itemKey !== null && !labelByKey.has(target.itemKey);
      const atom = atomByRef.get(`${target.atomType}:${target.atomId}`);

      let row = byKey.get(target.itemKey);
      if (row === undefined) {
        row = {
          itemKey: target.itemKey,
          label: target.itemKey === null ? null : (labelByKey.get(target.itemKey) ?? null),
          targets: [],
        };
        byKey.set(target.itemKey, row);
      }

      row.targets.push({
        atomType: target.atomType,
        atomId: target.atomId,
        role: target.role,
        atomTitle: atom?.title ?? null,
        track: atom?.track ?? null,
        // The item being gone is reported first: re-anchoring it is the author's next move
        // either way, and a target on a gap that no longer exists cannot be acted on at all.
        broken: itemMissing ? 'item_missing' : atom === undefined ? 'atom_missing' : null,
      });
    }

    return Result.ok({
      exerciseId: exercise.id,
      templateCode: exercise.templateCode,
      addressable: documentItems !== null,
      items: [...byKey.values()],
    });
  }
}
