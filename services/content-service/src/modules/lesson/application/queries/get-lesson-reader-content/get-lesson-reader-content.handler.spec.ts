import { GetLessonReaderContentHandler } from './get-lesson-reader-content.handler.js';
import { GetLessonReaderContentQuery } from './get-lesson-reader-content.query.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonVideoCueEntity } from '../../../domain/entities/lesson-video-cue.entity.js';
import { LessonListeningStageEntity } from '../../../domain/entities/lesson-listening-stage.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { ListeningStageType } from '../../../domain/value-objects/listening-stage-type.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { ExerciseEntity } from '../../../../exercise/domain/entities/exercise.entity.js';
import { VocabularyItemEntity } from '../../../../vocabulary/domain/entities/vocabulary-item.entity.js';
import { VocabularyItemTranslationEntity } from '../../../../vocabulary/domain/entities/vocabulary-item-translation.entity.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonVariantMediaRefRepository } from '../../../domain/repositories/lesson-variant-media-ref.repository.interface.js';
import type { ILessonVideoCueRepository } from '../../../domain/repositories/lesson-video-cue.repository.interface.js';
import type { ILessonListeningStageRepository } from '../../../domain/repositories/lesson-listening-stage.repository.interface.js';
import type { ILessonParagraphTranslationRepository } from '../../../domain/repositories/lesson-paragraph-translation.repository.interface.js';
import type { ILessonGlossaryMarkRepository } from '../../../domain/repositories/lesson-glossary-mark.repository.interface.js';
import type { IExerciseRepository } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../../vocabulary/domain/repositories/vocabulary-item.repository.interface.js';

const OWNER_ID = 'owner-1';
const LESSON_ID = 'lesson-1';
const VARIANT_ID = 'variant-1';

function makeLesson(
  kind: LessonKind,
  overrides: Partial<{
    liveStartsAt: Date;
    liveDurationMinutes: number;
    liveJoinUrl: string;
    liveCapacity: number;
  }> = {},
): LessonEntity {
  const result = LessonEntity.create(
    {
      targetLanguage: 'no',
      difficultyLevel: DifficultyLevel.A1,
      title: 'Å bo i Norge',
      ownerUserId: OWNER_ID,
      visibility: Visibility.PUBLIC,
      kind,
      ...overrides,
    },
    LESSON_ID,
  );
  if (result.isFail) throw new Error('unexpected failure building lesson fixture');
  return result.value;
}

function makeVariant(): LessonContentVariantEntity {
  const result = LessonContentVariantEntity.create(
    {
      lessonId: LESSON_ID,
      explanationLanguage: 'en',
      minLevel: DifficultyLevel.A1,
      maxLevel: DifficultyLevel.A2,
      displayTitle: 'Living in Norway',
      bodyMarkdown: 'Første avsnitt.\n\nAndre avsnitt.',
      createdByUserId: OWNER_ID,
    },
    VARIANT_ID,
  );
  if (result.isFail) throw new Error('unexpected failure building variant fixture');
  const variant = result.value;
  variant.publish();
  return variant;
}

