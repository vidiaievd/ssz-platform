import { shownTarget, unnamedActorIds, unresolvedTargetIds } from '../../../../src/modules/audit/queries/activity-targets.js';

const ID = '92e448e3-bc26-51c2-a240-754b04ac9c6b';

describe('activity targets', () => {
  it('asks only for rows that stored the course id as the target, each id once', () => {
    const rows = [
      { target: ID, targetId: ID },
      { target: ID, targetId: ID },
      { target: 'Norsk B1', targetId: 'b1' },
      { target: null, targetId: 'attempt-1' },
    ];
    expect(unresolvedTargetIds(rows)).toEqual([ID]);
  });

  it('replaces a stored id with the course title the directory has today', () => {
    expect(shownTarget({ target: ID, targetId: ID }, new Map([[ID, 'Norsk uttale']]))).toBe('Norsk uttale');
  });

  it('shows nothing rather than a raw id when the course is unknown', () => {
    expect(shownTarget({ target: ID, targetId: ID }, new Map())).toBeNull();
  });

  it('keeps a stored title and a missing target as they are', () => {
    expect(shownTarget({ target: 'Norsk B1', targetId: 'b1' }, new Map([['b1', 'Renamed']]))).toBe('Norsk B1');
    expect(shownTarget({ target: null, targetId: 'x' }, new Map())).toBeNull();
  });

  it('asks for an actor only when the row has an actor and no name', () => {
    const rows = [
      { actorName: null, actorId: 'owner' },
      { actorName: null, actorId: 'owner' },
      { actorName: 'student2', actorId: 's2' },
      { actorName: null, actorId: null },
    ];
    expect(unnamedActorIds(rows)).toEqual(['owner']);
  });
});
