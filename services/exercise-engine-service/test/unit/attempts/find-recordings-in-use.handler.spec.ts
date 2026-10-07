import { jest } from '@jest/globals';
import { FindRecordingsInUseHandler } from '../../../src/modules/attempts/application/queries/find-recordings-in-use/find-recordings-in-use.handler.js';
import { FindRecordingsInUseQuery } from '../../../src/modules/attempts/application/queries/find-recordings-in-use/find-recordings-in-use.query.js';

const SINCE = new Date('2026-09-07T00:00:00Z');

function makeHandler(held: string[]) {
  const attempts = { findRecordingsInUse: jest.fn(() => Promise.resolve(held)) };
  return { handler: new FindRecordingsInUseHandler(attempts as never), attempts };
}

describe('FindRecordingsInUseHandler (plan 71)', () => {
  it('does not bother the database with an empty question', async () => {
    const { handler, attempts } = makeHandler(['a']);

    expect(await handler.execute(new FindRecordingsInUseQuery([], SINCE))).toEqual({ inUse: [] });
    expect(attempts.findRecordingsInUse).not.toHaveBeenCalled();
  });

  it('asks each id once and passes the draft cut-off through', async () => {
    const { handler, attempts } = makeHandler(['a']);

    await handler.execute(new FindRecordingsInUseQuery(['a', 'b', 'a'], SINCE));

    expect(attempts.findRecordingsInUse).toHaveBeenCalledWith(['a', 'b'], SINCE);
  });

  it('answers with what was asked and held, each once', async () => {
    // A repository that returned a stranger or a repeat must not widen or double the answer.
    const { handler } = makeHandler(['a', 'a', 'stranger']);

    const result = await handler.execute(new FindRecordingsInUseQuery(['a', 'b'], SINCE));

    expect(result).toEqual({ inUse: ['a'] });
  });

  it('answers an empty list when nothing is held', async () => {
    const { handler } = makeHandler([]);

    expect(await handler.execute(new FindRecordingsInUseQuery(['a'], SINCE))).toEqual({ inUse: [] });
  });
});
