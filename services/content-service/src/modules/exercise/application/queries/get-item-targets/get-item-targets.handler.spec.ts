import { GetItemTargetsHandler } from './get-item-targets.handler.js';
import { GetItemTargetsQuery } from './get-item-targets.query.js';
import { ExerciseItemTarget } from '../../../domain/entities/exercise-item-target.entity.js';
import { AtomType, TargetRole } from '../../../domain/value-objects/atom-type.vo.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseItemTargetRepository } from '../../../domain/repositories/exercise-item-target.repository.interface.js';

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

function makeTarget(itemKey: string | null, atomId = ATOM_ID): ExerciseItemTarget {
  const result = ExerciseItemTarget.create({
    exerciseId: EXERCISE_ID,
    itemKey,
    atomType: AtomType.GRAMMAR_RULE_ATOM,
    atomId,
    role: TargetRole.FOCUS,
    createdByUserId: 'user-1',
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: {
  targets?: ExerciseItemTarget[];
  livingAtomIds?: string[];
  content?: unknown;
  templateCode?: string;
}) {
  const exerciseRepo = {
    findById: jest.fn().mockResolvedValue({
      id: EXERCISE_ID,
      deletedAt: null,
      templateCode: overrides.templateCode ?? 'word_bank_gap_fill',
      authoringContent: overrides.content ?? GAP_FILL_CONTENT,
      authoringExpectedAnswers: {},
    }),
  } as unknown as IExerciseRepository;

  const living = new Set(overrides.livingAtomIds ?? [ATOM_ID]);
  const targetRepo = {
    findByExerciseId: jest.fn().mockResolvedValue(overrides.targets ?? []),
    replaceForItem: jest.fn(),
    describeAtoms: jest
      .fn()
      .mockImplementation((refs: Array<{ atomType: string; atomId: string }>) =>
        Promise.resolve(
          refs
            .filter((ref) => living.has(ref.atomId))
            .map((ref) => ({
              ...ref,
              title: 'Definite plural',
              track: 'grammar',
              parentId: 'rule-1',
            })),
        ),
      ),
  } as unknown as IExerciseItemTargetRepository;

  return new GetItemTargetsHandler(exerciseRepo, targetRepo);
}

describe('GetItemTargetsHandler', () => {
  it('lists every item of the document, addressed or not', async () => {
    // An item left out would be indistinguishable from one nobody has got to yet, and the
    // whole point of the screen is showing which gaps say nothing about themselves.
    const handler = makeHandler({ targets: [makeTarget('s1#1')] });

    const result = await handler.execute(new GetItemTargetsQuery(EXERCISE_ID));

    expect(result.value.items.map((item) => item.itemKey)).toEqual(['s1#1', 's1#5']);
    expect(result.value.items[1].targets).toEqual([]);
  });

  it('resolves the atom title so the author does not read UUIDs', async () => {
    const handler = makeHandler({ targets: [makeTarget('s1#1')] });

    const result = await handler.execute(new GetItemTargetsQuery(EXERCISE_ID));

    expect(result.value.items[0].targets[0].atomTitle).toBe('Definite plural');
    expect(result.value.items[0].targets[0].broken).toBeNull();
  });

  it('reports a target whose gap has been edited away', async () => {
    // A gap key holds a token index, so editing the sentence moves it. Computed on read —
    // a stored flag would need invalidating on every save of the document.
    const handler = makeHandler({ targets: [makeTarget('s1#99')] });

    const result = await handler.execute(new GetItemTargetsQuery(EXERCISE_ID));

    const orphan = result.value.items.find((item) => item.itemKey === 's1#99');
    expect(orphan?.targets[0].broken).toBe('item_missing');
    expect(orphan?.label).toBeNull();
  });

  it('reports a target whose atom was retired', async () => {
    const handler = makeHandler({ targets: [makeTarget('s1#1')], livingAtomIds: [] });

    const result = await handler.execute(new GetItemTargetsQuery(EXERCISE_ID));

    expect(result.value.items[0].targets[0].broken).toBe('atom_missing');
    expect(result.value.items[0].targets[0].atomTitle).toBeNull();
  });

  it('prefers item_missing when both are broken', async () => {
    // Re-anchoring is the author's next move either way, and a target on a gap that no
    // longer exists cannot be acted on at all.
    const handler = makeHandler({ targets: [makeTarget('s1#99')], livingAtomIds: [] });

    const result = await handler.execute(new GetItemTargetsQuery(EXERCISE_ID));

    const orphan = result.value.items.find((item) => item.itemKey === 's1#99');
    expect(orphan?.targets[0].broken).toBe('item_missing');
  });

  it('says a whole-graded template is not addressable inside', async () => {
    const handler = makeHandler({
      templateCode: 'writing_task',
      content: {},
      targets: [makeTarget(null)],
    });

    const result = await handler.execute(new GetItemTargetsQuery(EXERCISE_ID));

    expect(result.value.addressable).toBe(false);
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0].itemKey).toBeNull();
    expect(result.value.items[0].targets[0].broken).toBeNull();
  });
});