function makeDeps(
  overrides: Partial<{
    lesson: LessonEntity | null;
    variants: LessonContentVariantEntity[];
    mediaRefs: { mediaId: string }[];
    glossaryMarks: { id: string; vocabularyItemId: string; occurrenceCount: number }[];
    cues: LessonVideoCueEntity[];
    listeningStages: LessonListeningStageEntity[];
    paragraphTranslations: { paragraphIndex: number; translation: string }[];
    exercise: ExerciseEntity | null;
    vocabularyItems: VocabularyItemEntity[];
  }> = {},
) {
  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(overrides.lesson ?? null),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findByLessonId: jest.fn().mockResolvedValue(overrides.variants ?? [makeVariant()]),
  } as unknown as ILessonContentVariantRepository;

  const mediaRefRepo = {
    findByVariantId: jest.fn().mockResolvedValue(overrides.mediaRefs ?? []),
  } as unknown as ILessonVariantMediaRefRepository;

  const cueRepo = {
    findByVariantId: jest.fn().mockResolvedValue(overrides.cues ?? []),
  } as unknown as ILessonVideoCueRepository;

  const listeningStageRepo = {
    findByVariantId: jest.fn().mockResolvedValue(overrides.listeningStages ?? []),
  } as unknown as ILessonListeningStageRepository;

  const paragraphRepo = {
    findByVariantId: jest.fn().mockResolvedValue(overrides.paragraphTranslations ?? []),
  } as unknown as ILessonParagraphTranslationRepository;

  const glossaryMarkRepo = {
    findByVariantId: jest.fn().mockResolvedValue(overrides.glossaryMarks ?? []),
  } as unknown as ILessonGlossaryMarkRepository;

  const exerciseRepo = {
    findById: jest.fn().mockResolvedValue(overrides.exercise ?? null),
  } as unknown as IExerciseRepository;

  const vocabularyItemRepo = {
    findByIds: jest.fn().mockResolvedValue(overrides.vocabularyItems ?? []),
  } as unknown as IVocabularyItemRepository;

  const handler = new GetLessonReaderContentHandler(
    lessonRepo,
    variantRepo,
    mediaRefRepo,
    cueRepo,
    listeningStageRepo,
    paragraphRepo,
    glossaryMarkRepo,
    exerciseRepo,
    vocabularyItemRepo,
  );

  return { handler, lessonRepo, variantRepo, exerciseRepo, vocabularyItemRepo };
}

function makeQuery(): GetLessonReaderContentQuery {
  return new GetLessonReaderContentQuery(LESSON_ID, 'en', DifficultyLevel.A1, []);
}

