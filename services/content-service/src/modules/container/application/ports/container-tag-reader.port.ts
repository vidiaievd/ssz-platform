export const CONTAINER_TAG_READER = Symbol('CONTAINER_TAG_READER');

export type ContainerTagCategory = 'topic' | 'situation' | 'skill' | 'level' | 'other';

/** A tag as a course card shows it — enough to print and to filter by. */
export interface ContainerTag {
  id: string;
  name: string;
  category: ContainerTagCategory;
}

/**
 * The tags placed on containers, read for many at once — a catalogue page asks for all of its
 * courses in one go rather than one request per card (plan 04 step 9b, VoxOrd).
 */
export interface IContainerTagReader {
  /** Every requested id is a key; a container without tags maps to an empty list. */
  forContainers(containerIds: readonly string[]): Promise<Map<string, ContainerTag[]>>;
}
