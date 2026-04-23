# Content Service

Part of the SSZ Platform. Manages all educational content: courses, modules, lessons, vocabulary lists, grammar rules, and exercises. Provides content authoring tools for tutors and schools, with versioning, access control, and multilingual content variants.

See [CONTENT_SERVICE_ARCHITECTURE.md](../../CONTENT_SERVICE_ARCHITECTURE.md) for full architectural decisions and domain model.

## Port

`3003` (Auth: 3001, User Profile: 3002, Content: 3003)

---

## Block 5 — Access Control (Tags, Shares, Entitlements, VisibilityGuard)

### Overview

Block 5 adds three cross-cutting content access features:

- **Tags** — Flat labels scoped to `global` (platform-wide) or `school`. Tags can be assigned to any taggable entity (container, lesson, vocabulary list, grammar rule, exercise). Only platform admins may create global tags; `owner` or `content_admin` school members may create school-scoped tags.
- **Content Shares** — Point-to-point sharing of a specific entity with a named user. The entity must have `visibility=shared`. Shares carry an optional expiry date; a daily cron revokes expired shares at 03:00 Europe/Oslo.
- **Entitlements** — Explicit access grants for paid containers (`access_tier=public_paid`). Grants can carry an expiry, a source reference (e.g. invoice ID), and arbitrary metadata.

### VisibilityGuard

`VisibilityGuard` is a per-method NestJS guard that checks whether the authenticated user may perform a given action on a content entity before the handler runs. Decorate any endpoint that reads or mutates a single identified entity:

```typescript
@Get(':id')
@UseGuards(VisibilityGuard)
@RequireAccess('view', { entityType: TaggableEntityType.CONTAINER })
async findOne(@Param('id') id: string) { ... }

// For child-resource controllers where the parent ID is in the route:
@Post()
@UseGuards(VisibilityGuard)
@RequireAccess('edit', { entityType: TaggableEntityType.VOCABULARY_LIST, idParam: 'listId' })
async create(@Param('listId') listId: string, ...) { ... }
```

`@RequireAccess` accepts:
| Option | Default | Description |
|---|---|---|
| `action` | — | `'view'` or `'edit'` or `'enroll'` |
| `entityType` | — | `TaggableEntityType` enum value |
| `idParam` | `'id'` | Route param name that holds the entity ID |

List endpoints (`GET /entities`) intentionally **do not** use `VisibilityGuard` — they apply a visibility filter inside the query handler (silent-filter semantics).

### Dependency on Organization Service

`VisibilityGuard` calls the Organization Service synchronously to verify school membership roles. Configure the connection via:

```
ORGANIZATION_SERVICE_URL=http://org-service:3002
ORGANIZATION_SERVICE_TIMEOUT_MS=2000
ORGANIZATION_SERVICE_RETRIES=2
INTERNAL_SERVICE_TOKEN=<shared-secret>
```

Internal endpoint called: `GET /api/v1/internal/schools/:schoolId/members/:userId/role`
Expected response: `{ "role": "owner" | "admin" | "content_admin" | "teacher" | "student" }` or `404` if not a member.

The client retries on 5xx / network errors up to `ORGANIZATION_SERVICE_RETRIES` times with 250ms / 500ms / 1000ms backoff. 401/403 responses throw immediately without retry (misconfigured `INTERNAL_SERVICE_TOKEN`).

### Cron Jobs

| Job | Schedule | Action |
|---|---|---|
| `ContentShareExpiryCron` | Daily 03:00 Europe/Oslo | Marks all past-expiry shares as revoked and emits `content.share.revoked` events |

### Block 5 — Summary

**Files created** (by folder):

| Folder | Count |
|---|---|
| `src/shared/access-control/domain/` | 6 (ports, types, services, value objects) |
| `src/shared/access-control/presentation/` | 4 (guard, decorator, exception, filter) |
| `src/shared/access-control/infrastructure/` | 3 (http client, registry, exception) |
| `src/modules/tag/` | ~30 (domain, application, infrastructure, presentation) |
| `src/modules/content-share/` | ~20 (domain, application, infrastructure, presentation) |
| `src/modules/entitlement/` | ~20 (domain, application, infrastructure, presentation) |
| Spec files | 8 |

**Existing controllers updated** (VisibilityGuard applied):

- `container.controller.ts`, `container-version.controller.ts`, `container-item.controller.ts`
- `lesson.controller.ts`
- `vocabulary-list.controller.ts`, `vocabulary-item.controller.ts`, `vocabulary-example.controller.ts`
- `grammar-rule.controller.ts`
- `exercise.controller.ts`

**Prisma migrations applied:** `20250420_add_tags`, `20250420_add_content_shares`, `20250420_add_entitlements`

**npm packages installed:** `@nestjs/axios`, `axios`, `@nestjs/schedule`, `slugify`

**Known TODOs:**

- `TODO(block-5-followup)` — batch school-membership lookup for tag list visibility filter (currently N+1)
- `TODO(block-5-followup)` — `InternalAuthGuard` for `GET /exercises/:id/answers` (Exercise Engine endpoint)
- Entitlement expiry cron not implemented — passive expiry via `isActive()` check is sufficient for now

**Next block suggestion:** Block 6 — Learning Service (assignment, progress tracking, SRS queue)
