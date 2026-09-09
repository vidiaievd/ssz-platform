export const COURSE_OUTLINE_READER = Symbol('ICourseOutlineReader');

/** One item of a course unit — a lesson, a word list, an exercise. */
export interface CourseOutlineItem {
  id: string;
  itemType: string;
}

export interface CourseOutlineUnit {
  id: string;
  title: string | null;
  order: number;
  items: CourseOutlineItem[];
}

export interface CourseOutline {
  /** The published version the outline describes; null when nothing is published. */
  versionId: string | null;
  units: CourseOutlineUnit[];
}

/**
 * The published content of a course, seen from scheduling: what has to be taught
 * and in what order. A group's plan is laid over this, so the course — not the
 * calendar — decides how many sessions there are.
 */
export interface ICourseOutlineReader {
  /** Null when the course cannot be read at all; an empty outline when it has nothing published. */
  forCourse(courseId: string): Promise<CourseOutline | null>;
}
