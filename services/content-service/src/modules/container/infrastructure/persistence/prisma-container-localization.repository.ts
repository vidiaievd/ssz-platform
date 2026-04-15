import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { IContainerLocalizationRepository } from '../../domain/repositories/container-localization.repository.interface.js';
import { ContainerLocalizationEntity } from '../../domain/entities/container-localization.entity.js';
import { ContainerLocalizationMapper } from './mappers/container-localization.mapper.js';

@Injectable()
export class PrismaContainerLocalizationRepository implements IContainerLocalizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ContainerLocalizationEntity | null> {
    const raw = await this.prisma.containerLocalization.findUnique({ where: { id } });
    return raw ? ContainerLocalizationMapper.toDomain(raw) : null;
  }

  async findByContainerId(containerId: string): Promise<ContainerLocalizationEntity[]> {
    const rows = await this.prisma.containerLocalization.findMany({
      where: { containerId },
      orderBy: { languageCode: 'asc' },
    });
    return rows.map((row) => ContainerLocalizationMapper.toDomain(row));
  }

  async findByContainerAndLanguage(
    containerId: string,
    languageCode: string,
  ): Promise<ContainerLocalizationEntity | null> {
    const raw = await this.prisma.containerLocalization.findUnique({
      where: { containerId_languageCode: { containerId, languageCode } },
    });
    return raw ? ContainerLocalizationMapper.toDomain(raw) : null;
  }

  async save(entity: ContainerLocalizationEntity): Promise<ContainerLocalizationEntity> {
    const exists = await this.prisma.containerLocalization.findUnique({
      where: { id: entity.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.containerLocalization.update({
          where: { id: entity.id },
          data: ContainerLocalizationMapper.toUpdateData(entity),
        })
      : await this.prisma.containerLocalization.create({
          data: ContainerLocalizationMapper.toCreateData(entity),
        });

    return ContainerLocalizationMapper.toDomain(raw);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.containerLocalization.delete({ where: { id } });
  }
}
