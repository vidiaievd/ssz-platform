# User Profile Service — Status

**Stack**: NestJS / TypeScript, Clean Architecture, CQRS
**Database**: `profiles_db` (PostgreSQL)
**Status**: Complete

---

## Modules

### profiles
Manages base user profile — display name, avatar, bio, timezone, locale.

Commands: `CreateProfile`, `UpdateProfile`, `DeleteProfile`
Queries: `GetProfileByUserId`
Controller: `ProfilesController`

### students
Student-specific profile data — native language, target languages.

Commands: `CreateStudentProfile`, `UpdateStudentProfile`
Queries: `GetStudentProfile`
Controller: `StudentsController`

Domain: `StudentProfile` entity, `StudentTargetLanguage` value object

### tutors
Tutor-specific profile data — hourly rate, years of experience, teaching languages with proficiency levels.

Commands: `CreateTutorProfile`, `UpdateTutorProfile`
Queries: `GetTutorProfile`
Controller: `TutorsController`

Domain: `TutorProfile` entity, `TutorTeachingLanguage` value object
Proficiency levels: `NATIVE`, `FLUENT`, `ADVANCED`, `INTERMEDIATE`

### events
RabbitMQ consumers for Auth Service events:
- `UserRegisteredConsumer` — creates base profile on user registration
- `UserPlatformRoleAssignedConsumer` — triggers student/tutor profile creation on role assignment

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `profiles` | id, user_id, display_name, first_name, last_name, avatar_url, bio, timezone, locale, deleted_at |
| `student_profiles` | id, profile_id, native_language |
| `student_target_languages` | id, student_profile_id, language_code |
| `tutor_profiles` | id, profile_id, hourly_rate, years_of_experience |
| `tutor_teaching_languages` | id, tutor_profile_id, language_code, proficiency |
| `processed_events` | id, event_id, event_type, processed_at |

---

## Cross-Cutting

- JWT authentication via `JwtAuthGuard` (validates RS256 tokens from Auth Service)
- Soft deletes (`deleted_at`) on all entities
- Idempotent RabbitMQ consumers via `processed_events`
- Swagger documentation on all endpoints

---

## Tests

7 spec files covering:
- Basic profile CRUD flows
- Request scope isolation
- Generic handler behavior
- Command/query handler unit tests

---

## Known Gaps

- No public profile discovery endpoint (list tutors, search by language)
- No avatar upload integration (depends on Media Service)
- No profile completion score / onboarding progress tracking
