import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';

interface ContainerLocalizationProps {
  containerId: string;
  languageCode: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string;
}

export interface CreateContainerLocalizationProps {
  containerId: string;
  languageCode: string;
  title: string;
  description?: string;
  createdByUserId: string;
}

export interface UpdateContainerLocalizationProps {
  title?: string;
  description?: string | null;
}

export class ContainerLocalizationEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: ContainerLocalizationProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get containerId(): string {
    return this.props.containerId;
  }
  get languageCode(): string {
    return this.props.languageCode;
  }
  get title(): string {
    return this.props.title;
  }
  get description(): string | null {
    return this.props.description;
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

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(p: CreateContainerLocalizationProps, id?: string): ContainerLocalizationEntity {
    const now = new Date();
    return new ContainerLocalizationEntity(id ?? randomUUID(), {
      containerId: p.containerId,
      languageCode: p.languageCode,
      title: p.title,
      description: p.description ?? null,
      createdAt: now,
      updatedAt: now,
      createdByUserId: p.createdByUserId,
    });
  }

  static reconstitute(id: string, props: ContainerLocalizationProps): ContainerLocalizationEntity {
    return new ContainerLocalizationEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  update(changes: UpdateContainerLocalizationProps): void {
    if (changes.title !== undefined) {
      this.props.title = changes.title;
    }
    if ('description' in changes) {
      this.props.description = changes.description ?? null;
    }
    this.props.updatedAt = new Date();
  }
}
