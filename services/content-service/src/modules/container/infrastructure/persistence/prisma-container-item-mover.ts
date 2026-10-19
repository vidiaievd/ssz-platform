import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  IContainerItemMover,
  MoveRowInput,
  MovedRow,
} from '../../application/ports/container-item-mover.port.js';

@Injectable()
export class PrismaContainerItemMover implements IContainerItemMover {
  constructor(private readonly prisma: PrismaService) {}

  async moveRow(input: MoveRowInput): Promise<MovedRow | null> {
    return this.prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: the handler's read may be stale by now.
      const row = await tx.containerItem.findFirst({
        where: { id: input.rowId, containerVersionId: input.sourceVersionId },
      });
      if (!row) return null;

      await tx.containerItem.delete({ where: { id: row.id } });

      // Last in the version is last in its section: sections order their rows by
      // the version-wide position, the same rule an ordinary add follows.
      const last = await tx.containerItem.aggregate({
        where: { containerVersionId: input.targetVersionId },
        _max: { position: true },
      });
      const position = (last._max.position ?? -1) + 1;

      const moved = await tx.containerItem.create({
        data: {
          containerVersionId: input.targetVersionId,
          position,
          itemType: row.itemType,
          itemId: row.itemId,
          isRequired: row.isRequired,
          sectionId: input.targetSectionId,
          xpReward: row.xpReward,
        },
      });

      await tx.containerVersion.updateMany({
        where: { id: { in: [input.sourceVersionId, input.targetVersionId] } },
        data: { revisionCount: { increment: 1 } },
      });

      return { rowId: moved.id, position };
    });
  }
}
