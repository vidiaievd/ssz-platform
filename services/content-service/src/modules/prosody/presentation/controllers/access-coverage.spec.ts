import {
  mutatingRoutes,
  unguardedRoutes,
} from '../../../../shared/access-control/presentation/testing/route-access.js';
import { ProsodyController } from './prosody.controller.js';

describe('prosody write routes', () => {
  it('every mutating route declares an access requirement', () => {
    expect(unguardedRoutes(ProsodyController)).toEqual([]);
  });

  it('finds the routes it claims to check', () => {
    expect(mutatingRoutes(ProsodyController)).toEqual(
      expect.arrayContaining(['setLessonProsody', 'setExerciseProsody']),
    );
  });
});
