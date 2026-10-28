import type { LlmToolCall } from '../../../providers/domain/llm-result.js';
import type { AssistContext } from '../domain/assist-answer.js';
import { AssistToolbox, MAX_TOOL_CHARS, type AssistToolScope } from './assist-toolbox.js';
import type { ClassSession, ReviewedWork, UnitMaterial } from './ports/assist-readers.js';

// Plan 83, step 2: the student assistant's read-only tools.

const COURSE = 'c0000000-0000-4000-8000-000000000001';
const UNIT = 'c0000000-0000-4000-8000-000000000002';
const RULE = 'c0000000-0000-4000-8000-000000000003';
const ATTEMPT = 'c0000000-0000-4000-8000-000000000004';
const LESSON = 'c0000000-0000-4000-8000-000000000005';

const material: UnitMaterial = {
  courseId: COURSE,
  unit: { id: UNIT, title: 'Leksjon 1' },
  lessons: [{ id: 'l-1', title: 'Tekst', text: 'Hei! Jeg heter Ola.', truncated: false }],
  grammarRules: [{ id: RULE, title: 'Kjønn', summary: 'en, ei, et', examples: [] }],
  vocabulary: [{ id: 'w-1', word: 'bil', partOfSpeech: 'noun', translation: 'машина' }],
  exercises: [{ id: 'ex-1', title: 'Fyll inn', template: 'fill_in_blank' }],
};

const work: ReviewedWork = {
  attemptId: ATTEMPT,
  exerciseId: 'ex-1',
  courseId: COURSE,
  templateCode: 'translate',
  status: 'RETURNED',
  reviewedBy: 'teacher',
  reviewedAt: '2026-10-27T10:00:00.000Z',
  score: null,
  passed: null,
  answer: { text: 'x'.repeat(10_000) },
  comment: 'Подумай о времени.',
  decisions: [],
  rubricMarks: null,
};

const session: ClassSession = {
  id: LESSON,
  groupId: 'g-1',
  schoolId: 's-1',
  date: '2026-10-29',
  startTime: '18:00',
  endTime: '19:30',
  status: 'scheduled',
  type: 'lesson',
  contentUnitId: UNIT,
  contentLessonId: null,
};

function setup() {
  const content = {
    unitMaterial: jest.fn().mockResolvedValue(material),
    grammarRule: jest.fn().mockResolvedValue({ ...material.grammarRules[0], text: 'Substantiv har kjønn.', truncated: false }),
    lookupWord: jest.fn().mockResolvedValue({
      lemma: 'bil',
      course: [{ id: 'w-1', word: 'bil', partOfSpeech: 'noun', translation: 'машина', alternatives: [], definition: null, usageNotes: null, falseFriendWarning: null, examples: [] }],
      personal: [{ vocabularyItemId: 'w-1', word: 'bil', surfaceForm: 'Bil', contextSentence: null, translation: 'машина' }],
    }),
  };
  const mastery = { weakTopics: jest.fn().mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ skill: `s${i}`, focus: 'grammar', reason: 'forgets', successRate: 0.1 }))) };
  const reviews = { reviewedWork: jest.fn().mockResolvedValue(work) };
  const classes = { session: jest.fn().mockResolvedValue(session) };
  return { content, mastery, reviews, classes, toolbox: new AssistToolbox(content, mastery, reviews, classes) };
}

const scope = (context: AssistContext): AssistToolScope => ({ userId: 'user-1', context, language: 'ru' });
const call = (name: string, input: unknown = {}): LlmToolCall => ({ id: 'call-1', name, input });
const parsed = (content: string) => JSON.parse(content) as Record<string, unknown>;

describe('AssistToolbox.toolsFor', () => {
  const names = (context: AssistContext) => setup().toolbox.toolsFor(context).map((t) => t.name);

  it('offers each context only the tools that can answer in it', () => {
    expect(names({ kind: 'free' })).toEqual(['lookup_word', 'get_weak_topics']);
    expect(names({ kind: 'unit', courseId: COURSE, unitId: UNIT })).toEqual([
      'get_unit_material',
      'get_grammar_rule',
      'lookup_word',
      'get_weak_topics',
    ]);
    expect(names({ kind: 'submission', attemptId: ATTEMPT, exerciseId: 'ex-1' })).toEqual([
      'get_my_reviewed_work',
      'lookup_word',
      'get_weak_topics',
    ]);
    expect(names({ kind: 'class', lessonId: LESSON, courseId: COURSE })).toEqual([
      'get_class',
      'get_unit_material',
      'get_grammar_rule',
      'lookup_word',
      'get_weak_topics',
    ]);
    expect(names({ kind: 'word', lemma: 'bil' })).toEqual(['lookup_word', 'get_weak_topics']);
  });

  it('takes no ids from the model except a rule and a word', () => {
    const tools = setup().toolbox.toolsFor({ kind: 'class', lessonId: LESSON, courseId: COURSE });
    const inputs = Object.fromEntries(tools.map((t) => [t.name, Object.keys((t.inputSchema['properties'] ?? {}) as object)]));
    expect(inputs).toEqual({
      get_class: [],
      get_unit_material: [],
      get_grammar_rule: ['ruleId'],
      lookup_word: ['lemma'],
      get_weak_topics: [],
    });
  });
});

