import {
  HttpAttemptScopeReader,
  HttpClassSessionReader,
  HttpCourseLanguageReader,
  HttpCourseMaterialReader,
  HttpEnrollmentReader,
  HttpGroupRosterReader,
  HttpMasteryReader,
  HttpReviewedWorkReader,
  HttpStudentStandingReader,
} from './http-assist-readers.js';

// Plan 83, step 2: the internal routes behind the assistant's tools.

const BASE = 'http://svc:3000';
const TOKEN = 'tok';

function respond(status: number, body: unknown = {}) {
  const fetchMock = jest.fn().mockResolvedValue({ status, ok: status >= 200 && status < 300, json: async () => body });
  global.fetch = fetchMock as never;
  return fetchMock;
}

function requested(fetchMock: jest.Mock): { url: URL; headers: Record<string, string> } {
  const [url, init] = fetchMock.mock.calls[0] as [URL, { headers: Record<string, string> }];
  return { url, headers: init.headers };
}

describe('HttpCourseMaterialReader', () => {
  const reader = new HttpCourseMaterialReader(BASE, TOKEN);

  it('reads a unit under /api/v1 with the internal token', async () => {
    const fetchMock = respond(200, { unit: { id: 'u' } });
    expect(await reader.unitMaterial('c', 'u', 'ru')).toEqual({ unit: { id: 'u' } });
    const { url, headers } = requested(fetchMock);
    expect(url.pathname).toBe('/api/v1/internal/assist/courses/c/units/u');
    expect(url.searchParams.get('language')).toBe('ru');
    expect(headers['x-internal-token']).toBe(TOKEN);
  });

  it('is null on 404 and throws on anything else', async () => {
    respond(404);
    expect(await reader.grammarRule('c', 'r', 'ru')).toBeNull();
    respond(500);
    await expect(reader.grammarRule('c', 'r', 'ru')).rejects.toThrow('500');
  });

  it('looks a word up without a course when there is none', async () => {
    const fetchMock = respond(200, { lemma: 'bil', course: [], personal: [] });
    await reader.lookupWord('bil', 'user-1', 'ru', null);
    const { url } = requested(fetchMock);
    expect(url.pathname).toBe('/api/v1/internal/assist/words');
    expect(url.searchParams.has('courseId')).toBe(false);
    expect(url.searchParams.get('userId')).toBe('user-1');
  });
});

describe('HttpCourseLanguageReader', () => {
  const reader = new HttpCourseLanguageReader(BASE, TOKEN);

  it("reads the course's target language under /api/v1 with the internal token", async () => {
    const fetchMock = respond(200, { courseId: 'c', targetLanguage: 'nb' });
    expect(await reader.targetLanguage('c')).toBe('nb');
    const { url, headers } = requested(fetchMock);
    expect(url.pathname).toBe('/api/v1/internal/assist/courses/c');
    expect(headers['x-internal-token']).toBe(TOKEN);
  });

  it('is null for an unknown course', async () => {
    respond(404);
    expect(await reader.targetLanguage('c')).toBeNull();
  });
});

describe('HttpMasteryReader', () => {
  it('reads the weakest cells as rounded labels', async () => {
    const fetchMock = respond(200, {
      weakest: [{ skill: 'reading', focus: 'vocabulary', reason: 'forgets', successRateEwma: 0.115826, attempts: 17, meanStability: 0.12 }],
    });
    expect(await new HttpMasteryReader(BASE, TOKEN).weakTopics('user-1', 'c')).toEqual([
      { skill: 'reading', focus: 'vocabulary', reason: 'forgets', successRate: 0.12 },
    ]);
    const { url } = requested(fetchMock);
    expect(url.pathname).toBe('/api/v1/internal/mastery/user-1');
    expect(url.searchParams.get('courseId')).toBe('c');
  });
});

describe('HttpReviewedWorkReader', () => {
  const reader = new HttpReviewedWorkReader(BASE, TOKEN);

  it('reads the attempt as the named learner; 409 is «not reviewed», 404 is null', async () => {
    const fetchMock = respond(200, { attemptId: 'a' });
    expect(await reader.reviewedWork('a', 'user-1')).toEqual({ attemptId: 'a' });
    expect(requested(fetchMock).url.toString()).toBe(`${BASE}/api/v1/internal/attempts/a/assist-review?userId=user-1`);
    respond(409, { code: 'NOT_REVIEWED' });
    expect(await reader.reviewedWork('a', 'user-1')).toBe('not_reviewed');
    respond(404);
    expect(await reader.reviewedWork('a', 'user-2')).toBeNull();
  });
});

describe('HttpClassSessionReader', () => {
  it('reads a session', async () => {
    const fetchMock = respond(200, { id: 's' });
    expect(await new HttpClassSessionReader(BASE, TOKEN).session('s')).toEqual({ id: 's' });
    expect(requested(fetchMock).url.pathname).toBe('/api/v1/internal/sessions/s/assist');
  });
});

// Plan 83, step 3: what the payer resolver reads.

describe('HttpEnrollmentReader', () => {
  const reader = new HttpEnrollmentReader(BASE, TOKEN);

  it('asks learning-service with its own header; 404 is «does not hold the course»', async () => {
    const fetchMock = respond(200, { status: 'active', schoolId: 's-1' });
    expect(await reader.enrollment('user-1', 'c')).toEqual({ status: 'active', schoolId: 's-1' });
    const { url, headers } = requested(fetchMock);
    expect(url.toString()).toBe(`${BASE}/api/v1/internal/enrollments/assist?userId=user-1&courseId=c`);
    expect(headers['x-service-token']).toBe(TOKEN);
    expect(headers['x-internal-token']).toBeUndefined();
    respond(404);
    expect(await reader.enrollment('user-1', 'c')).toBeNull();
  });
});

describe('HttpAttemptScopeReader', () => {
  it('reads the attempt\'s course as the named learner', async () => {
    const fetchMock = respond(200, { attemptId: 'a', exerciseId: 'e', courseId: 'c' });
    expect(await new HttpAttemptScopeReader(BASE, TOKEN).attemptScope('a', 'user-1')).toEqual({ attemptId: 'a', exerciseId: 'e', courseId: 'c' });
    const { url, headers } = requested(fetchMock);
    expect(url.toString()).toBe(`${BASE}/api/v1/internal/attempts/a/assist-scope?userId=user-1`);
    expect(headers['x-internal-token']).toBe(TOKEN);
  });
});

describe('HttpGroupRosterReader', () => {
  const reader = new HttpGroupRosterReader(BASE, TOKEN);

  it('reads a group\'s learners; an unknown group is null', async () => {
    const fetchMock = respond(200, { userIds: ['user-1'] });
    expect(await reader.members('s', 'g')).toEqual(['user-1']);
    expect(requested(fetchMock).url.pathname).toBe('/api/v1/internal/schools/s/groups/g/members');
    respond(404);
    expect(await reader.members('s', 'g')).toBeNull();
  });
});

describe('HttpStudentStandingReader', () => {
  it('reads the learner\'s standing; anything but an explicit true is «not a current student»', async () => {
    const reader = new HttpStudentStandingReader(BASE, TOKEN);
    const fetchMock = respond(200, { activeStudent: true });
    expect(await reader.isActiveStudent('s', 'user-1')).toBe(true);
    expect(requested(fetchMock).url.pathname).toBe('/api/v1/internal/schools/s/students/user-1/standing');
    respond(200, { activeStudent: false });
    expect(await reader.isActiveStudent('s', 'user-1')).toBe(false);
    respond(404);
    expect(await reader.isActiveStudent('s', 'user-1')).toBe(false);
  });
});
