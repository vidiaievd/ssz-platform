import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { BadRequestException, Inject } from '@nestjs/common';
import { GetCourseMasteryQuery } from './get-course-mastery.query.js';
import { SRS_REPOSITORY, type ISrsRepository } from '../../domain/repositories/srs-repository.interface.js';
import { SRS_SCHEDULER, type ISrsScheduler } from '../ports/srs-scheduler.port.js';
import { GrammarRuleMasteryService } from '../services/grammar-rule-mastery.service.js';
import {
  CONTENT_CLIENT,
  ContentClientError,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import {
  CAN_DO_PROGRESS_REPOSITORY,
  type ICanDoProgressRepository,
} from '../../../can-do/domain/repositories/can-do-progress.repository.interface.js';
import { CLOCK, type IClock } from '../../../../shared/application/ports/clock.port.js';

export interface CourseMasteryDto {
  containerId: string;
  vocab: number;
  grammar: number;
  reading: number;
  listening: number;
  spoken: number;
  written: number;
  overall: number;
}

@QueryHandler(GetCourseMasteryQuery)
export class GetCourseMasteryHandler
  implements IQueryHandler<GetCourseMasteryQuery, CourseMasteryDto>
{
  constructor(
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(SRS_REPOSITORY) private readonly srsRepo: ISrsRepository,
    @Inject(SRS_SCHEDULER) private readonly scheduler: ISrsScheduler,
    @Inject(CAN_DO_PROGRESS_REPOSITORY) private readonly canDoRepo: ICanDoProgressRepository,
    private readonly grammarRuleMastery: GrammarRuleMasteryService,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(query: GetCourseMasteryQuery): Promise<CourseMasteryDto> {
    const now = this.clock.now();

    const [leafResult, canDoProgress] = await Promise.all([
      this.contentClient.getContainerLeafItems(query.containerId),
      this.canDoRepo.findByUserAndCourse(query.userId, query.containerId),
    ]);

    if (leafResult.isFail) {
      throw new BadRequestException(
        `Cannot fetch course structure: ${(leafResult.error as ContentClientError).message}`,
      );
    }

    const leafItems = leafResult.value;
    // Course leaf items are VOCABULARY_LIST and GRAMMAR_RULE (not individual vocab items).
    const vocabListIds = leafItems.filter((r) => r.type === 'VOCABULARY_LIST').map((r) => r.id);
    const grammarIds = leafItems.filter((r) => r.type === 'GRAMMAR_RULE').map((r) => r.id);

    const [vocabMastery, grammarMastery, skillMastery] = await Promise.all([
      this.computeVocabMastery(query.userId, vocabListIds, now),
      this.computeGrammarMastery(query.userId, grammarIds, now),
      this.computeSkillMastery(canDoProgress),
    ]);

    const skillScores = [
      skillMastery.reading,
      skillMastery.listening,
      skillMastery.spoken,
      skillMastery.written,
    ];
    const overallScores = [vocabMastery, grammarMastery, ...skillScores].filter((v) => v > 0 || v === 0);
    const overall = this.average(overallScores);

    return {
      containerId: query.containerId,
      vocab: vocabMastery,
      grammar: grammarMastery,
      reading: skillMastery.reading,
      listening: skillMastery.listening,
      spoken: skillMastery.spoken,
      written: skillMastery.written,
      overall,
    };
  }

  private async computeVocabMastery(userId: string, vocabListIds: string[], now: Date): Promise<number> {
    if (vocabListIds.length === 0) return 0;

    const itemIdResults = await Promise.all(
      vocabListIds.map((listId) => this.contentClient.getVocabularyListItems(listId)),
    );
    const allVocabIds: string[] = [];
    for (const result of itemIdResults) {
      if (result.isOk) allVocabIds.push(...result.value);
    }
    if (allVocabIds.length === 0) return 0;

    const cards = await this.srsRepo.findByUserAndContents(userId, 'VOCABULARY_WORD', allVocabIds);
    const cardMap = new Map(cards.map((c) => [c.contentId, c]));
    const scores = allVocabIds.map((id) => {
      const card = cardMap.get(id);
      return card ? this.scheduler.getRetrievability(card, now) : 0;
    });
    return this.average(scores);
  }

  private async computeGrammarMastery(userId: string, ruleIds: string[], now: Date): Promise<number> {
    if (ruleIds.length === 0) return 0;
    const scores: number[] = [];
    for (const ruleId of ruleIds) {
      const result = await this.grammarRuleMastery.getMastery(userId, ruleId, now);
      scores.push(result.isOk ? result.value.averageRetrievability : 0);
    }
    return this.average(scores);
  }

  private async computeSkillMastery(
    canDoProgress: Array<{ descriptorId: string; status: string }>,
  ): Promise<{ reading: number; listening: number; spoken: number; written: number }> {
    const empty = { reading: 0, listening: 0, spoken: 0, written: 0 };
    if (canDoProgress.length === 0) return empty;

    const descriptorIds = canDoProgress.map((p) => p.descriptorId);
    const descriptorResult = await this.contentClient.getCanDoDescriptorsByIds(descriptorIds);
    if (descriptorResult.isFail) return empty;

    const descriptors = descriptorResult.value;
    const skillMap = new Map(descriptors.map((d) => [d.id, d.skill.toUpperCase()]));

    const grouped: Record<string, { total: number; achieved: number }> = {
      READING:   { total: 0, achieved: 0 },
      LISTENING: { total: 0, achieved: 0 },
      SPOKEN:    { total: 0, achieved: 0 },
      WRITTEN:   { total: 0, achieved: 0 },
    };

    for (const p of canDoProgress) {
      const skill = skillMap.get(p.descriptorId);
      if (!skill || !(skill in grouped)) continue;
      grouped[skill].total++;
      if (p.status === 'ACHIEVED') grouped[skill].achieved++;
    }

    const ratio = (skill: string) => {
      const g = grouped[skill];
      return g.total === 0 ? 0 : g.achieved / g.total;
    };

    return {
      reading:   ratio('READING'),
      listening: ratio('LISTENING'),
      spoken:    ratio('SPOKEN'),
      written:   ratio('WRITTEN'),
    };
  }

  private average(scores: number[]): number {
    if (scores.length === 0) return 0;
    return scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }
}
