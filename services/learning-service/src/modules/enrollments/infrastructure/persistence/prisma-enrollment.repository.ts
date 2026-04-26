import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  IEnrollmentRepository,
  FindByUserOptions,
} from '../../domain/repositories/enrollment.repository.interface.js';
import { Enrollment } from '../../domain/entities/enrollment.entity.js';
import { EnrollmentMapper } from './enrollment.mapper.js';

@Injectable()
export class PrismaEnrollmentRepository implements IEnrollmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Enrollment | null> {
    const row = await this.prisma.enrollment.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? EnrollmentMapper.toDomain(row) : null;
  }

  async findByUserAndContainer(userId: string, containerId: string): Promise<Enrollment | null> {
    const row = await this.prisma.enrollment.findFirst({
      where: { userId, containerId, deletedAt: null },
    });
    return row ? EnrollmentMapper.toDomain(row) : null;
  }

  async findByUser(userId: string, options: FindByUserOptions = {}): Promise<Enrollment[]> {
    const rows = await this.prisma.enrollment.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(options.status?.length ? { status: { in: options.status } } : {}),
      },
      orderBy: { enrolledAt: 'desc' },
      skip: options.offset,
      take: options.limit,
    });
    return rows.map(EnrollmentMapper.toDomain);
  }

  async save(enrollment: Enrollment): Promise<void> {
    const data = EnrollmentMapper.toPersistence(enrollment);
    await this.prisma.enrollment.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.enrollment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
