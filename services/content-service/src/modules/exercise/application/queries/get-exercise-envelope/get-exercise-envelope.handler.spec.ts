import { GetExerciseEnvelopeHandler } from './get-exercise-envelope.handler.js';
import { GetExerciseEnvelopeQuery } from './get-exercise-envelope.query.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseTemplateRepository } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import type { ExerciseTemplateEntity } from '../../../../exercise-template/domain/entities/exercise-template.entity.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';
import type { IExerciseItemTargetRepository } from '../../../domain/repositories/exercise-item-target.repository.interface.js';
import { ExerciseItemTarget } from '../../../domain/entities/exercise-item-target.entity.js';
import { AtomType, TargetRole } from '../../../domain/value-objects/atom-type.vo.js';
import { sampleContent, toContent, toExpectedAnswers } from '@ssz/shared-kernel/inflection-table';

const AT = new Date('2026-09-01T10:00:00.000Z');

const LISTENING = {
  skills: ['listening'],
  focus: [],
  form: 'free',
  skillSource: 'placement',
  focusSource: 'unknown',
};

interface Document {
  templateCode: string;
  content: Record<string, unknown>;
  expectedAnswers: Record<string, unknown>;
}

const SHORT_ANSWER: Document = {
  templateCode: 'short_answer',
  content: { prompt: 'Hva sa hun?' },
  expectedAnswers: { accepted: ['ja'] },
};

function build(
  axes: unknown,
  targets: ExerciseItemTarget[] = [],
  document: Document = SHORT_ANSWER,
) {
  const exercise = ExerciseEntity.reconstitute('ex-1', {
    exerciseTemplateId: 'template-1',
    templateCode: document.templateCode,
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.B1,
    content: document.content,
    expectedAnswers: document.expectedAnswers,
    answerCheckSettings: null,
    ownerUserId: 'user-1',
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    estimatedDurationSeconds: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    draft: null,
    skillOverride: null,
    instructions: [],
  });

  const repo = { findById: () => Promise.resolve(exercise) } as unknown as IExerciseRepository;
  const templates = {
    findById: () =>
      Promise.resolve({
        code: 'short_answer',
        contentSchema: {},
        answerSchema: {},
        defaultCheckSettings: {},
        supportedLanguages: null,
      } as unknown as ExerciseTemplateEntity),
  } as unknown as IExerciseTemplateRepository;

  return new GetExerciseEnvelopeHandler(
    repo,
    templates,
    { forExercise: () => Promise.resolve(axes) } as unknown as IExerciseAxes,
    {
      findByExerciseId: () => Promise.resolve(targets),
    } as unknown as IExerciseItemTargetRepository,
  );
}

describe('GetExerciseEnvelopeHandler axes', () => {
  it('carries what the exercise trains, not what its template would suggest', async () => {
    // The engine snapshots the axes onto the attempt from this one call. A short_answer
    // standing as the comprehension stage of an audio lesson is listening, and nothing
    // inside its document would ever say so — only the placement does.
    const handler = build(LISTENING);

    const result = await handler.execute(new GetExerciseEnvelopeQuery('ex-1', 'ru', 'graded'));

    expect(result.isOk).toBe(true);
    expect(result.value.axes.skills).toEqual(['listening']);
    expect(result.value.axes.skillSource).toBe('placement');
  });

  it('degrades to empty axes rather than failing the attempt', async () => {
    // The exercise was read a moment earlier, so a miss here means it was deleted mid
    // flight. Losing one attempt's telemetry beats refusing to start the attempt.
    const handler = build(null);

    const result = await handler.execute(new GetExerciseEnvelopeQuery('ex-1', 'ru', 'graded'));

    expect(result.value.axes.skills).toEqual([]);
    expect(result.value.axes.skillSource).toBe('unknown');
  });
});

describe('GetExerciseEnvelopeHandler targets', () => {
  it('carries what each piece is about, so the attempt can snapshot it', async () => {
    // The address has to reach the attempt at the instant it starts, along with the axes
    // and the atoms: an author re-anchoring this gap next month must not change what this
    // attempt proved.
    const target = ExerciseItemTarget.create({
      exerciseId: 'ex-1',
      itemKey: 's1#5',
      atomType: AtomType.GRAMMAR_RULE_ATOM,
      atomId: 'atom-1',
      role: TargetRole.FOCUS,
      createdByUserId: 'user-1',
    });
    expect(target.isOk).toBe(true);

    const handler = build(LISTENING, [target.value]);

    const result = await handler.execute(new GetExerciseEnvelopeQuery('ex-1', 'ru', 'graded'));

    expect(result.value.targets).toEqual([
      { itemKey: 's1#5', atomType: 'grammar_rule_atom', atomId: 'atom-1', role: 'focus' },
    ]);
  });

  it('answers an empty list for an exercise nobody has addressed', async () => {
    // Most of the catalogue. Not a failure, and not a reason to refuse the attempt.
    const handler = build(LISTENING);

    const result = await handler.execute(new GetExerciseEnvelopeQuery('ex-1', 'ru', 'graded'));

    expect(result.value.targets).toEqual([]);
  });

  it("adds what an inflection table's dictionary rows address by themselves (plan 69, Q1-B)", async () => {
    const doc = sampleContent();
    const table = {
      ...doc,
      rows: doc.rows.map((r) => ({ ...r, dictId: r.id === 'r2' ? 'w-bok' : null })),
    };
    // The author already said `bok` is the focus of one cell: their row wins over the derived one.
    const written = ExerciseItemTarget.create({
      exerciseId: 'ex-1',
      itemKey: 'r2:defSg',
      atomType: AtomType.VOCABULARY_ITEM,
      atomId: 'w-bok',
      role: TargetRole.FOCUS,
      createdByUserId: 'user-1',
    });
    const handler = build(LISTENING, [written.value], {
      templateCode: 'inflection_table',
      content: toContent(table) as unknown as Record<string, unknown>,
      expectedAnswers: toExpectedAnswers(table) as unknown as Record<string, unknown>,
    });

    const result = await handler.execute(new GetExerciseEnvelopeQuery('ex-1', 'ru', 'graded'));

    expect(result.value.targets).toEqual([
      { itemKey: 'r2:defSg', atomType: 'vocabulary_item', atomId: 'w-bok', role: 'focus' },
      { itemKey: 'r2:indefPl', atomType: 'vocabulary_item', atomId: 'w-bok', role: 'context' },
      { itemKey: 'r2:defPl', atomType: 'vocabulary_item', atomId: 'w-bok', role: 'context' },
    ]);
  });
});
