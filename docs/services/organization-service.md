# Organization Service — Status

**Stack**: NestJS / TypeScript, Clean Architecture, CQRS
**Database**: `organizations_db` (PostgreSQL)
**Status**: Complete

---

## Modules

### schools
Core school management — create/update/read schools, manage members, handle invitations.

**Domain entities**: `School`, `SchoolMember`, `SchoolInvitation`

**Commands**: `CreateSchool`, `UpdateSchool`, `InviteMember`, `AcceptInvitation`, `CancelInvitation`
**Queries**: `GetSchool`, `GetSchoolMembers`, `GetInvitations`

**Controllers**:
- `SchoolsController` — public school CRUD
- `InvitationsController` — invitation lifecycle (send, accept, cancel)
- `InternalController` — service-to-service endpoints (no JWT required on these routes)

---

## Member Roles

| Role | Description |
|------|-------------|
| `OWNER` | Full school control, transfers ownership |
| `ADMIN` | School settings, member management |
| `CONTENT_ADMIN` | Manages school-scoped content and tags |
| `TEACHER` | Assigns content to students, reviews submissions |
| `STUDENT` | Consumes assigned content |

---

## Invitation Lifecycle

```
PENDING → ACCEPTED
        → EXPIRED   (TTL-based, checked at query time)
        → CANCELLED (by owner/admin)
```

Invitations carry a JWT token sent via email. Acceptance validates the token, creates a `SchoolMember` record, and transitions status to `ACCEPTED`.

---

## School Policies

| Field | Type | Description |
|-------|------|-------------|
| `requireTutorReviewForSelfPaced` | boolean | Whether self-paced submissions need tutor approval |
| `defaultExplanationLanguage` | string? | Default explanation language for the school's content |

---

## Internal API (service-to-service)

Used by Content Service for access control decisions:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/internal/schools/{schoolId}/members/{userId}/role` | Get a single member's role |
| `GET /api/v1/internal/schools/members-batch?userIds=...&schoolIds=...` | Batch role lookup |

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `schools` | id, name, description, owner_id, avatar_url, is_active, require_tutor_review_for_self_paced, default_explanation_language |
| `school_members` | id, school_id, user_id, role, joined_at |
| `school_invitations` | id, school_id, email, role, token, status, expires_at |
| `processed_events` | id, event_id, event_type, processed_at |

---

## Cross-Cutting

- JWT authentication via `JwtAuthGuard`
- School role validation for sensitive operations
- Idempotent RabbitMQ consumers via `processed_events`
- Swagger documentation on all endpoints

---

## Tests

6 spec files

---

## Known Gaps

- No subscription / plan management (school plans, feature gating)
- No group / class management within a school (planned feature)
- No school search / discovery (find schools by name, language)
- No leave-school flow for members
