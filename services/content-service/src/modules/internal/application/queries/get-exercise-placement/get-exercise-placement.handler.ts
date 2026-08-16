import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetExercisePlacementQuery } from './get-exercise-placement.query.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

// Prisma's ContainerItemType/ContainerType enums store the member NAME
// ('EXERCISE', 'MODULE'), not the @map value — comparisons below use the raw
// uppercase strings, matching the sibling internal handlers in this module.

export interface ExercisePlacementResult {
  containerId: string;
  containerTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
  exerciseTitle: string | null;
  ownerSchoolId: string | null;
}

@QueryHandler(GetExercisePlacementQuery)
export class GetExercisePlacementHandler implements IQueryHandler<
  GetExercisePlacementQuery,
  ExercisePlacementResult
> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetExercisePlacementQuery): Promise<ExercisePlacementResult> {
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: query.exerciseId },
      select: { template: { select: { name: true } } },
    });
    if (!exercise) throw new NotFoundException(`Exercise ${query.exerciseId} not found`);

    // Exercise may be placed in more than one container; the first placement
    // in insertion order is authoritative — the queue keys by exercise, not
    // by placement, so any deterministic choice is correct.
    const placement = await this.prisma.containerItem.findFirst({
      where: { itemType: 'EXERCISE', itemId: query.exerciseId },
      orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
      select: { containerVersion: { select: { containerId: true } } },
    });
    if (!placement) throw new NotFoundException(`Exercise ${query.exerciseId} is not placed`);

    let currentId = placement.containerVersion.containerId;
    let current = await this.prisma.container.findUnique({
      where: { id: currentId },
      select: { id: true, title: true, containerType: true, ownerSchoolId: true },
    });
    if (!current) throw new NotFoundException(`Exercise ${query.exerciseId} is not placed`);

    let moduleId: string | null = null;
    let moduleTitle: string | null = null;
    if (current.containerType === 'MODULE') {
      moduleId = current.id;
      moduleTitle = current.title;
    }

    // Climb ContainerItem(itemType=CONTAINER, itemId=currentId) until a
    // container with no parent placement is found — that is the top-level
    // course. Guarded against cycles by tracking visited ids.
    const visited = new Set<string>([currentId]);
    for (;;) {
      const parentItem = await this.prisma.containerItem.findFirst({
        where: { itemType: 'CONTAINER', itemId: currentId },
        orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
        select: { containerVersion: { select: { containerId: true } } },
      });
      if (!parentItem) break;

      const parentId = parentItem.containerVersion.containerId;
      if (visited.has(parentId)) break;
      visited.add(parentId);

      const parent = await this.prisma.container.findUnique({
        where: { id: parentId },
        select: { id: true, title: true, containerType: true, ownerSchoolId: true },
      });
      if (!parent) break;

      currentId = parentId;
      current = parent;
    }

    return {
      containerId: current.id,
      containerTitle: current.title,
      moduleId,
      moduleTitle,
      exerciseTitle: exercise.template.name ?? null,
      ownerSchoolId: current.ownerSchoolId,
    };
  }
}
