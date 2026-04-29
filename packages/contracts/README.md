# @ssz/contracts

Shared TypeScript types for the SSZ Platform monorepo.

## Scope

- **Event payload interfaces** — canonical shapes for every RabbitMQ message published or consumed across services, grouped by domain (`auth`, `content`, `learning`, `exercise-engine`, `media`, `notification`, `organization`).
- **Shared enums** — `AttemptStatus`, `AssignmentStatus`, `EnrollmentStatus`, `ProgressStatus`, `SubmissionStatus`, `RevisionDecision`, `ExerciseTemplateCode`, `ContentType`, `PlatformRole`, `SchoolRole`, `Visibility`, `AccessTier`.
- **Event envelope types** — `BaseEvent<T>` (wire format used by `RabbitmqEventPublisher`) and `DomainEvent<T>` (CLAUDE.md canonical envelope).
- **Internal DTOs** — inter-service HTTP request/response shapes.

## Usage

Reference the package from a service's `package.json` using the workspace `file:` path:

```json
"dependencies": {
  "@ssz/contracts": "file:../../packages/contracts"
}
```

Then import types:

```ts
import type { BaseEvent, ExerciseAttemptCompletedPayload, AttemptStatus } from '@ssz/contracts';
```

## Versioning

See [VERSIONING.md](./VERSIONING.md) for the breaking-change policy.
