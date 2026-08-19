import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetExercisePlacementQuery } from './get-exercise-placement.query.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';

// Prisma's ContainerItemType/ContainerType enums store the member NAME
// ('EXERCISE', 'MODULE'), not the @map value — comparisons below use the raw
// uppercase strings, matching the sibling internal handlers in this module.

/**
 * How many placements of one exercise are worth walking.
 *
 * An exercise reused across a dozen courses is authoring gone wrong, not a case to
 * support: the answer is one path for a teacher to read, and walking every placement to
 * pick it would cost a query per placement on the learner's first request.
 */
const MAX_PLACEMENTS = 8;

/** How long an exercise's name may be before the queue row starts wrapping. */
const TITLE_MAX = 120;

export interface ExercisePlacementResult {
  containerId: string;
  containerTitle: string;
  moduleId: string | null;
  moduleTitle: string | null;
  exerciseTitle: string | null;
  ownerSchoolId: string | null;
}

interface ContainerRow {
  id: string;
  title: string;
  containerType: string;
  ownerSchoolId: string | null;
}

/** One placement, walked to the top: the course it ends at and the module it started in. */
interface PlacementChain {
  root: ContainerRow;
  moduleId: string | null;
  moduleTitle: string | null;
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
      select: {
        template: { select: { name: true } },
        instructions: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 1,
          select: { instructionText: true, draftInstructionText: true },
        },
      },
    });
    if (!exercise) throw new NotFoundException(`Exercise ${query.exerciseId} not found`);

    const placements = await this.prisma.containerItem.findMany({
      where: { itemType: 'EXERCISE', itemId: query.exerciseId },
      orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
      take: MAX_PLACEMENTS,
      select: { containerVersion: { select: { containerId: true } } },
    });
    if (placements.length === 0) {
      throw new NotFoundException(`Exercise ${query.exerciseId} is not placed`);
    }

    // The placement that leads to a course wins, whichever was made first.
    //
    // An exercise can sit in more than one container, and a module that was taken out of
    // its course still holds everything that was in it — a shape any restructuring leaves
    // behind. Taking the oldest placement then answers with an orphan: the queue groups
    // submissions under a course nobody is teaching, and the course filter cannot find
    // them. So every placement is walked and the first one that reaches a course is the
    // answer; a chain that reaches nothing is kept only in case none of them does.
    let fallback: PlacementChain | null = null;
    let chosen: PlacementChain | null = null;
    for (const placement of placements) {
      const chain = await this.climb(placement.containerVersion.containerId);
      if (chain === null) continue;
      if (chain.root.containerType === 'COURSE') {
        chosen = chain;
        break;
      }
      fallback ??= chain;
    }

    const chain = chosen ?? fallback;
    if (chain === null) throw new NotFoundException(`Exercise ${query.exerciseId} is not placed`);

    return {
      containerId: chain.root.id,
      containerTitle: chain.root.title,
      moduleId: chain.moduleId,
      moduleTitle: chain.moduleTitle,
      exerciseTitle: this.titleOf(exercise),
      ownerSchoolId: chain.root.ownerSchoolId,
    };
  }

  /**
   * From the container holding the exercise up to the one nothing holds.
   *
   * Climbs ContainerItem(itemType=CONTAINER, itemId=currentId) until no parent placement
   * is found — that is the top of this chain. Guarded against cycles by tracking visited
   * ids; a course placed inside its own module is impossible through the editor and
   * fatal here without the guard.
   */
  private async climb(startId: string): Promise<PlacementChain | null> {
    let current = await this.container(startId);
    if (current === null) return null;

    const moduleId = current.containerType === 'MODULE' ? current.id : null;
    const moduleTitle = current.containerType === 'MODULE' ? current.title : null;

    const visited = new Set<string>([current.id]);
    for (;;) {
      const parentItem = await this.prisma.containerItem.findFirst({
        where: { itemType: 'CONTAINER', itemId: current.id },
        orderBy: [{ addedAt: 'asc' }, { id: 'asc' }],
        select: { containerVersion: { select: { containerId: true } } },
      });
      if (!parentItem) break;

      const parentId = parentItem.containerVersion.containerId;
      if (visited.has(parentId)) break;
      visited.add(parentId);

      const parent = await this.container(parentId);
      if (parent === null) break;
      current = parent;
    }

    return { root: current, moduleId, moduleTitle };
  }

  private async container(id: string): Promise<ContainerRow | null> {
    return this.prisma.container.findUnique({
      where: { id },
      select: { id: true, title: true, containerType: true, ownerSchoolId: true },
    });
  }

  /**
   * What to call this exercise on a screen that lists many of them.
   *
   * The instruction, not the template's name. An exercise carries no title of its own, and
   * the template's name is the same six words for every translate exercise in the school —
   * a queue grouped by exercise then shows five groups called "Translate to Target
   * Language". The instruction is what the author actually wrote about *this* task, and
   * the first line of it is a name; the template's name stays as the fallback for an
   * exercise that has no instruction yet.
   */
  private titleOf(exercise: {
    template: { name: string | null };
    instructions: { instructionText: string | null; draftInstructionText: string | null }[];
  }): string | null {
    const instruction = exercise.instructions[0];
    const text = instruction?.instructionText?.trim() || instruction?.draftInstructionText?.trim();
    if (!text) return exercise.template.name ?? null;

    const line = text.split('\n')[0]!.replace(/\s+/g, ' ').trim();
    if (line === '') return exercise.template.name ?? null;

    return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
  }
}
