import type { CourseNarrationOptions } from './course-narration.types.js';

/** Narrate the text lessons of a course (plan 74, phase 4); handled by `CourseNarrationService`. */
export class NarrateCourseCommand {
  constructor(
    public readonly courseId: string,
    public readonly options: CourseNarrationOptions,
  ) {}
}
