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

/**
 * How a single item of the draft differs from the live version, for a badge on
 * its own row. `pending_changes` says a release is outstanding; this says where.
 *
 * - `added`          — the live version does not place this item at all
 * - `moved`          — placed live, but in another section or another order
 * - `flags_changed`  — same place, different `isRequired`
 * - `content_changed` — placed identically, but the item itself holds an edit
 *                       students have not been shown yet
 *
 * Items the draft *dropped* have no row to carry a marker and are reported
 * separately by the caller that needs them — not here.
 */
export type ItemPendingChange = 'added' | 'moved' | 'flags_changed' | 'content_changed';

export interface ContainerPublishStateDetail {
  state: ContainerPublishState;
  /**
   * Keyed by the referenced content id (`container_items.item_id`), because that
   * is what survives across versions — the row id does not. Empty unless the
   * container is in `pending_changes`.
   */
  changeByItemId: Map<string, ItemPendingChange>;
}

interface ItemRow {
  containerVersionId: string;
  position: number;
  itemType: string;
  itemId: string;
  isRequired: boolean;
  sectionId: string | null;
}

/** Section grouping compared by title: every version owns its own section rows. */
function sectionKeyOf(item: ItemRow, sectionTitleById: Map<string, string>): string {
  if (item.sectionId === null) return '';
  return sectionTitleById.get(item.sectionId) ?? item.sectionId;
}

function itemKeyOf(item: ItemRow): string {
  return `${item.itemType}:${item.itemId}`;
}

/**
 * Keys of `draft` that cannot stay put if `published` is transformed into it —
 * everything outside a longest common subsequence.
 *
 * Comparing positions directly would be useless here: inserting one item at the
 * top shifts every position below it, and marking the whole module "moved"
 * tells the author nothing. The LCS marks the smallest set of rows that
 * actually changed order.
 */
