import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { VersionStatus } from '../value-objects/version-status.vo.js';
import { ContainerDomainError } from '../exceptions/container-domain.exceptions.js';

interface ContainerVersionProps {
  containerId: string;
  versionNumber: number;
  status: VersionStatus;
  changelog: string | null;
  createdAt: Date;
  createdByUserId: string;
  publishedAt: Date | null;
  publishedByUserId: string | null;
  deprecatedAt: Date | null;
  sunsetAt: Date | null;
  archivedAt: Date | null;
  revisionCount: number;
}

export interface CreateContainerVersionProps {
  containerId: string;
  versionNumber: number;
  createdByUserId: string;
  changelog?: string;
}

export class ContainerVersionEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: ContainerVersionProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get containerId(): string {
    return this.props.containerId;
  }
  get versionNumber(): number {
    return this.props.versionNumber;
  }
  get status(): VersionStatus {
    return this.props.status;
  }
  get changelog(): string | null {
    return this.props.changelog;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get createdByUserId(): string {
    return this.props.createdByUserId;
  }
  get publishedAt(): Date | null {
    return this.props.publishedAt;
  }
  get publishedByUserId(): string | null {
    return this.props.publishedByUserId;
  }
  get deprecatedAt(): Date | null {
    return this.props.deprecatedAt;
  }
  get sunsetAt(): Date | null {
    return this.props.sunsetAt;
  }
  get archivedAt(): Date | null {
    return this.props.archivedAt;
  }
  get revisionCount(): number {
    return this.props.revisionCount;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(p: CreateContainerVersionProps, id?: string): ContainerVersionEntity {
    return new ContainerVersionEntity(id ?? randomUUID(), {
      containerId: p.containerId,
      versionNumber: p.versionNumber,
      status: VersionStatus.DRAFT,
      changelog: p.changelog ?? null,
      createdAt: new Date(),
      createdByUserId: p.createdByUserId,
      publishedAt: null,
      publishedByUserId: null,
      deprecatedAt: null,
      sunsetAt: null,
      archivedAt: null,
      revisionCount: 0,
    });
  }

  static reconstitute(id: string, props: ContainerVersionProps): ContainerVersionEntity {
    return new ContainerVersionEntity(id, props);
  }

  // ── Lifecycle transitions ─────────────────────────────────────────────────

  publish(userId: string): Result<void, ContainerDomainError> {
    if (this.props.status !== VersionStatus.DRAFT) {
      return Result.fail(ContainerDomainError.VERSION_NOT_IN_DRAFT_STATUS);
    }

    this.props.status = VersionStatus.PUBLISHED;
    this.props.publishedAt = new Date();
    this.props.publishedByUserId = userId;

    return Result.ok();
  }

  deprecate(sunsetDays: number): Result<void, ContainerDomainError> {
    if (this.props.status !== VersionStatus.PUBLISHED) {
      return Result.fail(ContainerDomainError.VERSION_NOT_IN_PUBLISHED_STATUS);
    }

    const now = new Date();
    this.props.status = VersionStatus.DEPRECATED;
    this.props.deprecatedAt = now;
    this.props.sunsetAt = new Date(now.getTime() + sunsetDays * 24 * 60 * 60 * 1000);

    return Result.ok();
  }

  archive(): Result<void, ContainerDomainError> {
    if (this.props.status !== VersionStatus.DEPRECATED) {
      return Result.fail(ContainerDomainError.VERSION_NOT_IN_DEPRECATED_STATUS);
    }

    this.props.status = VersionStatus.ARCHIVED;
    this.props.archivedAt = new Date();

    return Result.ok();
  }

  cancelDraft(): Result<void, ContainerDomainError> {
    if (this.props.status !== VersionStatus.DRAFT) {
      return Result.fail(ContainerDomainError.VERSION_NOT_IN_DRAFT_STATUS);
    }

    return Result.ok();
  }

  incrementRevision(): void {
    this.props.revisionCount += 1;
  }
}
