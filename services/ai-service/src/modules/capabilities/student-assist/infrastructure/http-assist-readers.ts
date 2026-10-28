import type {
  ClassSession,
  GrammarRuleText,
  IClassSessionReader,
  ICourseMaterialReader,
  IMasteryReader,
  IReviewedWorkReader,
  ReviewedWork,
  UnitMaterial,
  WeakTopic,
  WordLookup,
} from '../application/ports/assist-readers.js';

/**
 * The internal routes the student assistant reads through (plan 83, step 2), all with
 * `x-internal-token` and the `/api/v1` prefix — without the prefix a service answers 404,
 * which reads as "not there". 404 is null; anything else not OK throws, and the toolbox
 * turns that into «unavailable» for the model.
 */
abstract class InternalReader {
  constructor(
    protected readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 5_000,
  ) {}

  protected async get<T>(path: string, query: Record<string, string | null> = {}): Promise<{ status: number; body: T | null }> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) if (value !== null) url.searchParams.set(key, value);
    const res = await fetch(url, {
      headers: { 'x-internal-token': this.internalToken, accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 404) return { status: 404, body: null };
    if (!res.ok && res.status !== 409) throw new Error(`${url.host} answered ${res.status} to ${url.pathname}`);
    return { status: res.status, body: (await res.json()) as T };
  }
}

export class HttpCourseMaterialReader extends InternalReader implements ICourseMaterialReader {
  async unitMaterial(courseId: string, unitId: string, language: string): Promise<UnitMaterial | null> {
    const path = `/api/v1/internal/assist/courses/${encodeURIComponent(courseId)}/units/${encodeURIComponent(unitId)}`;
    return (await this.get<UnitMaterial>(path, { language })).body;
  }

  async grammarRule(courseId: string, ruleId: string, language: string): Promise<GrammarRuleText | null> {
    const path = `/api/v1/internal/assist/courses/${encodeURIComponent(courseId)}/grammar-rules/${encodeURIComponent(ruleId)}`;
    return (await this.get<GrammarRuleText>(path, { language })).body;
  }

  async lookupWord(lemma: string, userId: string, language: string, courseId: string | null): Promise<WordLookup> {
    const { body } = await this.get<WordLookup>('/api/v1/internal/assist/words', { lemma, userId, language, courseId });
    return body ?? { lemma, course: [], personal: [] };
  }
}

interface MasteryCell {
  skill: string;
  focus: string;
  reason: string;
  successRateEwma: number | null;
}

export class HttpMasteryReader extends InternalReader implements IMasteryReader {
  /** The cells the profile itself judges weak, as labels — the assistant does not diagnose (R-h). */
  async weakTopics(userId: string, courseId: string | null): Promise<WeakTopic[]> {
    const { body } = await this.get<{ weakest?: MasteryCell[] }>(`/api/v1/internal/mastery/${encodeURIComponent(userId)}`, {
      courseId,
      limit: '5',
    });
    return (body?.weakest ?? []).map((cell) => ({
      skill: cell.skill,
      focus: cell.focus,
      reason: cell.reason,
      successRate: typeof cell.successRateEwma === 'number' ? Math.round(cell.successRateEwma * 100) / 100 : null,
    }));
  }
}

export class HttpReviewedWorkReader extends InternalReader implements IReviewedWorkReader {
  async reviewedWork(attemptId: string, userId: string): Promise<ReviewedWork | 'not_reviewed' | null> {
    const { status, body } = await this.get<ReviewedWork>(
      `/api/v1/internal/attempts/${encodeURIComponent(attemptId)}/assist-review`,
      { userId },
    );
    if (status === 409) return 'not_reviewed';
    return body;
  }
}

export class HttpClassSessionReader extends InternalReader implements IClassSessionReader {
  async session(sessionId: string): Promise<ClassSession | null> {
    return (await this.get<ClassSession>(`/api/v1/internal/sessions/${encodeURIComponent(sessionId)}/assist`)).body;
  }
}
