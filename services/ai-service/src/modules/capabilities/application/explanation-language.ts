import { Inject, Injectable, Logger } from '@nestjs/common';
import { LEARNER_LANGUAGE_READER, type ILearnerLanguageReader } from '../review-direct/application/ports/learner-language.reader.js';
import { SCHOOL_LANGUAGE_READER, type ISchoolLanguageReader } from '../review-draft/application/ports/school-language.reader.js';

/**
 * The language a model explains a learner's work in (OPEN-QUESTIONS П-10, 28.11): the school's
 * `defaultExplanationLanguage` when it set one, else the learner's interface language (`uiLocale`),
 * else null — the caller's own default (English, or the exercise's label). The assistant decided
 * the same in plan 83 Q5; every other agent fell to English, so a Russian-speaking learner of a
 * school without a language read remarks in English.
 *
 * Both reads are niceties: an unreadable one is logged and falls through, never fails the work.
 */
@Injectable()
export class ExplanationLanguage {
  private readonly logger = new Logger(ExplanationLanguage.name);

  constructor(
    @Inject(SCHOOL_LANGUAGE_READER) private readonly schools: ISchoolLanguageReader,
    @Inject(LEARNER_LANGUAGE_READER) private readonly learners: ILearnerLanguageReader,
  ) {}

  async of(who: { schoolId: string | null; userId: string | null }): Promise<string | null> {
    if (who.schoolId !== null) {
      const school = await this.read(`school ${who.schoolId}`, () => this.schools.explanationLanguage(who.schoolId!));
      if (school !== null) return school;
    }
    if (who.userId === null) return null;
    return this.read(`learner ${who.userId}`, () => this.learners.interfaceLanguage(who.userId!));
  }

  private async read(whose: string, read: () => Promise<string | null>): Promise<string | null> {
    try {
      return await read();
    } catch (err) {
      this.logger.warn(`Explanation language of ${whose} unreadable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
