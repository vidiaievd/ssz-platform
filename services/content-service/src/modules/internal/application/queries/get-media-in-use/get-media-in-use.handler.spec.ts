jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { GetMediaInUseHandler } from './get-media-in-use.handler.js';
import { GetMediaInUseQuery } from './get-media-in-use.query.js';

function makeHandler(rows: Array<{ mediaId: string }>) {
  const prisma = { lessonVariantMediaRef: { findMany: jest.fn().mockResolvedValue(rows) } };
  return { handler: new GetMediaInUseHandler(prisma as never), prisma };
}

describe('GetMediaInUseHandler', () => {
  it('returns the ids some lesson variant still references, across every version', async () => {
    const { handler, prisma } = makeHandler([{ mediaId: 'a' }]);

    expect(await handler.execute(new GetMediaInUseQuery(['a', 'b']))).toEqual(['a']);
    // No filter on version or state: a draft and an old published version both count.
    expect(prisma.lessonVariantMediaRef.findMany).toHaveBeenCalledWith({
      where: { mediaId: { in: ['a', 'b'] } },
      select: { mediaId: true },
      distinct: ['mediaId'],
    });
  });

  it('does not query for an empty list', async () => {
    const { handler, prisma } = makeHandler([]);

    expect(await handler.execute(new GetMediaInUseQuery([]))).toEqual([]);
    expect(prisma.lessonVariantMediaRef.findMany).not.toHaveBeenCalled();
  });
});