function reorderedKeys(published: string[], draft: string[]): Set<string> {
  const rows = published.length;
  const cols = draft.length;

  // lengths[i][j] — LCS of published[i..] and draft[j..].
  const lengths: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(cols + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lengths[i][j] =
        published[i] === draft[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const stable = new Set<string>();
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (published[i] === draft[j]) {
      stable.add(draft[j]);
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  return new Set(draft.filter((key) => !stable.has(key)));
}

@Injectable()
export class PublishStateReader {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves the publish state of every given container. Unknown ids are omitted. */
  async resolve(containerIds: string[]): Promise<Map<string, ContainerPublishState>> {
    const detailed = await this.resolveDetailed(containerIds);
    return new Map([...detailed].map(([id, detail]) => [id, detail.state]));
  }

  /**
   * The same states, plus the per-item breakdown behind `pending_changes`.
   * One pass over the database for both — callers that need the breakdown
   * should not pay for a second round of the same queries.
   */
  async resolveDetailed(containerIds: string[]): Promise<Map<string, ContainerPublishStateDetail>> {
    const ids = [...new Set(containerIds)];
    const details = new Map<string, ContainerPublishStateDetail>();
    if (ids.length === 0) return details;

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

    // The version an author is editing: the draft when there is one, otherwise the
    // published version itself. Exercises are edited through it either way, and an
    // exercise edit needs no draft version to exist — it never touches composition.
    const authoringVersionId = new Map(
      containers
        .map((c) => [c.id, draftIdByContainerId.get(c.id) ?? c.currentPublishedVersionId] as const)
        .filter((pair): pair is readonly [string, string] => pair[1] !== null),
    );

    const { itemsByVersionId, sectionTitleById } = await this.loadVersions([
      ...toCompare.flatMap((c) => [c.publishedVersionId, c.draftVersionId]),
      ...authoringVersionId.values(),
    ]);

    const editedExerciseIds = await this.exercisesWithUnreleasedEdits(
      [...authoringVersionId.values()].flatMap((versionId) =>
        (itemsByVersionId.get(versionId) ?? [])
          .filter((i) => i.itemType === 'EXERCISE')
          .map((i) => i.itemId),
      ),
    );

    const signatureOf = (versionId: string) =>
      this.compositionSignature(itemsByVersionId.get(versionId) ?? [], sectionTitleById);

    for (const c of containers) {
      if (c.currentPublishedVersionId === null) {
        details.set(c.id, { state: 'draft', changeByItemId: new Map() });
        continue;
      }

      const pair = toCompare.find((p) => p.containerId === c.id);
      // Not the same question as "does any row carry a marker": a row the draft
      // *dropped* is a pending change with no row left to mark, so composition is
      // judged by the signature and the markers are only the explanation.
      const compositionDiffers =
        pair !== undefined &&
        signatureOf(pair.publishedVersionId) !== signatureOf(pair.draftVersionId);

      const changeByItemId =
        pair && compositionDiffers
          ? this.diffItems(
              itemsByVersionId.get(pair.publishedVersionId) ?? [],
              itemsByVersionId.get(pair.draftVersionId) ?? [],
              sectionTitleById,
            )
          : new Map<string, ItemPendingChange>();

      // An edited exercise is a pending change even when the composition is
      // untouched — which is the usual case, since editing one moves nothing.
      // Reported per row so the author reviews that exercise instead of all of them.
      const versionId = authoringVersionId.get(c.id);
      for (const item of itemsByVersionId.get(versionId ?? '') ?? []) {
        if (!changeByItemId.has(item.itemId) && editedExerciseIds.has(item.itemId)) {
          changeByItemId.set(item.itemId, 'content_changed');
        }
      }

      details.set(c.id, {
        state: compositionDiffers || changeByItemId.size > 0 ? 'pending_changes' : 'published',
        changeByItemId,
      });
    }

    return details;
  }

  /** Of the given exercises, the ones holding an edit students have not been shown. */
  private async exercisesWithUnreleasedEdits(exerciseIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(exerciseIds)];
    if (ids.length === 0) return new Set();

    const rows = await this.prisma.exercise.findMany({
      where: { id: { in: ids }, draftUpdatedAt: { not: null } },
      select: { id: true },
    });

    return new Set(rows.map((r) => r.id));
  }

  /**
   * What changed about each item the draft still places, against the live version.
   *
   * A ref placed twice in one version is compared against the first live
   * placement of the same ref — the schema allows the repeat, nothing in the
   * authoring UI produces it, and guessing a pairing would be worse than this.
   */
  private diffItems(
    publishedItems: ItemRow[],
    draftItems: ItemRow[],
    sectionTitleById: Map<string, string>,
  ): Map<string, ItemPendingChange> {
    const changes = new Map<string, ItemPendingChange>();

    const publishedByKey = new Map<string, ItemRow>();
    for (const item of [...publishedItems].sort((a, b) => a.position - b.position)) {
      const key = itemKeyOf(item);
      if (!publishedByKey.has(key)) publishedByKey.set(key, item);
    }

    const draftOrdered = [...draftItems].sort((a, b) => a.position - b.position);

    // Candidates for a pure reorder: placed in both versions, in the same
    // section, with the same flags. Anything else already has a verdict.
    const stayed: ItemRow[] = [];
    for (const item of draftOrdered) {
      const live = publishedByKey.get(itemKeyOf(item));
      if (!live) {
        changes.set(item.itemId, 'added');
      } else if (sectionKeyOf(live, sectionTitleById) !== sectionKeyOf(item, sectionTitleById)) {
        changes.set(item.itemId, 'moved');
      } else if (live.isRequired !== item.isRequired) {
        changes.set(item.itemId, 'flags_changed');
      } else {
        stayed.push(item);
      }
    }

    const stayedKeys = new Set(stayed.map(itemKeyOf));
    const sectionKeys = new Set(stayed.map((i) => sectionKeyOf(i, sectionTitleById)));

    for (const sectionKey of sectionKeys) {
      const draftSequence = stayed
        .filter((i) => sectionKeyOf(i, sectionTitleById) === sectionKey)
        .map(itemKeyOf);
      const publishedSequence = [...publishedItems]
        .sort((a, b) => a.position - b.position)
        .filter(
          (i) => sectionKeyOf(i, sectionTitleById) === sectionKey && stayedKeys.has(itemKeyOf(i)),
        )
        .map(itemKeyOf);

      const moved = reorderedKeys(publishedSequence, draftSequence);
      for (const item of stayed) {
        if (moved.has(itemKeyOf(item))) changes.set(item.itemId, 'moved');
      }
    }

    return changes;
  }

  /** Items and section titles of the given versions, in one round-trip each. */
  private async loadVersions(versionIds: string[]): Promise<{
    itemsByVersionId: Map<string, ItemRow[]>;
    sectionTitleById: Map<string, string>;
  }> {
    const itemsByVersionId = new Map<string, ItemRow[]>();
    const sectionTitleById = new Map<string, string>();
    if (versionIds.length === 0) return { itemsByVersionId, sectionTitleById };

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

    for (const section of sections) sectionTitleById.set(section.id, section.title);
    for (const item of items) {
      const bucket = itemsByVersionId.get(item.containerVersionId) ?? [];
      bucket.push(item);
      itemsByVersionId.set(item.containerVersionId, bucket);
    }

    return { itemsByVersionId, sectionTitleById };
  }

  /**
   * One comparable string per version. Sections are keyed by title rather than
   * id because every version owns its own `container_sections` rows — the ids
   * differ even when the grouping is identical.
   */
  private compositionSignature(items: ItemRow[], sectionTitleById: Map<string, string>): string {
    return items
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) =>
        [
          i.position,
          i.itemType,
          i.itemId,
          i.isRequired ? '1' : '0',
          sectionKeyOf(i, sectionTitleById),
        ].join('|'),
      )
      .join('\n');
  }
}
