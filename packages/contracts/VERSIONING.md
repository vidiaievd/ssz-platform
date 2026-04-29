# @ssz/contracts — Versioning Policy

## Current status

All event interfaces are at **version 1**. The `version` field (or `eventVersion`
in the `BaseEvent<T>` envelope) is set to `1` / `"1.0"` by all publishers.

## Rules

### Breaking changes → bump major version

A breaking change is any modification to an event payload that would cause a
consumer compiled against the old interface to fail or misinterpret the message:

- Removing a required field
- Renaming a field
- Changing a field's type in an incompatible way (e.g. `string` → `number`)
- Changing a field from optional to required

**When you make a breaking change:**

1. Create a new payload interface with a `V2` suffix, e.g. `AssignmentCreatedPayloadV2`.
2. Export both `AssignmentCreatedPayloadV1` (alias for the old interface) and the new one.
3. Update the `LEARNING_EVENT_TYPES` constant to include a versioned key if needed.
4. Keep both versions exported for at least one full sprint (transition window).
5. Coordinate with all consuming services before removing the old version.

### Non-breaking changes → no version bump

- Adding an optional field (`field?: Type`)
- Adding new event types (new routing keys)
- Adding new enum values

### Example — adding a breaking field

```ts
// Before (v1 — keep exported as alias for one sprint)
export interface AssignmentCreatedPayloadV1 {
  assignmentId: string;
  assignerId: string;
  // ...
}

// After (v2 — new canonical)
export interface AssignmentCreatedPayload {
  assignmentId: string;
  assignerId: string;
  schoolName: string;  // new required field → breaking
  // ...
}
```

## Changelog

| Date       | Event                    | Change type | Notes                         |
|------------|--------------------------|-------------|-------------------------------|
| 2026-04-29 | All events               | Initial     | Sprint 6 formalization — v1   |
