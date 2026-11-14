import { Injectable } from '@nestjs/common';
import { recordAdminAction } from '../../../../infrastructure/audit/record-admin-action.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  IRegistryWriter,
  ModelStatusState,
  ProviderSwitchState,
  RegistryAudit,
  RegistryWriteResult,
} from '../../application/ports/registry.writer.js';
import type { AiModel, AiModelStatus, AiProvider } from '../../domain/registry.types.js';
import { toModel, toProvider } from './registry.mapper.js';

@Injectable()
export class PrismaRegistryWriter implements IRegistryWriter {
  constructor(private readonly prisma: PrismaService) {}

  setProviderEnabled(
    providerId: string,
    enabled: boolean,
    audit: RegistryAudit<ProviderSwitchState>,
  ): Promise<RegistryWriteResult<AiProvider> | null> {
    return this.prisma.$transaction(async (tx) => {
      // Row lock: two admins flipping the same switch write one after the other, each trail
      // entry with the state the other left.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ai_providers WHERE id = ${providerId} FOR UPDATE`;
      if (locked.length === 0) return null;
      const current = await tx.aiProvider.findUniqueOrThrow({ where: { id: providerId } });
      if (current.enabled === enabled) return { value: toProvider(current), changed: false };
      const row = await tx.aiProvider.update({ where: { id: providerId }, data: { enabled } });
      await recordAdminAction(tx, audit({ code: current.code, enabled: current.enabled }));
      return { value: toProvider(row), changed: true };
    });
  }

  setModelStatus(
    modelId: string,
    status: AiModelStatus,
    audit: RegistryAudit<ModelStatusState>,
  ): Promise<RegistryWriteResult<AiModel> | null> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ai_models WHERE id = ${modelId} FOR UPDATE`;
      if (locked.length === 0) return null;
      const include = { provider: { select: { code: true } } } as const;
      const current = await tx.aiModel.findUniqueOrThrow({ where: { id: modelId }, include });
      if (current.status === status) return { value: toModel(current), changed: false };
      const row = await tx.aiModel.update({ where: { id: modelId }, data: { status }, include });
      await recordAdminAction(
        tx,
        audit({ providerCode: current.provider.code, providerModelId: current.providerModelId, status: current.status }),
      );
      return { value: toModel(row), changed: true };
    });
  }
}
