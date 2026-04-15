import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { ContainerItemType } from '../value-objects/item-type.vo.js';

interface ContainerItemProps {
  containerVersionId: string;
  position: number;
  itemType: ContainerItemType;
  itemId: string;
  isRequired: boolean;
  sectionLabel: string | null;
  addedAt: Date;
}

export interface CreateContainerItemProps {
  containerVersionId: string;
  position: number;
  itemType: ContainerItemType;
  itemId: string;
  isRequired?: boolean;
  sectionLabel?: string;
}

export interface UpdateContainerItemProps {
  isRequired?: boolean;
  sectionLabel?: string | null;
}

export class ContainerItemEntity extends Entity<string> {
  private constructor(
    id: string,
    private props: ContainerItemProps,
  ) {
    super(id);
  }

  // ── Getters ──────────────────────────────────────────────────────────────

  get containerVersionId(): string {
    return this.props.containerVersionId;
  }
  get position(): number {
    return this.props.position;
  }
  get itemType(): ContainerItemType {
    return this.props.itemType;
  }
  get itemId(): string {
    return this.props.itemId;
  }
  get isRequired(): boolean {
    return this.props.isRequired;
  }
  get sectionLabel(): string | null {
    return this.props.sectionLabel;
  }
  get addedAt(): Date {
    return this.props.addedAt;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  static create(p: CreateContainerItemProps, id?: string): ContainerItemEntity {
    return new ContainerItemEntity(id ?? randomUUID(), {
      containerVersionId: p.containerVersionId,
      position: p.position,
      itemType: p.itemType,
      itemId: p.itemId,
      isRequired: p.isRequired ?? true,
      sectionLabel: p.sectionLabel ?? null,
      addedAt: new Date(),
    });
  }

  static reconstitute(id: string, props: ContainerItemProps): ContainerItemEntity {
    return new ContainerItemEntity(id, props);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  update(changes: UpdateContainerItemProps): void {
    if (changes.isRequired !== undefined) {
      this.props.isRequired = changes.isRequired;
    }
    if ('sectionLabel' in changes) {
      this.props.sectionLabel = changes.sectionLabel ?? null;
    }
  }
}