describe('AssistToolbox.run', () => {
  it('reads the unit of the context and offers its parts as sources', async () => {
    const { toolbox, content } = setup();
    const out = await toolbox.run(call('get_unit_material', { unitId: 'from-the-model' }), scope({ kind: 'unit', courseId: COURSE, unitId: UNIT }));
    expect(content.unitMaterial).toHaveBeenCalledWith(COURSE, UNIT, 'ru');
    expect(parsed(out.content)['unit']).toEqual({ id: UNIT, title: 'Leksjon 1' });
    expect(out.sources.map((s) => `${s.kind}:${s.id}`)).toEqual([`unit:${UNIT}`, 'lesson:l-1', `grammar_rule:${RULE}`, 'vocabulary_item:w-1']);
    expect(out.sources[1]).toEqual({ kind: 'lesson', id: 'l-1', title: 'Tekst', unitId: UNIT, courseId: COURSE });
  });

  it('for a class, reads the unit the class covers', async () => {
    const { toolbox, content } = setup();
    await toolbox.run(call('get_unit_material'), scope({ kind: 'class', lessonId: LESSON, courseId: COURSE }));
    expect(content.unitMaterial).toHaveBeenCalledWith(COURSE, UNIT, 'ru');
  });

  it('refuses a tool the context does not offer', async () => {
    const { toolbox, reviews } = setup();
    const out = await toolbox.run(call('get_my_reviewed_work'), scope({ kind: 'unit', courseId: COURSE, unitId: UNIT }));
    expect(parsed(out.content)['error']).toBe('unknown_tool');
    expect(reviews.reviewedWork).not.toHaveBeenCalled();
  });

  it('reads a rule by the model\'s id, within the context\'s course only', async () => {
    const { toolbox, content } = setup();
    const out = await toolbox.run(call('get_grammar_rule', { ruleId: RULE }), scope({ kind: 'unit', courseId: COURSE, unitId: UNIT }));
    expect(content.grammarRule).toHaveBeenCalledWith(COURSE, RULE, 'ru');
    expect(out.sources).toEqual([{ kind: 'grammar_rule', id: RULE, title: 'Kjønn', courseId: COURSE }]);
    const bad = await toolbox.run(call('get_grammar_rule', { ruleId: '../../etc' }), scope({ kind: 'unit', courseId: COURSE, unitId: UNIT }));
    expect(parsed(bad.content)['error']).toBe('invalid_input');
  });

  it('answers «not found» for what the course does not publish', async () => {
    const { toolbox, content } = setup();
    content.grammarRule.mockResolvedValue(null);
    const out = await toolbox.run(call('get_grammar_rule', { ruleId: RULE }), scope({ kind: 'unit', courseId: COURSE, unitId: UNIT }));
    expect(parsed(out.content)['error']).toBe('not_found');
    expect(out.sources).toEqual([]);
  });

  it('looks a word up for this learner, one source per item', async () => {
    const { toolbox, content } = setup();
    const out = await toolbox.run(call('lookup_word', { lemma: ' bil ' }), scope({ kind: 'free' }));
    expect(content.lookupWord).toHaveBeenCalledWith('bil', 'user-1', 'ru', null);
    expect(out.sources).toEqual([{ kind: 'vocabulary_item', id: 'w-1', title: 'bil' }]);
    expect(parsed((await toolbox.run(call('lookup_word', { lemma: '' }), scope({ kind: 'free' }))).content)['error']).toBe('invalid_input');
  });

  it('reads at most five weak topics, labels only', async () => {
    const { toolbox } = setup();
    const out = await toolbox.run(call('get_weak_topics'), scope({ kind: 'free' }));
    expect((parsed(out.content)['weakTopics'] as unknown[]).length).toBe(5);
    expect(out.sources).toEqual([]);
  });

  it('reads the context\'s attempt as this learner, its answer capped', async () => {
    const { toolbox, reviews } = setup();
    const out = await toolbox.run(call('get_my_reviewed_work'), scope({ kind: 'submission', attemptId: ATTEMPT, exerciseId: 'ex-1' }));
    expect(reviews.reviewedWork).toHaveBeenCalledWith(ATTEMPT, 'user-1');
    expect(out.content.length).toBeLessThan(5_000);
    expect(parsed(out.content)['comment']).toBe('Подумай о времени.');
  });

  it('tells the model not to discuss work that has no verdict yet (R-g)', async () => {
    const { toolbox, reviews } = setup();
    reviews.reviewedWork.mockResolvedValue('not_reviewed');
    const out = await toolbox.run(call('get_my_reviewed_work'), scope({ kind: 'submission', attemptId: ATTEMPT, exerciseId: 'ex-1' }));
    expect(parsed(out.content)).toEqual({
      error: 'not_reviewed',
      message: 'The work has not been reviewed yet; do not discuss what may be wrong with it',
    });
  });

  it('turns a failed read into «unavailable», without its reason', async () => {
    const { toolbox, content } = setup();
    content.unitMaterial.mockRejectedValue(new Error('content-service:3003 answered 500 with secret detail'));
    const out = await toolbox.run(call('get_unit_material'), scope({ kind: 'unit', courseId: COURSE, unitId: UNIT }));
    expect(parsed(out.content)['error']).toBe('unavailable');
    expect(out.content).not.toContain('secret');
  });

  it('caps every result', async () => {
    const { toolbox, content } = setup();
    content.unitMaterial.mockResolvedValue({ ...material, lessons: [{ id: 'l-1', title: 'T', text: 'ord '.repeat(10_000), truncated: false }] });
    const out = await toolbox.run(call('get_unit_material'), scope({ kind: 'unit', courseId: COURSE, unitId: UNIT }));
    expect(out.content.length).toBeLessThanOrEqual(MAX_TOOL_CHARS + 40);
  });
});
