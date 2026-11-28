import { ExplanationLanguage } from './explanation-language.js';

type Answer = string | null | Error;

function languages(school: Answer, learner: Answer) {
  const asked: string[] = [];
  const answer = async (who: string, a: Answer) => {
    asked.push(who);
    if (a instanceof Error) throw a;
    return a;
  };
  const resolver = new ExplanationLanguage(
    { explanationLanguage: async () => answer('school', school) },
    { interfaceLanguage: async () => answer('learner', learner) },
  );
  return { resolver, asked };
}

describe('ExplanationLanguage (OPEN-QUESTIONS П-10)', () => {
  it('takes the school’s language and does not ask for the learner’s', async () => {
    const { resolver, asked } = languages('nb', 'ru');
    expect(await resolver.of({ schoolId: 's-1', userId: 'u-1' })).toBe('nb');
    expect(asked).toEqual(['school']);
  });

  it('falls to the learner’s interface language when the school set none or cannot be read', async () => {
    for (const school of [null, new Error('organization down')]) {
      const { resolver } = languages(school, 'ru');
      expect(await resolver.of({ schoolId: 's-1', userId: 'u-1' })).toBe('ru');
    }
  });

  it('asks only the learner when the work has no school', async () => {
    const { resolver, asked } = languages('nb', 'uk');
    expect(await resolver.of({ schoolId: null, userId: 'u-1' })).toBe('uk');
    expect(asked).toEqual(['learner']);
  });

  it('answers null — the caller’s own default — when neither is known or readable', async () => {
    expect(await languages(null, null).resolver.of({ schoolId: 's-1', userId: 'u-1' })).toBeNull();
    expect(await languages(null, new Error('profile down')).resolver.of({ schoolId: 's-1', userId: 'u-1' })).toBeNull();
    expect(await languages('nb', 'ru').resolver.of({ schoolId: null, userId: null })).toBeNull();
  });
});
