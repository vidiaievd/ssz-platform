import {
  mutatingRoutes,
  unguardedRoutes,
} from '../../../../shared/access-control/presentation/testing/route-access.js';
import { ExerciseController } from './exercise.controller.js';

describe('exercise write routes', () => {
  it('every mutating route declares an access requirement', () => {
    // `create` is exempt: there is no exercise to authorize against yet.
    expect(unguardedRoutes(ExerciseController, ['create'])).toEqual([]);
  });

  it('finds the routes it claims to check', () => {
    expect(mutatingRoutes(ExerciseController)).toEqual(
      expect.arrayContaining(['update', 'remove']),
    );
  });
});
