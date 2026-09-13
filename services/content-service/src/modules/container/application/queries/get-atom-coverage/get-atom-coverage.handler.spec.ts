jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetAtomCoverageHandler } from './get-atom-coverage.handler.js';
import { GetAtomCoverageQuery } from './get-atom-coverage.query.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import type { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';

interface VariantFixture {
  lessonId: string;
  status: 'DRAFT' | 'PUBLISHED';
  glossary?: string[];
  spans?: Array<{ kind: 'VOCAB' | 'GRAMMAR' | 'CHUNK'; refId: string | null }>;
  listeningStages?: string[];
}

interface Fixture {
  containers: Record<
    string,
    {
      id: string;
      title: string;
      containerType: string;
      currentPublishedVersionId: string | null;
      draftVersionId?: string | null;
    }
  >;
  items: Record<string, Array<{ itemType: string; itemId: string }>>;
  variants?: VariantFixture[];
  words?: Record<string, string>;
  rules?: Record<
    string,
    { title: string; atoms: Array<{ id: string; title: string; track: string }> }
  >;
  relations?: Array<{ sourceType: string; sourceId: string; targetType: string; targetId: string }>;
  pool?: Array<{ exerciseId: string; grammarRuleId: string }>;
  targets?: Array<{
    exerciseId: string;
    itemKey: string | null;
    atomType: 'VOCABULARY_ITEM' | 'GRAMMAR_RULE_ATOM';
    atomId: string;
    role: 'FOCUS' | 'CONTEXT';
  }>;
}

function prismaFrom(fixture: Fixture): PrismaService {
  const inOf = (clause: unknown): string[] => (clause as { in?: string[] } | undefined)?.in ?? [];

  return {
    container: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(fixture.containers[where.id] ?? null),
    },
    containerVersion: {
      findFirst: ({ where }: { where: { containerId: string } }) => {
        const draftId = fixture.containers[where.containerId]?.draftVersionId ?? null;
        return Promise.resolve(draftId === null ? null : { id: draftId });
      },
    },
    containerItem: {
      findMany: ({ where }: { where: { containerVersionId: string } }) =>
        Promise.resolve(fixture.items[where.containerVersionId] ?? []),
    },
    lessonContentVariant: {
      findMany: ({ where }: { where: { lessonId: { in: string[] }; status?: string } }) => {
        const kept = (fixture.variants ?? []).filter(
          (variant) =>
            where.lessonId.in.includes(variant.lessonId) &&
            (where.status === undefined || variant.status === where.status),
        );
        return Promise.resolve(
          kept.map((variant) => ({
            listeningStages: (variant.listeningStages ?? []).map((exerciseId) => ({ exerciseId })),
            videoQuestion: null,
            glossaryMarks: (variant.glossary ?? []).map((vocabularyItemId) => ({
              vocabularyItemId,
            })),
            textSpans: variant.spans ?? [],
          })),
        );
      },
    },
    contentRelation: {
      findMany: ({
        where,
      }: {
        where: { OR: Array<{ sourceType: string; sourceId: { in: string[] } }> };
      }) =>
        Promise.resolve(
          (fixture.relations ?? []).filter((relation) =>
            where.OR.some(
              (clause) =>
                clause.sourceType === relation.sourceType &&
                clause.sourceId.in.includes(relation.sourceId),
            ),
          ),
        ),
    },
    grammarRuleExercisePool: {
      findMany: ({ where }: { where: { exerciseId: { in: string[] } } }) =>
        Promise.resolve(
          (fixture.pool ?? []).filter((entry) => where.exerciseId.in.includes(entry.exerciseId)),
        ),
    },
    exerciseItemTarget: {
      findMany: ({ where }: { where: { exerciseId: { in: string[] } } }) =>
        Promise.resolve(
          (fixture.targets ?? []).filter((target) =>
            where.exerciseId.in.includes(target.exerciseId),
          ),
        ),
    },
    vocabularyItem: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in
            .filter((id) => fixture.words?.[id] !== undefined)
            .map((id) => ({ id, word: fixture.words?.[id] as string })),
        ),
    },
    grammarRuleAtom: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) => {
        const found: Array<{ grammarRuleId: string }> = [];
        for (const [ruleId, rule] of Object.entries(fixture.rules ?? {})) {
          for (const atom of rule.atoms) {
            if (where.id.in.includes(atom.id)) found.push({ grammarRuleId: ruleId });
          }
        }
        return Promise.resolve(found);
      },
    },
    grammarRule: {
      findMany: ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          inOf(where.id)
            .filter((id) => fixture.rules?.[id] !== undefined)
            .map((id) => ({
              id,
              title: fixture.rules?.[id]?.title,
              atoms: fixture.rules?.[id]?.atoms,
            })),
        ),
    },
  } as unknown as PrismaService;
}

