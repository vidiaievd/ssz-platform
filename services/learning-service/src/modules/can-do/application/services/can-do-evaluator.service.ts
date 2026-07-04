import { Injectable, Inject, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CONTENT_CLIENT,
  type IContentClient,
  type RelatableEntityType,
} from '../../../../shared/application/ports/content-client.port.js';
import { SRS_REPOSITORY, type ISrsRepository } from '../../../srs/domain/repositories/srs-repository.interface.js';
import { SRS_SCHEDULER, type ISrsScheduler } from '../../../srs/application/ports/srs-scheduler.port.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';
import {
  CAN_DO_PROGRESS_REPOSITORY,
  type ICanDoProgressRepository,
} from '../../domain/repositories/can-do-progress.repository.interface.js';
import { CanDoProgressEntity } from '../../domain/entities/can-do-progress.entity.js';

// Mastery threshold for marking a can-do descriptor as ACHIEVED.
// Mirrors GRAMMAR_RULE_MASTERY_THRESHOLD (plan 21 §2.2).
const CAN_DO_MASTERY_THRESHOLD = 0.8;

export interface PracticedAtomRef {
  atomType: string;
  atomId: string;
}

@Injectable()
export class CanDoEvaluatorService {
  private readonly logger = new Logger(CanDoEvaluatorService.name);

  constructor(
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(SRS_REPOSITORY) private readonly srsRepo: ISrsRepository,
    @Inject(SRS_SCHEDULER) private readonly scheduler: ISrsScheduler,
    @Inject(CAN_DO_PROGRESS_REPOSITORY) private readonly progressRepo: ICanDoProgressRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  /**
   * Called after exercise atoms have been rated. Walks backward from each atom
   * to find which module containers include it (via INTRODUCES/FEATURES), then
   * re-evaluates the can-do descriptors targeted by those modules.
   */
  async evaluateForAtoms(userId: string, atoms: PracticedAtomRef[]): Promise<void> {
    const moduleIds = await this.collectModuleIds(atoms);
    if (moduleIds.size === 0) return;

    await Promise.all(
      [...moduleIds].map((moduleId) => this.evaluateModule(userId, moduleId)),
    );
  }

  private async collectModuleIds(atoms: PracticedAtomRef[]): Promise<Set<string>> {
    const moduleIds = new Set<string>();

    await Promise.all(
      atoms.map(async (atom) => {
        const type = this.toRelatableType(atom.atomType);
        if (!type) return;

        const result = await this.contentClient.getRelationsByTarget(type, atom.atomId);
        if (result.isFail) return;

        for (const rel of result.value) {
          if (
            rel.sourceType === 'container' &&
            (rel.relationKind === 'introduces' || rel.relationKind === 'features')
          ) {
            moduleIds.add(rel.sourceId);
          }
        }
      }),
    );

    return moduleIds;
  }

  private async evaluateModule(userId: string, moduleId: string): Promise<void> {
    // Get can-do descriptors targeted by this module.
    const targetsResult = await this.contentClient.getRelationsBySource(
      'container',
      moduleId,
      'targets',
    );
    if (targetsResult.isFail) return;

    const descriptorIds = targetsResult.value
      .filter((r) => r.targetType === 'can_do_descriptor')
      .map((r) => r.targetId);

    if (descriptorIds.length === 0) return;

    // Compute the module's aggregate mastery.
    const mastery = await this.computeModuleMastery(userId, moduleId);

    for (const descriptorId of descriptorIds) {
      await this.upsertProgress(userId, descriptorId, mastery);
    }
  }

  private async computeModuleMastery(userId: string, moduleId: string): Promise<number> {
    const relationsResult = await this.contentClient.getRelationsBySource('container', moduleId);
    if (relationsResult.isFail) return 0;

    const now = this.clock.now();
    const vocabIds: string[] = [];

    for (const rel of relationsResult.value) {
      if (rel.targetType === 'vocabulary_item' && rel.relationKind === 'introduces') {
        vocabIds.push(rel.targetId);
      }
    }

    if (vocabIds.length === 0) return 0;

    const cards = await this.srsRepo.findByUserAndContents(userId, 'VOCABULARY_WORD', vocabIds);
    if (cards.length === 0) return 0;

    const total = vocabIds.length;
    const retrievabilities = vocabIds.map((id) => {
      const card = cards.find((c) => c.contentId === id);
      return card ? this.scheduler.getRetrievability(card, now) : 0;
    });

    return retrievabilities.reduce((sum, r) => sum + r, 0) / total;
  }

  private async upsertProgress(
    userId: string,
    descriptorId: string,
    mastery: number,
  ): Promise<void> {
    try {
      let progress = await this.progressRepo.findByUserAndDescriptor(userId, descriptorId);

      if (!progress) {
        progress = CanDoProgressEntity.create(userId, descriptorId, randomUUID());
      }

      if (mastery >= CAN_DO_MASTERY_THRESHOLD) {
        progress.markAchieved();
      } else if (mastery > 0) {
        progress.markInProgress();
      }

      await this.progressRepo.upsert(progress);
    } catch (err) {
      this.logger.warn(`Failed to upsert can-do progress for ${userId}/${descriptorId}: ${err}`);
    }
  }

  private toRelatableType(atomType: string): RelatableEntityType | null {
    switch (atomType) {
      case 'vocabulary_item':
      case 'VOCABULARY_ITEM':
        return 'vocabulary_item';
      case 'grammar_rule':
      case 'GRAMMAR_RULE':
        return 'grammar_rule';
      default:
        return null;
    }
  }
}
