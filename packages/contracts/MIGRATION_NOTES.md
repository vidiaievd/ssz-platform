# @ssz/contracts — Migration Notes (Sprint 6 / Step 1)

_Generated: 2026-04-29. Source of truth: `CLAUDE.md` at monorepo root._

---

## 1. What currently exists

### Event interfaces
| Domain | Events defined |
|--------|----------------|
| `auth` | `user.registered` |
| `organization` | org/school/member events |
| `content` | container, lesson, vocabulary, grammar, exercise, tag, share, entitlement |
| `media` | (file) |
| `notification` | (placeholder) |
| `learning` | all 13 events from the sprint spec ✓ |
| `exercise-engine` | `exercise.attempt.started`, `exercise.attempt.completed` ✓ |

### Enums
| Enum | Status |
|------|--------|
| `ContentType` | ✓ exists — values: CONTAINER, LESSON, VOCABULARY_LIST, GRAMMAR_RULE, EXERCISE |
| `Visibility` | ✓ exists |
| `PlatformRole` | ✓ exists |
| `SchoolRole` | ✓ exists |
| `AccessTier` | ✓ exists |
| `AttemptStatus` | ✗ missing |
| `AssignmentStatus` | ✗ missing |
| `EnrollmentStatus` | ✗ missing |
| `ProgressStatus` | ✗ missing |
| `SubmissionStatus` | ✗ missing |
| `RevisionDecision` | ✗ missing |
| `ExerciseTemplateCode` | ✗ missing |

### Envelope type
`BaseEvent<TPayload>` exists but diverges from the CLAUDE.md spec:

| Field | `BaseEvent<T>` (current) | CLAUDE.md spec |
|-------|--------------------------|----------------|
| `version` | `eventVersion: string` | `version: number` |
| `timestamp` | `occurredAt: string` | `timestamp: string` |
| extra | `source: string`, `correlationId?: string` | — |

`DomainEvent<T>` as specified in CLAUDE.md is not yet defined.

---

## 2. Payload mismatches — events that exist in contracts but differ from service domain events

### `learning.assignment.created`
| Field | Contracts | Service domain event |
|-------|-----------|----------------------|
| assignee | `assignedByUserId` / `assignedToUserId` | `assignerId` / `assigneeId` |
| content ref | `exerciseId: string` | `contentRef: ContentRef` (type + id) |
| due date | `dueAt: string \| null` | `dueAt: Date` |

**Action**: align contracts payload to match the actual publisher output (what gets serialized to the wire). The domain event serializer will convert `contentRef` → `{ contentType, contentId }` and `dueAt` (Date) → ISO string. Decide canonical field names before Task 2.

### `learning.enrollment.created`
| Field | Contracts | Service domain event |
|-------|-----------|----------------------|
| id | `enrollmentId: string` | — (not emitted by domain event) |
| content key | `contentId: string` + `contentType: string` | `containerId: string` |

**Action**: domain event is publisher-authoritative. Contracts need to match what the handler actually puts in the envelope. Check `enroll-in-container.handler.ts`.

### `learning.submission.created`
| Field | Contracts | Service domain event |
|-------|-----------|----------------------|
| submission id | `submissionId: string` | — |
| attempt id | `attemptId: string` | — |
| school | — | `schoolId: string \| null` |

**Action**: check `submit-exercise.handler.ts` for what payload is actually published.

### `learning.progress.updated`
| Field | Contracts | Service domain event |
|-------|-----------|----------------------|
| status | — | `status: string` |

**Action**: add `status: ProgressStatus` to `ProgressUpdatedPayload`.

### `exercise.attempt.started`
| Field | Contracts | Service domain event |
|-------|-----------|----------------------|
| attempt id | `attemptId: string` | — |

**Action**: the handler publishes `event.payload` directly. Check whether the handler adds `attemptId` before publishing, or whether it is genuinely absent from the wire payload.

### `content.container.published` (consumed by Learning Service)
| Field | Contracts `ContainerPayload` | Consumer inline type |
|-------|------------------------------|----------------------|
| pub by | — | `publishedBy: string` |
| pub at | — | `publishedAt: string` |
| owner | `ownerUserId`, `ownerSchoolId` | — |
| type | `type: string` | — |
| visibility | `visibility: string` | — |

