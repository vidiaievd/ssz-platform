import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  IAssignmentRepository,
  FindByAssigneeOptions,
  FindByAssignerOptions,
} from '../../domain/repositories/assignment.repository.interface.js';
import { Assignment } from '../../domain/entities/assignment.entity.js';
import { AssignmentMapper } from './assignment.mapper.js';

@Injectable()
export class PrismaAssignmentRepository implements IAssignmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Assignment | null> {
    const row = await this.prisma.assignment.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? AssignmentMapper.toDomain(row) : null;
  }

  async findByAssignee(
    assigneeId: string,
    options: FindByAssigneeOptions = {},
  ): Promise<Assignment[]> {
    const rows = await this.prisma.assignment.findMany({
      where: {
        assigneeId,
        deletedAt: null,
        ...(options.status?.length ? { status: { in: options.status } } : {}),
      },
      orderBy: { dueAt: 'asc' },
      skip: options.offset,
      take: options.limit,
    });
    return rows.map(AssignmentMapper.toDomain);
  }

  async findByAssigner(
    assignerId: string,
    options: FindByAssignerOptions = {},
  ): Promise<Assignment[]> {
    const rows = await this.prisma.assignment.findMany({
      where: {
        assignerId,
        deletedAt: null,
        ...(options.status?.length ? { status: { in: options.status } } : {}),
        ...(options.assigneeId ? { assigneeId: options.assigneeId } : {}),
      },
      orderBy: { assignedAt: 'desc' },
      skip: options.offset,
      take: options.limit,
    });
    return rows.map(AssignmentMapper.toDomain);
  }

  async findOverdueCandidates(now: Date): Promise<Assignment[]> {
    const rows = await this.prisma.assignment.findMany({
      where: {
        status: 'ACTIVE',
        dueAt: { lt: now },
        deletedAt: null,
      },
    });
    return rows.map(AssignmentMapper.toDomain);
  }

  async save(assignment: Assignment): Promise<void> {
    const data = AssignmentMapper.toPersistence(assignment);
    await this.prisma.assignment.upsert({
      where: { id: data.id },
      create: data,
      update: data,
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.assignment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
