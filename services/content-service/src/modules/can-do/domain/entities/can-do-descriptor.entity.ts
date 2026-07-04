import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import type { CanDoSkill } from '../value-objects/can-do-skill.vo.js';
import { CanDoScope } from '../value-objects/can-do-scope.vo.js';
import { CanDoDomainError } from '../exceptions/can-do-domain.exceptions.js';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface CanDoLocalization {
  language: string;
  text: string;
}

interface DescriptorProps {
  cefrLevel: CefrLevel;
  skill: CanDoSkill;
  scope: CanDoScope;
  ownerSchoolId: string | null;
  source: string | null;
  localizations: CanDoLocalization[];
  createdAt: Date;
  deletedAt: Date | null;
  createdByUserId: string;
}

export interface CreateCanDoDescriptorProps {
  cefrLevel: CefrLevel;
  skill: CanDoSkill;
  scope: CanDoScope;
  ownerSchoolId?: string;
  source?: string;
  localizations: CanDoLocalization[];
  createdByUserId: string;
}

export class CanDoDescriptorEntity extends AggregateRoot {
  private constructor(
    id: string,
    private props: DescriptorProps,
  ) {
    super(id);
  }

  get cefrLevel(): CefrLevel   { return this.props.cefrLevel; }
  get skill(): CanDoSkill       { return this.props.skill; }
  get scope(): CanDoScope       { return this.props.scope; }
  get ownerSchoolId(): string | null { return this.props.ownerSchoolId; }
  get source(): string | null   { return this.props.source; }
  get localizations(): CanDoLocalization[] { return this.props.localizations; }
  get createdAt(): Date         { return this.props.createdAt; }
  get deletedAt(): Date | null  { return this.props.deletedAt; }
  get createdByUserId(): string { return this.props.createdByUserId; }

  static create(
    p: CreateCanDoDescriptorProps,
    id?: string,
  ): Result<CanDoDescriptorEntity, CanDoDomainError> {
    if (p.scope === CanDoScope.GLOBAL && p.ownerSchoolId) {
      return Result.fail(CanDoDomainError.GLOBAL_DESCRIPTOR_REQUIRES_NO_SCHOOL);
    }
    if (p.scope === CanDoScope.SCHOOL && !p.ownerSchoolId) {
      return Result.fail(CanDoDomainError.SCHOOL_DESCRIPTOR_REQUIRES_SCHOOL);
    }

    return Result.ok(
      new CanDoDescriptorEntity(id ?? randomUUID(), {
        cefrLevel: p.cefrLevel,
        skill: p.skill,
        scope: p.scope,
        ownerSchoolId: p.ownerSchoolId ?? null,
        source: p.source ?? null,
        localizations: p.localizations,
        createdAt: new Date(),
        deletedAt: null,
        createdByUserId: p.createdByUserId,
      }),
    );
  }

  static reconstitute(id: string, props: DescriptorProps): CanDoDescriptorEntity {
    return new CanDoDescriptorEntity(id, props);
  }

  upsertLocalization(language: string, text: string): void {
    const idx = this.props.localizations.findIndex((l) => l.language === language);
    if (idx >= 0) {
      this.props.localizations[idx] = { language, text };
    } else {
      this.props.localizations.push({ language, text });
    }
  }

  softDelete(): Result<void, CanDoDomainError> {
    if (this.props.deletedAt !== null) {
      return Result.fail(CanDoDomainError.DESCRIPTOR_ALREADY_DELETED);
    }
    this.props.deletedAt = new Date();
    return Result.ok();
  }
}