**Action**: `ContainerPublishedConsumer` currently uses its own local type that does not match `ContainerPayload`. Either fix the consumer to use the contracts type, or add a dedicated `ContainerPublishedPayload` to the content events.

---

## 3. Missing event types

### Events consumed by Learning Service, not yet typed in contracts as consumed events
- `content.container.deleted` — `ContainerDeletedPayload` exists in contracts ✓ but no consumer currently wired
- `exercise.attempt.completed` — `ExerciseAttemptCompletedPayload` exists ✓

### Events consumed by Exercise Engine Service, not yet typed in contracts as consumed events
- `content.exercise.deleted` — `ExerciseDeletedPayload` exists in contracts with `{ exerciseId, ownerUserId }` ✓
  - Consumer inline type only has `{ exerciseId }` — superset in contracts, no breakage, but consumer should import from contracts

---

## 4. Wire format vs. contracts

Both `RabbitmqEventPublisher` implementations define a local `EventEnvelope<T>` instead of importing from `@ssz/contracts`. Fields on the wire:

```
eventId, eventType, eventVersion, occurredAt, source, correlationId, payload
```

Both consumer files define inline partial envelope types instead of importing from contracts.

**Action**: after Tasks 2–4 are complete, replace all local `EventEnvelope` / payload definitions in both services with imports from `@ssz/contracts` (Task 7).

---

## 5. Publisher inconsistency in Learning Service

Handlers diverge in what they pass as the `payload` argument to `publisher.publish()`:

- Most handlers: `publisher.publish(event.eventType, (event as any).payload)` — publishes just the domain event's inner payload object. ✓ Correct.
- `enroll-in-container.handler`: `publisher.publish(event.eventType, event)` — publishes the **full domain event** (including `eventId`, `eventType`, `occurredAt`, `aggregateId`) as the `payload` field. The `payload` in the envelope will then be a nested domain event, not the flat payload expected by consumers.

**Action**: fix `enroll-in-container.handler.ts` to publish `(event as any).payload` instead of `event`. Audit all enrollment handlers for the same pattern.

---

## 6. Workspace dependency not yet wired

Neither `services/learning-service/package.json` nor `services/exercise-engine-service/package.json` declares `@ssz/contracts` as a dependency. Task 6 must add the workspace reference before Task 7 can import from it.

---

## 7. Missing enums — canonical values

| Enum | Values (from Prisma + domain entities) |
|------|----------------------------------------|
| `AttemptStatus` | `IN_PROGRESS`, `SUBMITTED`, `SCORED`, `ROUTED_FOR_REVIEW`, `ABANDONED` |
| `AssignmentStatus` | `ACTIVE`, `COMPLETED`, `CANCELLED`, `OVERDUE` |
| `EnrollmentStatus` | `ACTIVE`, `COMPLETED`, `UNENROLLED` |
| `ProgressStatus` | `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `NEEDS_REVIEW` |
| `SubmissionStatus` | `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `REVISION_REQUESTED`, `RESUBMITTED` |
| `RevisionDecision` | `APPROVED`, `REJECTED`, `REVISION_REQUESTED` |
| `ExerciseTemplateCode` | `multiple_choice`, `fill_in_blank`, `match_pairs`, `ordering`, `translate_to_target`, `translate_from_target` |

---

## 8. Items not missing (already correct)

- All 13 Learning Service event type **string constants** are correct in `LEARNING_EVENT_TYPES`.
- Both Exercise Engine event type constants are correct in `EXERCISE_ENGINE_EVENT_TYPES`.
- `content.exercise.deleted` and `content.exercise.updated` routing keys exist in `CONTENT_EVENT_TYPES`.
- `content.container.published` and `content.container.deleted` routing keys exist.
- `ContentType`, `Visibility`, `PlatformRole`, `SchoolRole`, `AccessTier` enums are exported correctly.
- Package `tsconfig.json` builds to `dist/`, exports map is correct for ESM.
- Both services reference `@ssz/contracts` as a workspace dependency (to verify in Task 6).
