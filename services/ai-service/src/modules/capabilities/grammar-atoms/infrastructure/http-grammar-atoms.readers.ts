import type {
  CourseAtom,
  ICourseAtomCatalogReader,
  ILearnerGrammarAtomsReader,
  LearnerAtomStatus,
} from '../application/ports/grammar-atoms.readers.js';

/** A GET with a service token; 404 is null, anything else not OK throws. */
async function getJson<T>(url: URL, header: string, token: string, timeoutMs: number): Promise<T | null> {
  const res = await fetch(url, {
    headers: { [header]: token, accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url.host} answered ${res.status} to ${url.pathname}`);
  return (await res.json()) as T;
}

/**
 * learning-service `GET /api/v1/internal/learners/:userId/grammar-atoms?courseId=` — its own
 * header, `x-service-token` (memory «internal-token-header-differs»). A `partial` answer is
 * taken as it is: a lower bound of what the learner reached is still right.
 */
export class HttpLearnerGrammarAtomsReader implements ILearnerGrammarAtomsReader {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 3_000,
  ) {}

  async atoms(userId: string, courseId: string): Promise<Array<{ atomId: string; status: LearnerAtomStatus }>> {
    const url = new URL(`/api/v1/internal/learners/${encodeURIComponent(userId)}/grammar-atoms`, this.baseUrl);
    url.searchParams.set('courseId', courseId);
    const body = await getJson<{ atoms?: Array<{ atomId: string; status: LearnerAtomStatus }> }>(
      url,
      'x-service-token',
      this.token,
      this.timeoutMs,
    );
    return body?.atoms ?? [];
  }
}

/** content-service `GET /api/v1/internal/courses/:courseId/grammar-atom-catalog?language=` (`x-internal-token`). */
export class HttpCourseAtomCatalogReader implements ICourseAtomCatalogReader {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 3_000,
  ) {}

  async catalog(courseId: string, language: string): Promise<CourseAtom[]> {
    const url = new URL(`/api/v1/internal/courses/${encodeURIComponent(courseId)}/grammar-atom-catalog`, this.baseUrl);
    url.searchParams.set('language', language);
    const body = await getJson<{ atoms?: CourseAtom[] }>(url, 'x-internal-token', this.token, this.timeoutMs);
    return body?.atoms ?? [];
  }
}
