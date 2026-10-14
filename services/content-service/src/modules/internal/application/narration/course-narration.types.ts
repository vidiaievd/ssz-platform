export interface CourseNarrationOptions {
  /** Plan only; nothing is spoken or written. */
  dryRun: boolean;
  /** Narrate at most this many variants in one run (a real run waits for each). */
  limit?: number;
  /** Also re-speak synthesized narrations whose text is current — after the pace or voice changed. */
  force?: boolean;
}

export interface NarrationItemReport {
  lessonId: string;
  variantId: string;
  title: string;
  plan: 'create' | 'refresh' | 'skip';
  /** Why a refresh is due, or why the variant was left alone. */
  detail: string;
  assetId?: string;
  /** Real runs only. */
  outcome?: 'narrated' | 'failed' | 'not-attempted';
  newAssetId?: string;
  error?: string;
}

export interface CourseNarrationReport {
  courseId: string;
  dryRun: boolean;
  lang: string;
  variants: number;
  counts: Record<string, number>;
  items: NarrationItemReport[];
}
