import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { LessonDomainError } from '../exceptions/lesson-domain.exceptions.js';
import { LessonSpanKind } from '../value-objects/lesson-span-kind.vo.js';

/**
 * Why a stored span can no longer be rendered.
 *
 * `offset` — the body moved under it (paragraph gone, range past the end, or the
 * text at the range is no longer what the author selected).
 * `ref` — the vocabulary item or grammar rule it points at is gone.
 */
export type SpanBrokenReason = 'offset' | 'ref';

/**
 * A selection longer than this is a paragraph, not an annotation. The cap also
 * keeps `text_snapshot` — which is compared on every read — small.
 */
export const MAX_SPAN_SNAPSHOT_LENGTH = 400;

interface LessonTextSpanProps {
  lessonContentVariantId: string;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
  kind: LessonSpanKind;
  refId: string | null;
  textSnapshot: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
}

export interface CreateLessonTextSpanProps {
  lessonContentVariantId: string;
  paragraphIndex: number;
  charStart: number;
  charEnd: number;
  kind: LessonSpanKind;
  refId: string | null;
  /** Derived from the current body by the caller — never supplied by the client. */
  textSnapshot: string;
  note?: string | null;
  createdByUserId: string;
}

export class LessonTextSpanEntity extends Entity<string> {
  private constructor(
    id: string,
    private readonly props: LessonTextSpanProps,
  ) {
    super(id);
  }

  get lessonContentVariantId(): string {
    return this.props.lessonContentVariantId;
  }
  get paragraphIndex(): number {
    return this.props.paragraphIndex;
  }
  get charStart(): number {
    return this.props.charStart;
  }
  get charEnd(): number {
    return this.props.charEnd;
  }
  get kind(): LessonSpanKind {
    return this.props.kind;
  }
  get refId(): string | null {
    return this.props.refId;
  }
  get textSnapshot(): string {
    return this.props.textSnapshot;
  }
  get note(): string | null {
    return this.props.note;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }

  static create(
    p: CreateLessonTextSpanProps,
    id?: string,
  ): Result<LessonTextSpanEntity, LessonDomainError> {
    const invariant = LessonTextSpanEntity.checkInvariants(p);
    if (invariant) return Result.fail(invariant);

    const now = new Date();
    return Result.ok(
      new LessonTextSpanEntity(id ?? randomUUID(), {
        lessonContentVariantId: p.lessonContentVariantId,
        paragraphIndex: p.paragraphIndex,
        charStart: p.charStart,
        charEnd: p.charEnd,
        kind: p.kind,
        refId: p.refId,
        textSnapshot: p.textSnapshot,
        note: p.note?.trim() || null,
        createdAt: now,
        updatedAt: now,
        createdByUserId: p.createdByUserId,
      }),
    );
  }

  static reconstitute(id: string, props: LessonTextSpanProps): LessonTextSpanEntity {
    return new LessonTextSpanEntity(id, props);
  }

  /**
   * Points the span at a new range and records what is there now. `kind` and
   * `refId` stay immutable: re-pointing an annotation at a different word is a
   * delete plus a create, which keeps the glossary-mark coupling on the create
   * path only.
   */
  reanchor(
    paragraphIndex: number,
    charStart: number,
    charEnd: number,
    textSnapshot: string,
  ): Result<void, LessonDomainError> {
    const invariant = LessonTextSpanEntity.checkInvariants({
      ...this.props,
      paragraphIndex,
      charStart,
      charEnd,
      textSnapshot,
    });
    if (invariant) return Result.fail(invariant);

    this.props.paragraphIndex = paragraphIndex;
    this.props.charStart = charStart;
    this.props.charEnd = charEnd;
    this.props.textSnapshot = textSnapshot;
    this.props.updatedAt = new Date();
    return Result.ok();
  }

  setNote(note: string | null): void {
    this.props.note = note?.trim() || null;
    this.props.updatedAt = new Date();
  }

  /** True when this span shares at least one character with `other`. */
  overlaps(other: { paragraphIndex: number; charStart: number; charEnd: number }): boolean {
    return (
      this.props.paragraphIndex === other.paragraphIndex &&
      this.props.charStart < other.charEnd &&
      other.charStart < this.props.charEnd
    );
  }

  /**
   * Checks the span against the body it was anchored to. `paragraphs` is
   * `MarkdownParagraphSplitterService.split(bodyMarkdown)`.
   *
   * Returns `'offset'` when the anchor no longer holds, `null` when it does.
   * Reference resolution (`'ref'`) needs repositories and is decided by the
   * application layer.
   */
  brokenReasonAgainst(paragraphs: string[]): SpanBrokenReason | null {
    const paragraph = paragraphs[this.props.paragraphIndex];
    if (paragraph === undefined) return 'offset';
    if (this.props.charEnd > paragraph.length) return 'offset';
    if (paragraph.slice(this.props.charStart, this.props.charEnd) !== this.props.textSnapshot) {
      return 'offset';
    }
    return null;
  }

  private static checkInvariants(p: {
    paragraphIndex: number;
    charStart: number;
    charEnd: number;
    kind: LessonSpanKind;
    refId: string | null;
    textSnapshot: string;
  }): LessonDomainError | null {
    if (!Number.isInteger(p.paragraphIndex) || p.paragraphIndex < 0) {
      return LessonDomainError.INVALID_PARAGRAPH_INDEX;
    }
    if (!Number.isInteger(p.charStart) || !Number.isInteger(p.charEnd)) {
      return LessonDomainError.SPAN_RANGE_INVALID;
    }
    if (p.charStart < 0 || p.charEnd <= p.charStart) {
      return LessonDomainError.SPAN_RANGE_INVALID;
    }
    // A range that covers only markup or whitespace annotates nothing the reader
    // can see, and would be impossible to re-anchor later.
    if (!p.textSnapshot.trim()) {
      return LessonDomainError.SPAN_RANGE_INVALID;
    }
    if (p.textSnapshot.length > MAX_SPAN_SNAPSHOT_LENGTH) {
      return LessonDomainError.SPAN_TOO_LONG;
    }
    const needsRef = p.kind !== LessonSpanKind.CHUNK;
    if (needsRef !== (p.refId !== null)) {
      return LessonDomainError.SPAN_REF_KIND_MISMATCH;
    }
    return null;
  }
}
