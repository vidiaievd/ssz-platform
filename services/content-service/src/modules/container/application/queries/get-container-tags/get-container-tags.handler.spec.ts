import { GetContainerTagsHandler } from './get-container-tags.handler.js';
import { GetContainerTagsQuery } from './get-container-tags.query.js';
import type { IContainerTagReader } from '../../ports/container-tag-reader.port.js';

describe('GetContainerTagsHandler', () => {
  it('asks the reader once for every container of the page', async () => {
    const tags = new Map([
      ['c1', [{ id: 't1', name: 'Speaking', category: 'skill' as const }]],
      ['c2', []],
    ]);
    const forContainers = jest.fn().mockResolvedValue(tags);
    const reader: IContainerTagReader = { forContainers };

    const result = await new GetContainerTagsHandler(reader).execute(
      new GetContainerTagsQuery(['c1', 'c2']),
    );

    expect(forContainers).toHaveBeenCalledTimes(1);
    expect(forContainers).toHaveBeenCalledWith(['c1', 'c2']);
    expect(result).toBe(tags);
  });
});
