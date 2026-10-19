jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetMediaInUseHandler } from './get-media-in-use.handler.js';
import { GetMediaInUseQuery } from './get-media-in-use.query.js';

type Rows = {
  bodies?: Array<{ mediaId: string }>;
  containers?: Array<{ coverImageMediaId: string | null }>;
  lessons?: Array<{ coverImageMediaId: string | null }>;
  lists?: Array<{ coverImageMediaId: string | null }>;
  words?: Array<{ pronunciationAudioMediaId: string | null }>;
  examples?: Array<{ audioMediaId: string | null }>;
};

function makeHandler(rows: Rows = {}) {
  const prisma = {
    lessonVariantMediaRef: { findMany: jest.fn().mockResolvedValue(rows.bodies ?? []) },
    container: { findMany: jest.fn().mockResolvedValue(rows.containers ?? []) },
    lesson: { findMany: jest.fn().mockResolvedValue(rows.lessons ?? []) },
    vocabularyList: { findMany: jest.fn().mockResolvedValue(rows.lists ?? []) },
    vocabularyItem: { findMany: jest.fn().mockResolvedValue(rows.words ?? []) },
    vocabularyUsageExample: { findMany: jest.fn().mockResolvedValue(rows.examples ?? []) },
  };
  return { handler: new GetMediaInUseHandler(prisma as never), prisma };
}

describe('GetMediaInUseHandler', () => {
  it('returns the ids some lesson variant still references, across every version', async () => {
    const { handler, prisma } = makeHandler({ bodies: [{ mediaId: 'a' }] });

    expect(await handler.execute(new GetMediaInUseQuery(['a', 'b']))).toEqual(['a']);
    // No filter on version or state: a draft and an old published version both count.
    expect(prisma.lessonVariantMediaRef.findMany).toHaveBeenCalledWith({
      where: { mediaId: { in: ['a', 'b'] } },
      select: { mediaId: true },
      distinct: ['mediaId'],
    });
  });

  it('counts covers and vocabulary audio as use, without a deletedAt filter (plan 76)', async () => {
    const { handler, prisma } = makeHandler({
      containers: [{ coverImageMediaId: 'c' }],
      lessons: [{ coverImageMediaId: 'l' }],
      lists: [{ coverImageMediaId: 'v' }],
      words: [{ pronunciationAudioMediaId: 'w' }],
      examples: [{ audioMediaId: 'e' }],
    });

    const named = await handler.execute(new GetMediaInUseQuery(['c', 'l', 'v', 'w', 'e', 'free']));

    expect(new Set(named)).toEqual(new Set(['c', 'l', 'v', 'w', 'e']));
    expect(prisma.lesson.findMany).toHaveBeenCalledWith({
      where: { coverImageMediaId: { in: ['c', 'l', 'v', 'w', 'e', 'free'] } },
      select: { coverImageMediaId: true },
    });
  });

  it('names an id once, however many places hold it', async () => {
    const { handler } = makeHandler({
      bodies: [{ mediaId: 'a' }],
      lessons: [{ coverImageMediaId: 'a' }],
    });

    expect(await handler.execute(new GetMediaInUseQuery(['a']))).toEqual(['a']);
  });

  it('does not query for an empty list', async () => {
    const { handler, prisma } = makeHandler();

    expect(await handler.execute(new GetMediaInUseQuery([]))).toEqual([]);
    expect(prisma.lessonVariantMediaRef.findMany).not.toHaveBeenCalled();
    expect(prisma.container.findMany).not.toHaveBeenCalled();
  });
});
