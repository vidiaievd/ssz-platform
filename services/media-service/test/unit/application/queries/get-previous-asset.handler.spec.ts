import { GetAssetQuery } from '../../../../src/modules/assets/application/queries/get-asset/get-asset.query.js';
import { GetPreviousAssetHandler } from '../../../../src/modules/assets/application/queries/get-previous-asset/get-previous-asset.handler.js';
import { GetPreviousAssetQuery } from '../../../../src/modules/assets/application/queries/get-previous-asset/get-previous-asset.query.js';
import { Result } from '../../../../src/shared/kernel/result.js';

describe('GetPreviousAssetHandler (plan 74, D5)', () => {
  it('reads the replaced asset through GetAsset, with the requester’s rights', async () => {
    const repo = { findReplacedBy: jest.fn().mockResolvedValue({ id: 'old-1' }) };
    const view = Result.ok({ id: 'old-1' });
    const queryBus = { execute: jest.fn().mockResolvedValue(view) };
    const handler = new GetPreviousAssetHandler(repo as never, queryBus as never);

    const result = await handler.execute(new GetPreviousAssetQuery('new-1', 'teacher-2'));

    expect(repo.findReplacedBy).toHaveBeenCalledWith('new-1');
    const asked = queryBus.execute.mock.calls[0]![0] as GetAssetQuery;
    expect(asked).toBeInstanceOf(GetAssetQuery);
    expect(asked).toMatchObject({ assetId: 'old-1', requesterId: 'teacher-2' });
    expect(result).toBe(view);
  });

  it('reports nothing to go back to', async () => {
    const repo = { findReplacedBy: jest.fn().mockResolvedValue(null) };
    const queryBus = { execute: jest.fn() };
    const handler = new GetPreviousAssetHandler(repo as never, queryBus as never);

    expect((await handler.execute(new GetPreviousAssetQuery('new-1', 'u'))).error).toBe('ASSET_NOT_FOUND');
    expect(queryBus.execute).not.toHaveBeenCalled();
  });
});
