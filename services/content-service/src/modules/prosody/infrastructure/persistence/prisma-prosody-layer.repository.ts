import { Injectable } from '@nestjs/common';
import type { ProsodyLayer } from '@ssz/shared-kernel/prosody';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  IProsodyLayerRepository,
  StoredProsody,
} from '../../domain/repositories/prosody-layer.repository.interface.js';
import type { ProsodyOwner } from '../../domain/prosody-owner.js';

interface Row {
  sourceText: string;
  layer: unknown;
  updatedAt: Date;
}

// The layer column holds what `save` wrote — a kernel `ProsodyLayer`, checked by the
// command before it got here — so it is read back without re-validation.
const toStored = (row: Row): StoredProsody => ({
  sourceText: row.sourceText,
  layer: row.layer as ProsodyLayer,
  updatedAt: row.updatedAt,
});

@Injectable()
export class PrismaProsodyLayerRepository implements IProsodyLayerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async find(owner: ProsodyOwner): Promise<StoredProsody | null> {
    const row =
      owner.kind === 'lesson'
        ? await this.prisma.lessonProsodyLayer.findUnique({
            where: { lessonContentVariantId: owner.variantId },
          })
        : await this.prisma.exerciseProsodyLayer.findUnique({
            where: {
              exerciseId_promptId: { exerciseId: owner.exerciseId, promptId: owner.promptId },
            },
          });
    return row ? toStored(row) : null;
  }

  async findForExercise(exerciseId: string): Promise<Map<string, StoredProsody>> {
    const rows = await this.prisma.exerciseProsodyLayer.findMany({ where: { exerciseId } });
    return new Map(rows.map((row) => [row.promptId, toStored(row)]));
  }

  async save(
    owner: ProsodyOwner,
    value: { sourceText: string; layer: ProsodyLayer },
    userId: string,
  ): Promise<StoredProsody> {
    const data = {
      sourceText: value.sourceText,
      layer: value.layer as unknown as object,
      updatedByUserId: userId,
    };
    const row =
      owner.kind === 'lesson'
        ? await this.prisma.lessonProsodyLayer.upsert({
            where: { lessonContentVariantId: owner.variantId },
            create: { lessonContentVariantId: owner.variantId, ...data },
            update: data,
          })
        : await this.prisma.exerciseProsodyLayer.upsert({
            where: {
              exerciseId_promptId: { exerciseId: owner.exerciseId, promptId: owner.promptId },
            },
            create: { exerciseId: owner.exerciseId, promptId: owner.promptId, ...data },
            update: data,
          });
    return toStored(row);
  }

  async remove(owner: ProsodyOwner): Promise<void> {
    if (owner.kind === 'lesson') {
      await this.prisma.lessonProsodyLayer.deleteMany({
        where: { lessonContentVariantId: owner.variantId },
      });
    } else {
      await this.prisma.exerciseProsodyLayer.deleteMany({
        where: { exerciseId: owner.exerciseId, promptId: owner.promptId },
      });
    }
  }
}