describe('GetLessonReaderContentHandler', () => {
  it('fails when the lesson does not exist', async () => {
    const { handler } = makeDeps({ lesson: null });

    const result = await handler.execute(makeQuery());

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LESSON_NOT_FOUND);
  });

  it('returns a schedule stub for LIVE lessons without touching variants', async () => {
    const startsAt = new Date('2026-08-01T10:00:00Z');
    const lesson = makeLesson(LessonKind.LIVE, {
      liveStartsAt: startsAt,
      liveDurationMinutes: 45,
      liveJoinUrl: 'https://meet.example.com/x',
      liveCapacity: 20,
    });
    const { handler, variantRepo } = makeDeps({ lesson });

    const result = await handler.execute(makeQuery());

    expect(result.isOk).toBe(true);
    expect(result.value.kind).toBe(LessonKind.LIVE);
    expect(result.value.live).toEqual({
      startsAt: startsAt.toISOString(),
      durationMinutes: 45,
      joinUrl: 'https://meet.example.com/x',
      capacity: 20,
    });
    expect(result.value.bodyMarkdown).toBeNull();
    expect(variantRepo.findByLessonId).not.toHaveBeenCalled();
  });

  it('fails when no published variant matches the student', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const { handler } = makeDeps({ lesson, variants: [] });

    const result = await handler.execute(makeQuery());

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.BEST_VARIANT_NOT_FOUND);
  });

  it('returns paragraphs and resolved glossary for a TEXT lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const vocabItem = VocabularyItemEntity.reconstitute(
      'vocab-1',
      {
        vocabularyListId: 'list-1',
        word: 'bo',
        position: 0,
        partOfSpeech: null,
        ipaTranscription: null,
        pronunciationAudioMediaId: null,
        grammaticalProperties: null,
        register: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      [
        VocabularyItemTranslationEntity.create({
          vocabularyItemId: 'vocab-1',
          translationLanguage: 'en',
          primaryTranslation: 'to live',
          createdByUserId: OWNER_ID,
        }),
      ],
      [],
    );

    const { handler } = makeDeps({
      lesson,
      paragraphTranslations: [{ paragraphIndex: 1, translation: 'Second paragraph translated.' }],
      glossaryMarks: [{ id: 'mark-1', vocabularyItemId: 'vocab-1', occurrenceCount: 2 }],
      vocabularyItems: [vocabItem],
    });

    const result = await handler.execute(makeQuery());

    expect(result.isOk).toBe(true);
    expect(result.value.paragraphs).toEqual([
      { target: 'Første avsnitt.', translation: null },
      { target: 'Andre avsnitt.', translation: 'Second paragraph translated.' },
    ]);
    expect(result.value.glossary).toEqual([
      {
        id: 'vocab-1',
        word: 'bo',
        partOfSpeech: null,
        translation: { language: 'en', text: 'to live', definition: null },
      },
    ]);
    expect(result.value.cues).toBeNull();
    // TEXT variants may stage a post-reading check, so the field is an empty
    // list rather than null when none has been authored (spec 17 §3.3).
    expect(result.value.listeningStages).toEqual([]);
  });

  it('resolves post-reading stage exercises for a TEXT lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const stage = LessonListeningStageEntity.create(
      {
        lessonContentVariantId: VARIANT_ID,
        exerciseId: 'exercise-2',
        position: 0,
        stageType: ListeningStageType.COMPREHENSION,
      },
      'stage-2',
    );
    if (stage.isFail) throw new Error('unexpected fixture failure');

    const exercise = ExerciseEntity.reconstitute('exercise-2', {
      exerciseTemplateId: 'template-2',
      templateCode: 'multiple_choice_v1',
      targetLanguage: 'no',
      difficultyLevel: DifficultyLevel.A1,
      content: { question: 'Hvor bor hun?', options: [] },
      expectedAnswers: { correct_option_ids: ['a'] },
      answerCheckSettings: null,
      ownerUserId: OWNER_ID,
      ownerSchoolId: null,
      visibility: Visibility.PUBLIC,
      estimatedDurationSeconds: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      instructions: [],
    });

    const { handler } = makeDeps({ lesson, listeningStages: [stage.value], exercise });

    const result = await handler.execute(makeQuery());

    expect(result.isOk).toBe(true);
    expect(result.value.listeningStages).toEqual([
      {
        position: 0,
        stageType: ListeningStageType.COMPREHENSION,
        exercise: {
          id: 'exercise-2',
          templateCode: 'multiple_choice_v1',
          content: { question: 'Hvor bor hun?', options: [] },
          instructions: [],
        },
      },
    ]);
    // The reading itself is untouched by the check.
    expect(result.value.paragraphs).not.toBeNull();
  });

  it('resolves listening stage exercises for an AUDIO lesson', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const stage = LessonListeningStageEntity.create(
      {
        lessonContentVariantId: VARIANT_ID,
        exerciseId: 'exercise-1',
        position: 0,
        stageType: ListeningStageType.GAP_FILL,
      },
      'stage-1',
    );
    if (stage.isFail) throw new Error('unexpected fixture failure');

    const exercise = ExerciseEntity.reconstitute('exercise-1', {
      exerciseTemplateId: 'template-1',
      templateCode: 'gap_fill_v1',
      targetLanguage: 'no',
      difficultyLevel: DifficultyLevel.A1,
      content: { text: 'Jeg ___ i Norge.' },
      expectedAnswers: { blanks: ['bor'] },
      answerCheckSettings: null,
      ownerUserId: OWNER_ID,
      ownerSchoolId: null,
      visibility: Visibility.PUBLIC,
      estimatedDurationSeconds: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      instructions: [],
    });

    const { handler } = makeDeps({
      lesson,
      listeningStages: [stage.value],
      exercise,
    });

    const result = await handler.execute(makeQuery());

    expect(result.isOk).toBe(true);
    expect(result.value.listeningStages).toEqual([
      {
        position: 0,
        stageType: ListeningStageType.GAP_FILL,
        exercise: {
          id: 'exercise-1',
          templateCode: 'gap_fill_v1',
          content: { text: 'Jeg ___ i Norge.' },
          instructions: [],
        },
      },
    ]);
  });
});
