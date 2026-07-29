import { LessonTextSpanEntity, MAX_SPAN_SNAPSHOT_LENGTH } from './lesson-text-span.entity.js';
import { LessonSpanKind } from '../value-objects/lesson-span-kind.vo.js';
import { LessonDomainError } from '../exceptions/lesson-domain.exceptions.js';

const PARAGRAPH = 'Sykepleieren jobber om natten. Hun liker jobben sin.';

function makeSpan(
  overrides: Partial<{
    paragraphIndex: number;
    charStart: number;
    charEnd: number;
    kind: LessonSpanKind;
    refId: string | null;
    textSnapshot: string;
  }> = {},
) {
  return LessonTextSpanEntity.create({
    lessonContentVariantId: 'variant-1',
    paragraphIndex: overrides.paragraphIndex ?? 0,
    charStart: overrides.charStart ?? 0,
    charEnd: overrides.charEnd ?? 12,
    kind: overrides.kind ?? LessonSpanKind.VOCAB,
    refId: overrides.refId === undefined ? 'vocab-1' : overrides.refId,
    textSnapshot: overrides.textSnapshot ?? 'Sykepleieren',
    createdByUserId: 'author-1',
  });
}

describe('LessonTextSpanEntity', () => {
  describe('create', () => {
    it('accepts a well-formed vocab span', () => {
      const result = makeSpan();
      expect(result.isOk).toBe(true);
      expect(result.value.textSnapshot).toBe('Sykepleieren');
    });

    it('rejects an inverted or empty range', () => {
      expect(makeSpan({ charStart: 12, charEnd: 12 }).error).toBe(
        LessonDomainError.SPAN_RANGE_INVALID,
      );
      expect(makeSpan({ charStart: 12, charEnd: 4 }).error).toBe(
        LessonDomainError.SPAN_RANGE_INVALID,
      );
    });

    it('rejects a negative paragraph index', () => {
      expect(makeSpan({ paragraphIndex: -1 }).error).toBe(
        LessonDomainError.INVALID_PARAGRAPH_INDEX,
      );
    });

    it('rejects a whitespace-only selection', () => {
      expect(makeSpan({ textSnapshot: '   ' }).error).toBe(LessonDomainError.SPAN_RANGE_INVALID);
    });

    it('rejects a selection longer than the snapshot cap', () => {
      const long = 'a'.repeat(MAX_SPAN_SNAPSHOT_LENGTH + 1);
      expect(makeSpan({ charEnd: long.length, textSnapshot: long }).error).toBe(
        LessonDomainError.SPAN_TOO_LONG,
      );
    });

    it('requires a referent for vocab and grammar, and forbids one for chunk', () => {
      expect(makeSpan({ kind: LessonSpanKind.VOCAB, refId: null }).error).toBe(
        LessonDomainError.SPAN_REF_KIND_MISMATCH,
      );
      expect(makeSpan({ kind: LessonSpanKind.GRAMMAR, refId: null }).error).toBe(
        LessonDomainError.SPAN_REF_KIND_MISMATCH,
      );
      expect(makeSpan({ kind: LessonSpanKind.CHUNK, refId: 'something' }).error).toBe(
        LessonDomainError.SPAN_REF_KIND_MISMATCH,
      );
      expect(makeSpan({ kind: LessonSpanKind.CHUNK, refId: null }).isOk).toBe(true);
    });
  });

  describe('brokenReasonAgainst', () => {
    it('holds while the text under the range is unchanged', () => {
      expect(makeSpan().value.brokenReasonAgainst([PARAGRAPH])).toBeNull();
    });

    it('breaks when an edit earlier in the paragraph shifts the range by one character', () => {
      const shifted = `«${PARAGRAPH}`;
      expect(makeSpan().value.brokenReasonAgainst([shifted])).toBe('offset');
    });

    it('breaks when the paragraph no longer exists', () => {
      expect(makeSpan({ paragraphIndex: 3 }).value.brokenReasonAgainst([PARAGRAPH])).toBe('offset');
    });

    it('breaks when the range runs past the end of the paragraph', () => {
      expect(makeSpan().value.brokenReasonAgainst(['Kort.'])).toBe('offset');
    });

    it('breaks when the same-length text at the range was replaced', () => {
      const replaced = PARAGRAPH.replace('Sykepleieren', 'Sykepleieres');
      expect(makeSpan().value.brokenReasonAgainst([replaced])).toBe('offset');
    });
  });

  describe('overlaps', () => {
    it('is true only for shared characters in the same paragraph', () => {
      const span = makeSpan({ charStart: 0, charEnd: 12 }).value;

      expect(span.overlaps({ paragraphIndex: 0, charStart: 11, charEnd: 18 })).toBe(true);
      // Adjacent ranges touch but share nothing — the range is half-open.
      expect(span.overlaps({ paragraphIndex: 0, charStart: 12, charEnd: 18 })).toBe(false);
      expect(span.overlaps({ paragraphIndex: 1, charStart: 0, charEnd: 12 })).toBe(false);
    });
  });

  describe('reanchor', () => {
    it('moves the span and records the new snapshot', () => {
      const span = makeSpan().value;
      const moved = span.reanchor(1, 4, 9, 'liker');

      expect(moved.isOk).toBe(true);
      expect(span.paragraphIndex).toBe(1);
      expect(span.textSnapshot).toBe('liker');
      expect(span.brokenReasonAgainst(['x', 'Hun liker jobben sin.'])).toBeNull();
    });

    it('refuses an invalid range and leaves the span untouched', () => {
      const span = makeSpan().value;
      const moved = span.reanchor(0, 9, 4, 'noe');

      expect(moved.error).toBe(LessonDomainError.SPAN_RANGE_INVALID);
      expect(span.charStart).toBe(0);
      expect(span.charEnd).toBe(12);
    });
  });
});
