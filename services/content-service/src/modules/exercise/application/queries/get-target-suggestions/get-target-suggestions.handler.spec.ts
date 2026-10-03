import { GetTargetSuggestionsHandler } from './get-target-suggestions.handler.js';
import { GetTargetSuggestionsQuery } from './get-target-suggestions.query.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { ExerciseItemTarget } from '../../../domain/entities/exercise-item-target.entity.js';
import { AtomType, TargetRole } from '../../../domain/value-objects/atom-type.vo.js';

// The view speaks plain strings — it is a read model on its way to JSON — so assertions
// compare against the enum's values rather than its members.
const FOCUS: string = TargetRole.FOCUS;
const CONTEXT: string = TargetRole.CONTEXT;
const WORD: string = AtomType.VOCABULARY_ITEM;
const GRAMMAR_ATOM: string = AtomType.GRAMMAR_RULE_ATOM;
import type { CandidateAtoms } from '../../../domain/repositories/exercise-item-target.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseItemTargetRepository } from '../../../domain/repositories/exercise-item-target.repository.interface.js';

const EXERCISE_ID = 'exercise-1';

// The shape of a real seeded exercise: the gap answers `stillingsannonser`, the list holds
// `stillingsannonse`.
const GAP_FILL_CONTENT = {
  sentences: [
    {
      id: 's1',
      gaps: [8],
      text: 'En kveld sitter Bartek foran datamaskinen og leser stillingsannonser på nettet.',
    },
    { id: 's2', gaps: [1], text: 'Han har førerkort og lang erfaring.' },
  ],
  distractors: [],
  settings: {
    shuffle: true,
    allowReuse: false,
    showBankCount: true,
    caseSensitive: false,
    input: 'bank',
  },
};

const EMPTY_CANDIDATES: CandidateAtoms = { words: [], grammarAtoms: [], rulesWithoutAtoms: [] };

