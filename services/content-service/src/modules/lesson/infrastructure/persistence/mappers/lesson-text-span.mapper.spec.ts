import { LessonSpanKind as PrismaSpanKind } from '../../../../../../generated/prisma/enums.js';
import { LessonTextSpanEntity } from '../../../domain/entities/lesson-text-span.entity.js';
import { LessonSpanKind } from '../../../domain/value-objects/lesson-span-kind.vo.js';
import { LessonTextSpanMapper } from './lesson-text-span.mapper.js';

const PARAGRAPH = 'Han skriver en søknad til firmaet.';

function makeEntity(kind: LessonSpanKind) {
  const result = LessonTextSpanEntity.create({
    lessonContentVariantId: '022eccb1-14ca-57a6-9853-071d67b2b497',
    paragraphIndex: 0,
    charStart: 4,
    charEnd: 11,
    kind,
    refId: kind === LessonSpanKind.CHUNK ? null : 'f1e2d3c4-b5a6-4978-8a9b-0c1d2e3f4a5b',
    note: kind === LessonSpanKind.CHUNK ? 'Fast uttrykk' : null,
    textSnapshot: PARAGRAPH.slice(4, 11),
    createdByUserId: '0b2f2404-854a-4ea5-9d33-816db353983f',
  });

  if (result.isFail) {
    throw new Error(`fixture rejected: ${String(result.error)}`);
  }
  return result.value;
}

describe('LessonTextSpanMapper', () => {
  /**
   * The regression this file exists for. Prisma Client's generated enum holds
   * the member names (`VOCAB`), while `@map("vocab")` only renames the Postgres
   * labels; the domain enum holds the lowercase wire form. Passing one where the
   * other is expected compiles under a cast and then fails at runtime with
   * "Invalid value for argument `kind`", which no repository-mocking test can
   * see. Asserting the literal values is the only thing that catches it.
   */
  describe('kind translation', () => {
    it.each([
      [LessonSpanKind.VOCAB, 'VOCAB'],
      [LessonSpanKind.GRAMMAR, 'GRAMMAR'],
      [LessonSpanKind.CHUNK, 'CHUNK'],
    ])('writes %s to the database as %s', (domainKind, expected) => {
      expect(LessonTextSpanMapper.toCreateData(makeEntity(domainKind)).kind).toBe(expected);
    });

    it.each([
      ['VOCAB', LessonSpanKind.VOCAB],
      ['GRAMMAR', LessonSpanKind.GRAMMAR],
      ['CHUNK', LessonSpanKind.CHUNK],
    ])('reads %s back as the domain kind %s', (prismaKind, expected) => {
      const entity = LessonTextSpanMapper.toDomain({
        id: 'ddb5aea2-5cba-4584-952f-9fb3a4bbb8ff',
        lessonContentVariantId: '022eccb1-14ca-57a6-9853-071d67b2b497',
        paragraphIndex: 0,
        charStart: 4,
        charEnd: 11,
        kind: prismaKind as PrismaSpanKind,
        refId: null,
        textSnapshot: 'skriver',
        note: null,
        createdAt: new Date('2026-07-30T00:00:00.000Z'),
        updatedAt: new Date('2026-07-30T00:00:00.000Z'),
        createdByUserId: '0b2f2404-854a-4ea5-9d33-816db353983f',
      });

      expect(entity.kind).toBe(expected);
    });

    it('covers every kind the domain can produce, so a new one cannot slip through untranslated', () => {
      for (const kind of Object.values(LessonSpanKind)) {
        expect(Object.values(PrismaSpanKind)).toContain(
          LessonTextSpanMapper.toCreateData(makeEntity(kind)).kind,
        );
      }
    });
  });

  it('round-trips a span through both directions unchanged', () => {
    const entity = makeEntity(LessonSpanKind.CHUNK);
    const row = LessonTextSpanMapper.toCreateData(entity);

    const back = LessonTextSpanMapper.toDomain({ ...row, note: entity.note });

    expect(back.kind).toBe(entity.kind);
    expect(back.charStart).toBe(entity.charStart);
    expect(back.charEnd).toBe(entity.charEnd);
    expect(back.textSnapshot).toBe(entity.textSnapshot);
    expect(back.note).toBe(entity.note);
  });
});
