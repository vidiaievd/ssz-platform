import { ExerciseResponseDto } from './exercise.response.dto.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { ExerciseInstructionEntity } from '../../../domain/entities/exercise-instruction.entity.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';

const AT = new Date('2026-09-06T10:00:00.000Z');

function instruction(language: string): ExerciseInstructionEntity {
  return ExerciseInstructionEntity.reconstitute(`instruction-${language}`, {
    exerciseId: 'exercise-1',
    instructionLanguage: language,
    instructionText: `text-${language}`,
    hintText: null,
    textOverrides: null,
    createdAt: AT,
    updatedAt: AT,
    draft: null,
  });
}

/** Stored in the order the database happens to return them — which is the whole problem. */
function exercise(languages: string[]): ExerciseEntity {
  return ExerciseEntity.reconstitute('exercise-1', {
    exerciseTemplateId: 'template-1',
    templateCode: 'multiple_choice',
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.B1,
    content: { questions: [] },
    expectedAnswers: {},
    answerCheckSettings: null,
    ownerUserId: 'user-1',
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    estimatedDurationSeconds: 60,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    draft: null,
    skillOverride: null,
    instructions: languages.map(instruction),
  });
}

const languagesOf = (dto: ExerciseResponseDto): string[] =>
  (dto.instructions ?? []).map((i) => i.instructionLanguage);

describe('the instruction a learner reads first', () => {
  it('puts the asked-for language first', () => {
    // Every client reads `instructions[0]`, so this order is the answer to `?lang=`.
    const dto = ExerciseResponseDto.from(exercise(['en', 'nb', 'ru', 'uk']), 'uk');

    expect(languagesOf(dto)[0]).toBe('uk');
    expect(dto.instructions?.[0]?.instructionText).toBe('text-uk');
  });

  it('falls back to English when the language asked for is not written', () => {
    const dto = ExerciseResponseDto.from(exercise(['nb', 'en', 'ru']), 'uk');

    expect(languagesOf(dto)[0]).toBe('en');
  });

  it('falls back to what there is when English is not written either', () => {
    const dto = ExerciseResponseDto.from(exercise(['nb', 'ru']), 'uk');

    expect(languagesOf(dto)[0]).toBe('nb');
  });

  it('keeps every instruction, and the rest in the order they arrived', () => {
    // Ordered, not filtered: an authoring screen has a use for the other languages.
    const dto = ExerciseResponseDto.from(exercise(['nb', 'en', 'ru', 'uk']), 'ru');

    expect(languagesOf(dto)).toEqual(['ru', 'en', 'nb', 'uk']);
  });

  it('prefers English when nothing was asked for', () => {
    const dto = ExerciseResponseDto.from(exercise(['nb', 'ru', 'en']));

    expect(languagesOf(dto)[0]).toBe('en');
  });
});
