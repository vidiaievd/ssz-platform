import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';

/**
 * Publish state of a container as an author needs to see it.
 *
 * - `draft`            — never published, students see nothing
 * - `published`        — live, and the draft (if any) is composed identically
 * - `pending_changes`  — live, but the draft version differs from the live one
 *
 * `deriveContainerState` on the web side can only tell the first from the rest:
 * it looks at `currentPublishedVersionId` alone. Telling `published` from
 * `pending_changes` needs the two versions compared, which is what this does.
 *
 * Only **composition** is compared — which items a version holds, in which
 * order, in which section, required or not. Editing an item's own content
 * (`PATCH /exercises/:id` and friends) rewrites a row shared by every version
 * and reaches students immediately, so it is deliberately not a pending change.
 */
export type ContainerPublishState = 'draft' | 'published' | 'pending_changes';

interface ItemRow {
  containerVersionId: string;
  position: number;
  itemType: string;
  itemId: string;
  isRequired: boolean;
  sectionId: string | null;
}

@Injectable()
export class PublishStateReader {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves the publish state of every given container. Unknown ids are omitted. */
  async resolve(containerIds: string[]): Promise<Map<string, ContainerPublishState>> {
    const ids = [...new Set(containerIds)];
    const states = new Map<string, ContainerPublishState>();
    if (ids.length === 0) return states;

    const [containers, drafts] = await Promise.all([
      this.prisma.container.findMany({
        where: { id: { in: ids } },
        select: { id: true, currentPublishedVersionId: true },
      }),
      this.prisma.containerVersion.findMany({
        where: { containerId: { in: ids }, status: 'DRAFT' },
        select: { id: true, containerId: true, versionNumber: true },
        orderBy: { versionNumber: 'asc' },
      }),
    ]);

    // At most one draft per container in practice; keep the newest if that ever breaks.
    const draftIdByContainerId = new Map(drafts.map((d) => [d.containerId, d.id]));

    // Only containers that are published *and* have a draft need the comparison.
    const toCompare = containers
      .filter((c) => c.currentPublishedVersionId !== null && draftIdByContainerId.has(c.id))
      .map((c) => ({
        containerId: c.id,
        publishedVersionId: c.currentPublishedVersionId as string,
        draftVersionId: draftIdByContainerId.get(c.id) as string,
      }));

    const signatures = await this.compositionSignatures(
      toCompare.flatMap((c) => [c.publishedVersionId, c.draftVersionId]),
    );

    for (const c of containers) {
      if (c.currentPublishedVersionId === null) {
        states.set(c.id, 'draft');
        continue;
      }
      const pair = toCompare.find((p) => p.containerId === c.id);
      if (!pair) {
        states.set(c.id, 'published');
        continue;
      }
      const published = signatures.get(pair.publishedVersionId) ?? '';
      const draft = signatures.get(pair.draftVersionId) ?? '';
      states.set(c.id, published === draft ? 'published' : 'pending_changes');
    }

    return states;
  }

  /**
   * One comparable string per version. Sections are keyed by title rather than
   * id because every version owns its own `container_sections` rows — the ids
   * differ even when the grouping is identical.
   */
  private async compositionSignatures(versionIds: string[]): Promise<Map<string, string>> {
    const signatures = new Map<string, string>();
    if (versionIds.length === 0) return signatures;

    const [items, sections] = await Promise.all([
      this.prisma.containerItem.findMany({
        where: { containerVersionId: { in: versionIds } },
        select: {
          containerVersionId: true,
          position: true,
          itemType: true,
          itemId: true,
          isRequired: true,
          sectionId: true,
        },
      }),
      this.prisma.containerSection.findMany({
        where: { containerVersionId: { in: versionIds } },
        select: { id: true, title: true },
      }),
    ]);

    const sectionTitleById = new Map(sections.map((s) => [s.id, s.title]));

    const itemsByVersionId = new Map<string, ItemRow[]>();
    for (const item of items) {
      const bucket = itemsByVersionId.get(item.containerVersionId) ?? [];
      bucket.push(item);
      itemsByVersionId.set(item.containerVersionId, bucket);
    }

    for (const versionId of versionIds) {
      const bucket = itemsByVersionId.get(versionId) ?? [];
      const signature = bucket
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((i) =>
          [
            i.position,
            i.itemType,
            i.itemId,
            i.isRequired ? '1' : '0',
            i.sectionId === null ? '' : (sectionTitleById.get(i.sectionId) ?? i.sectionId),
          ].join('|'),
        )
        .join('\n');
      signatures.set(versionId, signature);
    }

    return signatures;
  }
}
