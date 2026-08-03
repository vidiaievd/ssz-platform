/**
 * Publish state of several containers at once, plus how much of each one's
 * material is not released — what a course list needs to tell "published" from
 * "published, with changes students cannot see yet".
 */
export class GetPublishStatesQuery {
  constructor(public readonly containerIds: string[]) {}
}
