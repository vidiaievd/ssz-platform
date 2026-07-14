import { randomUUID } from 'crypto';
import { Entity } from '../../../../shared/domain/entity.base.js';
import { ContainerItemType } from '../value-objects/item-type.vo.js';

interface ContainerItemProps {
  containerVersionId: string;
  position: number;
  itemType: ContainerItemType;
  itemId: string;
  isRequired: boolean;
  sectionId: string | null;
  // Deprecated free-text fallback, kept for one release. Prefer sectionId.
  sectionLabel: string | null;
  // XP awarded to the student on completion. Authored per-item via the inspector;
  // consumed by learning-service progress.
  xpReward: number | null;
  addedAt: Date;
}

export interface CreateContainerItemProps {
  containerVersionId: string;
  position: number;
  itemType: ContainerItemType;
  itemId: string;
  isRequired?: boolean;
  sectionId?: string;
  sectionLabel?: string;
  xpReward?: number | null;
}

export interface UpdateContainerItemProps {
  isRequired?: boolean;
  sectionId?: string | null;
  sectionLabel?: string | null;
  xpReward?: number | null;
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
  get sectionId(): string | null {
    return this.props.sectionId;
  }
  get sectionLabel(): string | null {
    return this.props.sectionLabel;
  }
  get xpReward(): number | null {
    return this.props.xpReward;
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
      sectionId: p.sectionId ?? null,
      sectionLabel: p.sectionLabel ?? null,
      xpReward: p.xpReward ?? null,
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
    if ('sectionId' in changes) {
      this.props.sectionId = changes.sectionId ?? null;
    }
    if ('sectionLabel' in changes) {
      this.props.sectionLabel = changes.sectionLabel ?? null;
    }
    // Explicit undefined check (not `'in' changes`, unlike sectionId/sectionLabel
    // above): xpReward is set once and must survive unrelated partial updates —
    // omitting the field means "no change", only an explicit null clears it.
    if (changes.xpReward !== undefined) {
      this.props.xpReward = changes.xpReward;
    }
  }
}
