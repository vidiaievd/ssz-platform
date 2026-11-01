import type { GatewayRequest } from '../../gateway/application/model-router.js';
import { toPracticeSubject } from '../practice/application/practice-subject.js';
import { practiceRequest } from '../practice/prompts/prompts.js';
import type { TranslateSubject } from '../review-draft/application/ports/review-attempts.client.js';
import { AtomCatalogResolver } from './application/atom-catalog.resolver.js';
import type { CourseAtom, ILearnerGrammarAtomsReader, LearnerAtomStatus } from './application/ports/grammar-atoms.readers.js';
import { atomRefOf, describedAtomRefOf, MAX_CATALOG_ATOMS, withAtomCatalog, type AtomCatalog } from './domain/atom-catalog.js';

// Plan 85, step 3a: the learner's grammar atoms in a rehearsal's prompt.

const ATOM = 'e0000000-0000-5000-8000-000000000005';
const CATALOG: AtomCatalog = [
  { atomId: ATOM, status: 'in_queue', ruleTitle: 'Времена', title: 'Perfektum: har + partisipp', description: 'Building the form.' },
];

const translate = (): TranslateSubject => ({
  template: 'translate',
  langs: { explain: 'Russisk', target: 'Norsk' },
  ai: { on: true, checks: { grammar: true, lexis: true } },
  sentences: [{ itemId: 's1', direction: 'to_target', source: 'Я живу здесь три года.', refs: ['Jeg har bodd her i tre år'], answer: 'Jeg bor her' }],
});

type RemarkSchema = { properties: { items: { items: { required: string[]; properties: Record<string, unknown> } } } };
const remarkOf = (request: GatewayRequest) => (request.responseSchema!.schema as RemarkSchema).properties.items.items;

describe('withAtomCatalog', () => {
  const v1 = practiceRequest('practice@1', toPracticeSubject(translate(), 'ru'));

  it('leaves the request untouched for an empty catalogue', () => {
    expect(withAtomCatalog(v1, [])).toBe(v1);
  });

  it('lists the atoms in the system prompt and requires a nullable atomId on each remark', () => {
    const request = withAtomCatalog(v1, CATALOG);
    expect(request.system).toContain(`- ${ATOM} — Времена: Perfektum: har + partisipp — Building the form.`);
    expect(request.system).toContain('Never an id that is not in this list.');
    expect(remarkOf(request).required).toContain('atomId');
    // Not an enum: the guard would refuse the whole answer over one invented id.
    expect(remarkOf(request).properties['atomId']).toEqual(expect.objectContaining({ type: ['string', 'null'] }));
    expect(remarkOf(v1).properties['atomId']).toBeUndefined();
  });
});

describe('practice@2', () => {
  it('is v1 with the catalogue, and v1 exactly when there is none', () => {
    const subject = toPracticeSubject(translate(), 'ru');
    const v1 = practiceRequest('practice@1', subject, CATALOG);
    expect(v1.system).not.toContain(ATOM);
    expect(practiceRequest('practice@2', subject, CATALOG).system).toContain(ATOM);
    const empty = practiceRequest('practice@2', subject);
    expect(empty.system).toBe(v1.system);
    expect(empty.responseSchema!.schema).toEqual(v1.responseSchema!.schema);
  });
});

describe('atomRefOf', () => {
  it('names a listed atom on a grammar remark only', () => {
    expect(atomRefOf(ATOM, 'grammar', CATALOG)).toEqual({ atomType: 'grammar_rule_atom', atomId: ATOM });
    expect(atomRefOf(ATOM, 'order', CATALOG)).toEqual({ atomType: 'grammar_rule_atom', atomId: ATOM });
    expect(atomRefOf(ATOM, 'lexis', CATALOG)).toBeNull();
    expect(atomRefOf('invented', 'grammar', CATALOG)).toBeNull();
    expect(atomRefOf(null, 'grammar', CATALOG)).toBeNull();
    expect(atomRefOf(undefined, 'grammar', CATALOG)).toBeNull();
  });
});

describe('describedAtomRefOf', () => {
  it('adds the standing and the names to a catalogue atom, and drops what atomRefOf drops', () => {
    expect(describedAtomRefOf(ATOM, 'grammar', CATALOG)).toEqual({
      atomType: 'grammar_rule_atom',
      atomId: ATOM,
      status: 'in_queue',
      ruleTitle: 'Времена',
      title: 'Perfektum: har + partisipp',
    });
    expect(describedAtomRefOf(ATOM, 'lexis', CATALOG)).toBeNull();
    expect(describedAtomRefOf('invented', 'grammar', CATALOG)).toBeNull();
  });
});

describe('AtomCatalogResolver', () => {
  const course = (ids: string[]): CourseAtom[] =>
    ids.map((atomId) => ({ atomId, ruleId: 'r', ruleTitle: 'R', title: `t-${atomId}`, description: null }));
  const learner = (atoms: Array<[string, LearnerAtomStatus]>): ILearnerGrammarAtomsReader => ({
    atoms: async () => atoms.map(([atomId, status]) => ({ atomId, status })),
  });

  it('keeps the course atoms the learner reached, queue first', async () => {
    const resolver = new AtomCatalogResolver(
      learner([['covered-1', 'covered'], ['queued-1', 'in_queue'], ['other-course', 'in_queue']]),
      { catalog: async () => course(['covered-1', 'queued-1', 'never-reached']) },
    );
    const catalog = await resolver.forLearner({ userId: 'u', courseId: 'c', language: 'ru' });
    expect(catalog.map((atom) => atom.atomId)).toEqual(['queued-1', 'covered-1']);
    expect(catalog[0]).toEqual({ atomId: 'queued-1', status: 'in_queue', ruleTitle: 'R', title: 't-queued-1', description: null });
  });

  it(`stops at ${MAX_CATALOG_ATOMS} atoms`, async () => {
    const ids = Array.from({ length: MAX_CATALOG_ATOMS + 5 }, (_, i) => `a${i}`);
    const resolver = new AtomCatalogResolver(learner(ids.map((id) => [id, 'covered'])), { catalog: async () => course(ids) });
    expect(await resolver.forLearner({ userId: 'u', courseId: 'c', language: 'ru' })).toHaveLength(MAX_CATALOG_ATOMS);
  });

  it('is empty without a course, and when either service fails', async () => {
    const asked: string[] = [];
    const ok = new AtomCatalogResolver(
      { atoms: async () => (asked.push('learner'), []) },
      { catalog: async () => (asked.push('course'), []) },
    );
    expect(await ok.forLearner({ userId: 'u', courseId: null, language: 'ru' })).toEqual([]);
    expect(asked).toEqual([]);

    const down = new AtomCatalogResolver(
      { atoms: async () => { throw new Error('learning down'); } },
      { catalog: async () => course(['a']) },
    );
    expect(await down.forLearner({ userId: 'u', courseId: 'c', language: 'ru' })).toEqual([]);
  });
});
