import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';

interface ContainerSectionProps {
  containerVersionId: string;
  title: string;
  position: number;
  createdAt: Date;
}

export interface CreateContainerSectionProps {
  containerVersionId: string;
  title: string;
  position: number;
}

export class ContainerSectionEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: ContainerSectionProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get containerVersionId(): string {
    return this.props.containerVersionId;
  }
  get title(): string {
    return this.props.title;
  }
  get position(): number {
    return this.props.position;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(p: CreateContainerSectionProps, id?: string): ContainerSectionEntity {
    return new ContainerSectionEntity(id ?? randomUUID(), {
      containerVersionId: p.containerVersionId,
      title: p.title,
      position: p.position,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: string, props: ContainerSectionProps): ContainerSectionEntity {
    return new ContainerSectionEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  rename(title: string): void {
    this.props.title = title;
  }

  reposition(position: number): void {
    this.props.position = position;
  }
}
