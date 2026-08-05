import {
  mutatingRoutes,
  unguardedRoutes,
} from '../../../../shared/access-control/presentation/testing/route-access.js';
import { LessonController } from './lesson.controller.js';

describe('lesson write routes', () => {
  it('every mutating route declares an access requirement', () => {
    // `createLesson` is exempt: there is no lesson to authorize against yet.
    expect(unguardedRoutes(LessonController, ['createLesson'])).toEqual([]);
  });

  it('finds the routes it claims to check', () => {
    expect(mutatingRoutes(LessonController)).toEqual(
      expect.arrayContaining(['updateLesson', 'publishVariant', 'createTextSpan']),
    );
  });
});
