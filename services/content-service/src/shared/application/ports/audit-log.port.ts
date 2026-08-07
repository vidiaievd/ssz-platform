export const AUDIT_LOG = Symbol('AUDIT_LOG');

/** What kind of thing an entry is about. Mirrors `audit_entity_type` in the schema. */
export type AuditEntityType =
  | 'CONTAINER'
  | 'LESSON'
  | 'EXERCISE'
  | 'VOCABULARY_LIST'
  | 'GRAMMAR_RULE';

/**
 * What happened. A string rather than an enum, in the schema and here alike:
 * the set grows with every feature, and a closed type would make each addition
 * a migration. The union documents what exists without freezing it.
 */
export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'published'
  | 'unpublished'
  | 'archived'
  | 'restored'
  | 'instructions_updated';

export interface AuditEntry {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  /** From the JWT, which is why entries are written by command handlers. */
  actorUserId: string;
  /** For an edit: which fields it touched. Empty for lifecycle actions. */
  changedFields?: string[];
}

/**
 * Records who changed what.
 *
 * Deliberately fire-and-forget from the caller's point of view: a failure to
 * write history must not fail the change itself, and a handler that had to
 * decide what to do about it would grow a branch it cannot meaningfully take.
 * Implementations log their own failures.
 */
export interface IAuditLog {
  record(entry: AuditEntry): Promise<void>;
}
