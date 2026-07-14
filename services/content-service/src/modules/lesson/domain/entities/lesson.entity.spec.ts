import { LessonEntity } from './lesson.entity.js';
import { LessonDomainError } from '../exceptions/lesson-domain.exceptions.js';
import { LessonKind } from '../value-objects/lesson-kind.vo.js';
import { DifficultyLevel } from '../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../container/domain/value-objects/visibility.vo.js';

const BASE_PROPS = {
  targetLanguage: 'no',
  difficultyLevel: DifficultyLevel.A1,
  title: 'Weekly conversation practice',
  ownerUserId: 'owner-1',
  visibility: Visibility.PUBLIC,
};

describe('LessonEntity — LIVE stub fields', () => {
  it('creates a LIVE lesson with its stub fields round-tripping', () => {
    const startsAt = new Date('2026-08-01T18:00:00Z');
    const result = LessonEntity.create({
      ...BASE_PROPS,
      kind: LessonKind.LIVE,
      liveStartsAt: startsAt,
      liveDurationMinutes: 60,
      liveJoinUrl: 'https://meet.example.com/session-abc',
      liveCapacity: 20,
    });

    expect(result.isOk).toBe(true);
    const lesson = result.value;
    expect(lesson.kind).toBe(LessonKind.LIVE);
    expect(lesson.liveStartsAt).toEqual(startsAt);
    expect(lesson.liveDurationMinutes).toBe(60);
    expect(lesson.liveJoinUrl).toBe('https://meet.example.com/session-abc');
    expect(lesson.liveCapacity).toBe(20);
  });

  it('defaults LIVE fields to null when not provided', () => {
    const result = LessonEntity.create({ ...BASE_PROPS, kind: LessonKind.LIVE });

    expect(result.isOk).toBe(true);
    expect(result.value.liveStartsAt).toBeNull();
    expect(result.value.liveDurationMinutes).toBeNull();
    expect(result.value.liveJoinUrl).toBeNull();
    expect(result.value.liveCapacity).toBeNull();
  });

  it('rejects LIVE fields on a non-LIVE lesson at creation', () => {
    const result = LessonEntity.create({
      ...BASE_PROPS,
      kind: LessonKind.TEXT,
      liveStartsAt: new Date(),
    });

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LIVE_FIELDS_REQUIRE_LIVE_KIND);
  });

  it('rejects setting LIVE fields via update on a non-LIVE lesson', () => {
    const result = LessonEntity.create({ ...BASE_PROPS, kind: LessonKind.TEXT });
    if (result.isFail) throw new Error('unexpected failure building test fixture');
    const lesson = result.value;

    const updateResult = lesson.update({ liveCapacity: 10 });

    expect(updateResult.isFail).toBe(true);
    expect(updateResult.error).toBe(LessonDomainError.LIVE_FIELDS_REQUIRE_LIVE_KIND);
  });

  it('allows updating LIVE fields on a LIVE lesson, including clearing via null', () => {
    const createResult = LessonEntity.create({
      ...BASE_PROPS,
      kind: LessonKind.LIVE,
      liveJoinUrl: 'https://meet.example.com/old',
    });
    if (createResult.isFail) throw new Error('unexpected failure building test fixture');
    const lesson = createResult.value;

    const updateResult = lesson.update({ liveJoinUrl: null });

    expect(updateResult.isFail).toBe(false);
    expect(lesson.liveJoinUrl).toBeNull();
  });

  it('leaves LIVE fields untouched when omitted from an unrelated update (regression: omitted vs. explicit undefined)', () => {
    const createResult = LessonEntity.create({
      ...BASE_PROPS,
      kind: LessonKind.LIVE,
      liveCapacity: 15,
    });
    if (createResult.isFail) throw new Error('unexpected failure building test fixture');
    const lesson = createResult.value;

    // Simulates a handler passing every command field through unconditionally,
    // with unrelated fields left `undefined` — must NOT wipe liveCapacity.
    const updateResult = lesson.update({ title: 'Updated title', liveCapacity: undefined });

    expect(updateResult.isFail).toBe(false);
    expect(lesson.title).toBe('Updated title');
    expect(lesson.liveCapacity).toBe(15);
  });
});