/** Modality by exercise id; anything unnamed is a template nobody has judged. */
function axesFrom(modalities: Record<string, string>): IExerciseAxes {
  return {
    forExercise: () => Promise.resolve(null),
    forExercises: (ids: readonly string[]) =>
      Promise.resolve(
        new Map(
          ids
            .filter((id) => modalities[id] !== undefined)
            .map((id) => [
              id,
              {
                skills: ['reading'],
                focus: [],
                form: 'bank',
                modality: modalities[id],
                skillSource: 'template',
                focusSource: 'unknown',
                modalitySource: 'template',
              },
            ]),
        ) as never,
      ),
  };
}

const UNIT = {
  id: 'unit-1',
  title: 'Leksjon 17',
  containerType: 'module',
  currentPublishedVersionId: 'v-pub',
  draftVersionId: 'v-draft',
};

describe('GetAtomCoverageHandler (plan 63 §4.2)', () => {
  it('fails for a container nobody can find', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({ containers: {}, items: {} }),
      axesFrom({}),
    );
    const result = await handler.execute(new GetAtomCoverageQuery('missing'));
    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ContainerDomainError.CONTAINER_NOT_FOUND);
  });

  it('reports a version that does not exist as unavailable, not as a course of zeroes', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: {
          'unit-1': { ...UNIT, currentPublishedVersionId: null, draftVersionId: null },
        },
        items: {},
      }),
      axesFrom({}),
    );
    const result = await handler.execute(new GetAtomCoverageQuery('unit-1', 'published'));
    expect(result.value.available).toBe(false);
    expect(result.value.summary.introduced).toBe(0);
  });

  it('names the words a lesson introduces and never tests', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: { 'unit-1': UNIT },
        items: {
          'v-draft': [
            { itemType: 'LESSON', itemId: 'lesson-1' },
            { itemType: 'EXERCISE', itemId: 'ex-1' },
          ],
        },
        variants: [{ lessonId: 'lesson-1', status: 'DRAFT', glossary: ['w-1', 'w-2'] }],
        words: { 'w-1': 'jobb', 'w-2': 'søknad' },
        targets: [
          {
            exerciseId: 'ex-1',
            itemKey: 'g1',
            atomType: 'VOCABULARY_ITEM',
            atomId: 'w-1',
            role: 'FOCUS',
          },
        ],
      }),
      axesFrom({ 'ex-1': 'recognition' }),
    );

    const { value } = await handler.execute(new GetAtomCoverageQuery('unit-1'));

    expect(value.summary.introduced).toBe(2);
    expect(value.summary.tested).toBe(1);
    expect(value.summary.untested).toBe(1);
    // Worst first: the untested word opens the list.
    expect(value.atoms[0]?.title).toBe('søknad');
    expect(value.issues).toContainEqual(
      expect.objectContaining({ code: 'atom_untested', title: 'søknad' }),
    );
  });

  it('prints a zero for production rather than leaving the key out', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: { 'unit-1': UNIT },
        items: { 'v-draft': [{ itemType: 'EXERCISE', itemId: 'ex-1' }] },
        words: { 'w-1': 'jobb' },
        relations: [
          {
            sourceType: 'CONTAINER',
            sourceId: 'unit-1',
            targetType: 'VOCABULARY_ITEM',
            targetId: 'w-1',
          },
        ],
        targets: [
          {
            exerciseId: 'ex-1',
            itemKey: null,
            atomType: 'VOCABULARY_ITEM',
            atomId: 'w-1',
            role: 'FOCUS',
          },
        ],
      }),
      axesFrom({ 'ex-1': 'recognition' }),
    );

    const { value } = await handler.execute(new GetAtomCoverageQuery('unit-1'));

    expect(value.summary.byModality).toEqual({
      recognition: 1,
      recall: 0,
      production: 0,
      unknown: 0,
    });
    expect(value.issues).toContainEqual(expect.objectContaining({ code: 'scope_no_production' }));
    expect(value.issues).toContainEqual(
      expect.objectContaining({
        code: 'atom_single_modality',
        modality: 'recognition',
        severity: 'warning',
      }),
    );
  });

  it('separates a word the items only required from one they never mention', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: { 'unit-1': UNIT },
        items: {
          'v-draft': [
            { itemType: 'LESSON', itemId: 'lesson-1' },
            { itemType: 'EXERCISE', itemId: 'ex-1' },
          ],
        },
        variants: [{ lessonId: 'lesson-1', status: 'DRAFT', glossary: ['w-1', 'w-2'] }],
        words: { 'w-1': 'hus', 'w-2': 'bil' },
        targets: [
          {
            exerciseId: 'ex-1',
            itemKey: 'g1',
            atomType: 'VOCABULARY_ITEM',
            atomId: 'w-1',
            role: 'CONTEXT',
          },
        ],
      }),
      axesFrom({ 'ex-1': 'recall' }),
    );

    const { value } = await handler.execute(new GetAtomCoverageQuery('unit-1'));

    expect(value.summary.contextOnly).toBe(1);
    expect(value.summary.untested).toBe(1);
    expect(value.issues).toContainEqual(
      expect.objectContaining({ code: 'atom_context_only', title: 'hus' }),
    );
  });

  it('cuts a rule into its atoms and says when one is only ever recognised', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: { 'unit-1': UNIT },
        items: {
          'v-draft': [
            { itemType: 'EXERCISE', itemId: 'ex-1' },
            { itemType: 'EXERCISE', itemId: 'ex-2' },
          ],
        },
        rules: {
          'rule-1': {
            title: 'Bestemt form',
            atoms: [
              { id: 'a-1', title: 'Definite plural', track: 'GRAMMAR' },
              { id: 'a-2', title: 'Gender', track: 'LEXIS' },
            ],
          },
        },
        pool: [{ exerciseId: 'ex-1', grammarRuleId: 'rule-1' }],
        targets: [
          {
            exerciseId: 'ex-1',
            itemKey: 'g1',
            atomType: 'GRAMMAR_RULE_ATOM',
            atomId: 'a-1',
            role: 'FOCUS',
          },
          {
            exerciseId: 'ex-2',
            itemKey: 'g1',
            atomType: 'GRAMMAR_RULE_ATOM',
            atomId: 'a-1',
            role: 'FOCUS',
          },
        ],
      }),
      axesFrom({ 'ex-1': 'recognition', 'ex-2': 'recognition' }),
    );

    const { value } = await handler.execute(new GetAtomCoverageQuery('unit-1'));

    expect(value.summary.introduced).toBe(2);
    expect(value.summary.introducedByTrack).toEqual({ lexis: 1, grammar: 1 });
    const definite = value.atoms.find((atom) => atom.atomId === 'a-1');
    expect(definite?.introducedBy).toEqual(['exercise_pool']);
    expect(definite?.exercises).toBe(2);
    expect(definite?.byModality.recognition).toBe(2);
    expect(value.issues).toContainEqual(
      expect.objectContaining({ code: 'atom_untested', title: 'Gender' }),
    );
  });

  it('names a rule nobody has cut instead of contributing nothing for it', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: { 'unit-1': UNIT },
        items: { 'v-draft': [{ itemType: 'EXERCISE', itemId: 'ex-1' }] },
        rules: { 'rule-1': { title: 'Modalverb', atoms: [] } },
        pool: [{ exerciseId: 'ex-1', grammarRuleId: 'rule-1' }],
      }),
      axesFrom({ 'ex-1': 'recall' }),
    );

    const { value } = await handler.execute(new GetAtomCoverageQuery('unit-1'));

    expect(value.rulesWithoutAtoms).toEqual([{ ruleId: 'rule-1', title: 'Modalverb' }]);
    expect(value.issues).toContainEqual(
      expect.objectContaining({ code: 'rule_without_atoms', ruleId: 'rule-1' }),
    );
  });

  it('counts an atom the scope only practises apart from the ones it teaches', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: { 'unit-1': UNIT },
        items: { 'v-draft': [{ itemType: 'EXERCISE', itemId: 'ex-1' }] },
        words: { 'w-old': 'gammel' },
        targets: [
          {
            exerciseId: 'ex-1',
            itemKey: 'g1',
            atomType: 'VOCABULARY_ITEM',
            atomId: 'w-old',
            role: 'FOCUS',
          },
        ],
      }),
      axesFrom({ 'ex-1': 'production' }),
    );

    const { value } = await handler.execute(new GetAtomCoverageQuery('unit-1'));

    expect(value.summary.introduced).toBe(0);
    expect(value.summary.untested).toBe(0);
    expect(value.summary.practisedElsewhere).toBe(1);
    expect(value.atoms[0]?.introducedBy).toEqual([]);
  });

  it('says how much of the catalogue carries no address at all', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: { 'unit-1': UNIT },
        items: {
          'v-draft': [
            { itemType: 'EXERCISE', itemId: 'ex-1' },
            { itemType: 'EXERCISE', itemId: 'ex-2' },
            { itemType: 'EXERCISE', itemId: 'ex-3' },
          ],
        },
        words: { 'w-1': 'jobb' },
        targets: [
          {
            exerciseId: 'ex-1',
            itemKey: 'g1',
            atomType: 'VOCABULARY_ITEM',
            atomId: 'w-1',
            role: 'FOCUS',
          },
        ],
      }),
      axesFrom({ 'ex-1': 'recall', 'ex-2': 'recall', 'ex-3': 'recall' }),
    );

    const { value } = await handler.execute(new GetAtomCoverageQuery('unit-1'));

    expect(value.summary.exercises).toBe(3);
    expect(value.summary.exercisesAddressed).toBe(1);
    expect(value.issues[0]).toEqual(
      expect.objectContaining({ code: 'scope_unaddressed_exercises', count: 2, total: 3 }),
    );
  });

  it('summarises each unit of a course beside the course itself', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: {
          course: {
            id: 'course',
            title: 'Ny i Norge',
            containerType: 'course',
            currentPublishedVersionId: null,
            draftVersionId: 'c-draft',
          },
          'unit-1': UNIT,
        },
        items: {
          'c-draft': [{ itemType: 'CONTAINER', itemId: 'unit-1' }],
          'v-draft': [{ itemType: 'LESSON', itemId: 'lesson-1' }],
        },
        variants: [{ lessonId: 'lesson-1', status: 'DRAFT', glossary: ['w-1'] }],
        words: { 'w-1': 'jobb' },
      }),
      axesFrom({}),
    );

    const { value } = await handler.execute(new GetAtomCoverageQuery('course'));

    expect(value.summary.introduced).toBe(1);
    expect(value.units).toHaveLength(1);
    expect(value.units[0]?.title).toBe('Leksjon 17');
    expect(value.units[0]?.summary.untested).toBe(1);
  });

  it('reads the published composition and its published variants when asked to', async () => {
    const handler = new GetAtomCoverageHandler(
      prismaFrom({
        containers: { 'unit-1': UNIT },
        items: {
          'v-pub': [{ itemType: 'LESSON', itemId: 'lesson-1' }],
          'v-draft': [
            { itemType: 'LESSON', itemId: 'lesson-1' },
            { itemType: 'EXERCISE', itemId: 'ex-1' },
          ],
        },
        variants: [
          { lessonId: 'lesson-1', status: 'PUBLISHED', glossary: ['w-1'] },
          { lessonId: 'lesson-1', status: 'DRAFT', glossary: ['w-1', 'w-2'] },
        ],
        words: { 'w-1': 'jobb', 'w-2': 'søknad' },
      }),
      axesFrom({}),
    );

    const published = await handler.execute(new GetAtomCoverageQuery('unit-1', 'published'));
    expect(published.value.summary.introduced).toBe(1);

    const draft = await handler.execute(new GetAtomCoverageQuery('unit-1', 'draft'));
    expect(draft.value.summary.introduced).toBe(2);
  });
});
