export enum SharePermission {
  READ = 'READ',
  READ_AND_REVIEW = 'READ_AND_REVIEW',
  // Grants edit access on the shared entity — the "co-author" role. Unlike
  // READ/READ_AND_REVIEW, this is consulted directly by VisibilityCheckerService
  // for the 'edit' action, independent of the entity's visibility setting.
  EDIT = 'EDIT',
}