function makeHandler(overrides: {
  candidates?: Partial<CandidateAtoms>;
  existing?: ExerciseItemTarget[];
  templateCode?: string;
  content?: unknown;
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

  const targetRepo = {
    findCandidateAtoms: jest
      .fn()
      .mockResolvedValue({ ...EMPTY_CANDIDATES, ...overrides.candidates }),
    findByExerciseId: jest.fn().mockResolvedValue(overrides.existing ?? []),
    replaceForItem: jest.fn(),
    describeAtoms: jest.fn(),
  } as unknown as IExerciseItemTargetRepository;

  return new GetTargetSuggestionsHandler(exerciseRepo, targetRepo);
}

describe('GetTargetSuggestionsHandler', () => {
  it('matches a word to the gap that answers an inflected form of it', async () => {
    // The case the whole backfill stands on. Equality would attribute nothing here.
    const handler = makeHandler({
      candidates: { words: [{ atomId: 'w1', word: 'stillingsannonse' }] },
    });

    const result = await handler.execute(new GetTargetSuggestionsQuery(EXERCISE_ID));

    const gap = result.value.items.find((item) => item.itemKey === 's1#8');
    expect(gap?.suggestions).toHaveLength(1);
    expect(gap?.suggestions[0].reason).toBe('word_inflected');
    expect(gap?.suggestions[0].atomId).toBe('w1');
  });

  it('leaves a gap no word matches alone', async () => {
    const handler = makeHandler({
      candidates: { words: [{ atomId: 'w1', word: 'stillingsannonse' }] },
    });

    const result = await handler.execute(new GetTargetSuggestionsQuery(EXERCISE_ID));

    expect(result.value.items.find((item) => item.itemKey === 's2#1')?.suggestions).toEqual([]);
  });

  it('calls a word the focus when no grammar is in play', async () => {
    const handler = makeHandler({ candidates: { words: [{ atomId: 'w1', word: 'erfaring' }] } });

    const result = await handler.execute(new GetTargetSuggestionsQuery(EXERCISE_ID));

    const all = result.value.items.flatMap((item) => item.suggestions);
    expect(all.every((suggestion) => suggestion.role === FOCUS)).toBe(true);
  });

  it('demotes a word to context when the exercise also practises a rule', async () => {
    // The gap answers a word, but what is being examined is the ending. Full evidence for
    // the grammar atom, weak for the word.
    const handler = makeHandler({
      candidates: {
        words: [{ atomId: 'w1', word: 'stillingsannonse' }],
        grammarAtoms: [{ atomId: 'a1', title: 'Definite plural', ruleId: 'r1', track: 'grammar' }],
      },
    });

    const result = await handler.execute(new GetTargetSuggestionsQuery(EXERCISE_ID));

    const gap = result.value.items.find((item) => item.itemKey === 's1#8');
    const word = gap?.suggestions.find((s) => s.atomType === WORD);
    const grammar = gap?.suggestions.find((s) => s.atomType === GRAMMAR_ATOM);
    expect(word?.role).toBe(CONTEXT);
    expect(grammar?.role).toBe(FOCUS);
  });

  it('is confident about a rule with one atom and not about a rule with three', async () => {
    const handler = makeHandler({
      candidates: {
        grammarAtoms: [
          { atomId: 'a1', title: 'Gender', ruleId: 'r1', track: 'lexis' },
          { atomId: 'a2', title: 'Definite singular', ruleId: 'r1', track: 'grammar' },
          { atomId: 'a3', title: 'Definite plural', ruleId: 'r1', track: 'grammar' },
        ],
      },
    });

    const result = await handler.execute(new GetTargetSuggestionsQuery(EXERCISE_ID));

    const suggestions = result.value.items[0].suggestions;
    expect(suggestions.every((s) => s.reason === 'rule_candidate')).toBe(true);
    expect(suggestions.every((s) => s.confident === false)).toBe(true);
  });

  it('drops confidence when two words match the same gap', async () => {
    // Near-duplicates in the list. Offering both without saying so would have the author
    // accept whichever came first.
    const handler = makeHandler({
      candidates: {
        words: [
          { atomId: 'w1', word: 'stillingsannonse' },
          { atomId: 'w2', word: 'stillingsannonser' },
        ],
      },
    });

    const result = await handler.execute(new GetTargetSuggestionsQuery(EXERCISE_ID));

    const gap = result.value.items.find((item) => item.itemKey === 's1#8');
    expect(gap?.suggestions).toHaveLength(2);
    expect(gap?.suggestions.every((s) => s.confident === false)).toBe(true);
  });

  it('names a rule nobody has cut into atoms', async () => {
    // Otherwise an empty suggestion list looks like "nothing is known about this exercise",
    // when what is true is "somebody has to cut this rule up first".
    const handler = makeHandler({
      candidates: { rulesWithoutAtoms: [{ ruleId: 'r1', title: 'Bestemt form' }] },
    });

    const result = await handler.execute(new GetTargetSuggestionsQuery(EXERCISE_ID));

    expect(result.value.rulesWithoutAtoms).toEqual([{ ruleId: 'r1', title: 'Bestemt form' }]);
  });

  it('flags an item that already carries targets', async () => {
    const existing = ExerciseItemTarget.create({
      exerciseId: EXERCISE_ID,
      itemKey: 's1#8',
      atomType: AtomType.VOCABULARY_ITEM,
      atomId: 'w9',
      role: TargetRole.FOCUS,
      createdByUserId: 'user-1',
    });
    const handler = makeHandler({
      existing: [existing.value],
      candidates: { words: [{ atomId: 'w1', word: 'stillingsannonse' }] },
    });

    const result = await handler.execute(new GetTargetSuggestionsQuery(EXERCISE_ID));

    expect(result.value.items.find((item) => item.itemKey === 's1#8')?.alreadyAddressed).toBe(true);
    expect(result.value.items.find((item) => item.itemKey === 's2#1')?.alreadyAddressed).toBe(
      false,
    );
  });

  it('puts everything on the exercise when the template grades as a whole', async () => {
    const handler = makeHandler({
      templateCode: 'writing_task',
      content: {},
      candidates: { words: [{ atomId: 'w1', word: 'erfaring' }] },
    });

    const result = await handler.execute(new GetTargetSuggestionsQuery(EXERCISE_ID));

    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0].itemKey).toBeNull();
    expect(result.value.items[0].suggestions[0].atomId).toBe('w1');
  });

  it('refuses an unknown exercise', async () => {
    const exerciseRepo = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as IExerciseRepository;
    const targetRepo = {
      findCandidateAtoms: jest.fn(),
      findByExerciseId: jest.fn(),
      replaceForItem: jest.fn(),
      describeAtoms: jest.fn(),
    } as unknown as IExerciseItemTargetRepository;

    const result = await new GetTargetSuggestionsHandler(exerciseRepo, targetRepo).execute(
      new GetTargetSuggestionsQuery(EXERCISE_ID),
    );

    expect(result.error).toBe(ExerciseDomainError.EXERCISE_NOT_FOUND);
  });
});
