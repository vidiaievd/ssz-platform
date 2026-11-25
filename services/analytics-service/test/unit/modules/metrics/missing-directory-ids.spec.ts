import { missingDirectoryIds } from '../../../../src/modules/metrics/seed/missing-directory-ids.js';

describe('missingDirectoryIds', () => {
  it('keeps only referenced ids without a directory row', () => {
    const ids = missingDirectoryIds(['a', 'b', 'c'], ['b']);
    expect([...ids].sort()).toEqual(['a', 'c']);
  });

  it('drops nulls and repeats', () => {
    const ids = missingDirectoryIds(['a', null, 'a', null], []);
    expect([...ids]).toEqual(['a']);
  });

  it('is empty when every referenced course is known — a full directory is not refetched', () => {
    expect(missingDirectoryIds(['a', 'b'], ['a', 'b', 'z']).size).toBe(0);
  });
});
