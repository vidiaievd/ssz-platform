import { SetItemTargetsHandler } from './set-item-targets.handler.js';
import { SetItemTargetsCommand } from './set-item-targets.command.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { AtomType, TargetRole } from '../../../domain/value-objects/atom-type.vo.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseItemTargetRepository } from '../../../domain/repositories/exercise-item-target.repository.interface.js';

const USER_ID = 'user-1';
const EXERCISE_ID = 'exercise-1';
const ATOM_ID = '11111111-1111-4111-8111-111111111111';

const GAP_FILL_CONTENT = {
  sentences: [{ id: 's1', text: 'Vi bor i det store huset', gaps: [1, 5] }],
  distractors: [],
  settings: {
    shuffle: true,
    allowReuse: false,
    showBankCount: true,
    caseSensitive: false,
    input: 'bank',
  },
};

function makeExercise(overrides: { templateCode?: string; content?: unknown } = {}) {
  return {
    id: EXERCISE_ID,
    deletedAt: null,
    templateCode: overrides.templateCode ?? 'word_bank_gap_fill',
    authoringContent: overrides.content ?? GAP_FILL_CONTENT,
    authoringExpectedAnswers: {},
  };
}

function makeHandler(
  overrides: {
    exercise?: unknown;
    livingAtoms?: Array<{ atomType: string; atomId: string }>;
  } = {},
) {
  const exerciseRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(overrides.exercise === undefined ? makeExercise() : overrides.exercise),
  } as unknown as IExerciseRepository;

  const living = overrides.livingAtoms ?? [
    { atomType: AtomType.GRAMMAR_RULE_ATOM, atomId: ATOM_ID },
  ];
  const replaceForItem = jest.fn().mockResolvedValue(undefined);
  const targetRepo = {
    findByExerciseId: jest.fn().mockResolvedValue([]),
    replaceForItem,
    describeAtoms: jest
      .fn()
      .mockImplementation((refs: Array<{ atomType: string; atomId: string }>) =>
        Promise.resolve(
          refs
            .filter((ref) =>
              living.some((a) => a.atomType === ref.atomType && a.atomId === ref.atomId),
            )
            .map((ref) => ({ ...ref, title: 'Definite plural', track: 'grammar', parentId: null })),
        ),
      ),
  } as unknown as IExerciseItemTargetRepository;

  return { handler: new SetItemTargetsHandler(exerciseRepo, targetRepo), replaceForItem };
}

const focusTarget = {
  atomType: AtomType.GRAMMAR_RULE_ATOM,
  atomId: ATOM_ID,
  role: TargetRole.FOCUS,
};

describe('SetItemTargetsHandler', () => {
  it('addresses a gap that exists in the document', async () => {
    const { handler, replaceForItem } = makeHandler();

    const result = await handler.execute(
      new SetItemTargetsCommand(USER_ID, EXERCISE_ID, 's1#5', [focusTarget]),
    );

    expect(result.isOk).toBe(true);
    expect(replaceForItem).toHaveBeenCalledWith(EXERCISE_ID, 's1#5', expect.any(Array));
  });

  it('refuses a key the document does not have', async () => {
    // The author is addressing a gap that has been edited away, or mistyped the key. Either
    // way the target would be born broken.
    const { handler, replaceForItem } = makeHandler();

    const result = await handler.execute(
      new SetItemTargetsCommand(USER_ID, EXERCISE_ID, 's1#99', [focusTarget]),
    );

    expect(result.error).toBe(ExerciseDomainError.TARGET_ITEM_NOT_IN_DOCUMENT);
    expect(replaceForItem).not.toHaveBeenCalled();
  });

  it('refuses an item key on a template that grades as a whole', async () => {
    const { handler } = makeHandler({
      exercise: makeExercise({ templateCode: 'writing_task', content: {} }),
    });

    const result = await handler.execute(
      new SetItemTargetsCommand(USER_ID, EXERCISE_ID, 'anything', [focusTarget]),
    );

    expect(result.error).toBe(ExerciseDomainError.TARGET_ITEM_NOT_IN_DOCUMENT);
  });

  it('accepts a whole-exercise target on such a template', async () => {
    const { handler, replaceForItem } = makeHandler({
      exercise: makeExercise({ templateCode: 'writing_task', content: {} }),
    });

    const result = await handler.execute(
      new SetItemTargetsCommand(USER_ID, EXERCISE_ID, null, [focusTarget]),
    );

    expect(result.isOk).toBe(true);
    expect(replaceForItem).toHaveBeenCalledWith(EXERCISE_ID, null, expect.any(Array));
  });

  it('refuses the same atom named twice on one item', async () => {
    // Not a richer statement — a contradiction about how much the item proves. And the
    // unique index would answer with a 500 rather than a name if it got that far.
    const { handler } = makeHandler();

    const result = await handler.execute(
      new SetItemTargetsCommand(USER_ID, EXERCISE_ID, 's1#1', [
        focusTarget,
        { ...focusTarget, role: TargetRole.CONTEXT },
      ]),
    );

    expect(result.error).toBe(ExerciseDomainError.DUPLICATE_TARGET_ATOM);
  });

  it('refuses a target on a retired atom', async () => {
    // Broken targets exist because documents rot, never because we wrote one deliberately.
    const { handler } = makeHandler({ livingAtoms: [] });

    const result = await handler.execute(
      new SetItemTargetsCommand(USER_ID, EXERCISE_ID, 's1#1', [focusTarget]),
    );

    expect(result.error).toBe(ExerciseDomainError.TARGET_ATOM_NOT_FOUND);
  });

  it('clears an item when given an empty list', async () => {
    const { handler, replaceForItem } = makeHandler();

    const result = await handler.execute(
      new SetItemTargetsCommand(USER_ID, EXERCISE_ID, 's1#1', []),
    );

    expect(result.isOk).toBe(true);
    expect(replaceForItem).toHaveBeenCalledWith(EXERCISE_ID, 's1#1', []);
  });

  it('refuses an unknown exercise', async () => {
    const { handler } = makeHandler({ exercise: null });

    const result = await handler.execute(
      new SetItemTargetsCommand(USER_ID, EXERCISE_ID, null, [focusTarget]),
    );

    expect(result.error).toBe(ExerciseDomainError.EXERCISE_NOT_FOUND);
  });
});
