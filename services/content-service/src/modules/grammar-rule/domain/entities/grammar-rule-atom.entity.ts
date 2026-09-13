import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { GrammarRuleDomainError } from '../exceptions/grammar-rule-domain.exceptions.js';
import { AtomTrack } from '../value-objects/atom-track.vo.js';

/**
 * One thing inside a rule that can be known or not known on its own — plan 63 §2 B.
 *
 * **The address is the id, never `grammarRuleId` + `key`.** A learner's review card and an
 * exercise's target both point at the UUID, which is what makes a rule a folder rather than
 * an identity: an author can rename a rule, split it in two, merge it with another, and move
 * this atom between them without a single learner's schedule noticing.
 *
 * `key` is therefore a slug, not an address. It exists so that a seed or an import has a
 * stable natural name to upsert against, and so that an author reading an event can tell
 * which atom it is about. Renaming one is safe for memory and targets; the only thing that
 * notices is a seed keyed on the old value, which would then create a second atom instead
 * of updating this one.
 */
interface GrammarRuleAtomProps {
  grammarRuleId: string;
  key: string;
  title: string;
  description: string | null;
  track: AtomTrack;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
  deletedAt: Date | null;
}

export interface CreateGrammarRuleAtomProps {
  grammarRuleId: string;
  key: string;
  title: string;
  description?: string | null;
  track: AtomTrack;
  position: number;
  createdByUserId: string;
}

export interface UpdateGrammarRuleAtomProps {
  key?: string;
  title?: string;
  description?: string | null;
  track?: AtomTrack;
}

const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY_MAX_LENGTH = 60;
const TITLE_MAX_LENGTH = 200;

export class GrammarRuleAtom extends Entity<string> {
  private constructor(
    id: string,
    private props: GrammarRuleAtomProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get grammarRuleId(): string {
    return this.props.grammarRuleId;
  }
  get key(): string {
    return this.props.key;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description;
  }
  get track(): AtomTrack {
    return this.props.track;
  }
  get position(): number {
    return this.props.position;
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
  get deletedAt(): Date | null {
    return this.props.deletedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(
    p: CreateGrammarRuleAtomProps,
    id?: string,
  ): Result<GrammarRuleAtom, GrammarRuleDomainError> {
    const key = p.key.trim().toLowerCase();
    const keyError = GrammarRuleAtom.validateKey(key);
    if (keyError) return Result.fail(keyError);

    const title = p.title.trim();
    const titleError = GrammarRuleAtom.validateTitle(title);
    if (titleError) return Result.fail(titleError);

    if (p.position < 0) return Result.fail(GrammarRuleDomainError.INVALID_ATOM_DATA);

    const now = new Date();
    return Result.ok(
      new GrammarRuleAtom(id ?? randomUUID(), {
        grammarRuleId: p.grammarRuleId,
        key,
        title,
        description: GrammarRuleAtom.normaliseDescription(p.description),
        track: p.track,
        position: p.position,
        createdAt: now,
        updatedAt: now,
        createdByUserId: p.createdByUserId,
        deletedAt: null,
      }),
    );
  }

  static reconstitute(id: string, props: GrammarRuleAtomProps): GrammarRuleAtom {
    return new GrammarRuleAtom(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Uniqueness of `key` among the rule's living atoms is the caller's to check — the entity
   * cannot see its siblings. See `UpdateAtomHandler`.
   */
  update(p: UpdateGrammarRuleAtomProps): Result<void, GrammarRuleDomainError> {
    if (p.key !== undefined) {
      const key = p.key.trim().toLowerCase();
      const keyError = GrammarRuleAtom.validateKey(key);
      if (keyError) return Result.fail(keyError);
      this.props.key = key;
    }

    if (p.title !== undefined) {
      const title = p.title.trim();
      const titleError = GrammarRuleAtom.validateTitle(title);
      if (titleError) return Result.fail(titleError);
      this.props.title = title;
    }

    if (p.description !== undefined) {
      this.props.description = GrammarRuleAtom.normaliseDescription(p.description);
    }

    if (p.track !== undefined) {
      this.props.track = p.track;
    }

    this.props.updatedAt = new Date();
    return Result.ok();
  }

  /**
   * Re-parents the atom under another rule — the operation every restructure is made of.
   * Splitting a rule is creating one and moving atoms across; merging two is moving all of
   * them one way and retiring the empty rule.
   *
   * Nothing about the learner changes: the id is the address, so cards, exercise targets and
   * recorded evidence all keep pointing at this same atom. `key` is offered because the
   * destination may already hold one by that name, and it is the caller that knows.
   */
  moveTo(
    targetRuleId: string,
    position: number,
    key?: string,
  ): Result<void, GrammarRuleDomainError> {
    if (position < 0) return Result.fail(GrammarRuleDomainError.INVALID_ATOM_DATA);

    if (key !== undefined) {
      const normalised = key.trim().toLowerCase();
      const keyError = GrammarRuleAtom.validateKey(normalised);
      if (keyError) return Result.fail(keyError);
      this.props.key = normalised;
    }

    this.props.grammarRuleId = targetRuleId;
    this.props.position = position;
    this.props.updatedAt = new Date();
    return Result.ok();
  }

  updatePosition(newPosition: number): Result<void, GrammarRuleDomainError> {
    if (newPosition < 0) return Result.fail(GrammarRuleDomainError.INVALID_ATOM_DATA);
    this.props.position = newPosition;
    this.props.updatedAt = new Date();
    return Result.ok();
  }

  /**
   * Retirement, not removal. From phase 5 a practised atom owns review cards, and from
   * phase 1 it is addressed by exercise targets; a hard delete would leave both pointing
   * at nothing. A retired atom keeps its position (it is simply filtered out of the index
   * that enforces uniqueness) and frees its key for reuse inside the rule.
   */
  softDelete(): Result<void, GrammarRuleDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(GrammarRuleDomainError.ATOM_ALREADY_DELETED);
    }
    this.props.deletedAt = new Date();
    this.props.updatedAt = new Date();
    return Result.ok();
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private static validateKey(key: string): GrammarRuleDomainError | null {
    if (key.length === 0 || key.length > KEY_MAX_LENGTH) {
      return GrammarRuleDomainError.INVALID_ATOM_KEY;
    }
    if (!KEY_PATTERN.test(key)) {
      return GrammarRuleDomainError.INVALID_ATOM_KEY;
    }
    return null;
  }

  private static validateTitle(title: string): GrammarRuleDomainError | null {
    if (title.length === 0 || title.length > TITLE_MAX_LENGTH) {
      return GrammarRuleDomainError.INVALID_ATOM_DATA;
    }
    return null;
  }

  private static normaliseDescription(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}
