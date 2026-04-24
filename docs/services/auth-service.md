# Auth Service — Status

**Stack**: C# / ASP.NET Core 8, Clean Architecture, MediatR CQRS
**Database**: `auth_db` (PostgreSQL)
**Status**: Complete

---

## What Is Implemented

### Authentication & Tokens
- User registration with Argon2id password hashing
- Email/password login returning JWT RS256 (RSA-4096) access tokens
- Refresh token rotation — `refresh_tokens` table with expiration
- JWT validation used by all downstream services via shared public key

### Two-Factor Authentication (TOTP)
- TOTP secret generation and QR code setup
- TOTP code verification at login
- Backup codes (XXXXXXXX-XXXX format), single-use
- Commands: `EnableTwoFactor`, `DisableTwoFactor`, `VerifyTwoFactor`

### Role Management
- Roles: `student`, `tutor`, `school_admin`, `platform_admin`
- `AssignRoleCommand` handler
- Publishes `user.platform_role_assigned` event to RabbitMQ after role change

### Security Infrastructure
- AES-256-GCM symmetric encryption (`AesGcmEncryptionService`)
- Redis-backed rate limiting (`RedisRateLimitStore`)
- Redis OTP replay guard (`RedisOtpReplayGuard`)
- Serilog structured logging with correlation IDs

### API Controllers
- `AuthController` — `/register`, `/login`, `/refresh`
- `TwoFactorController` — TOTP setup, verify, disable, backup codes

### Events Published (RabbitMQ)
- `user.registered` — emitted after successful registration
- `user.platform_role_assigned` — emitted after role assignment

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | id, email, password_hash, totp_secret, totp_enabled |
| `refresh_tokens` | id, user_id, token, expires_at |
| `backup_codes` | id, user_id, code, is_used |
| `roles` | id, name |
| `user_roles` | user_id, role_id |

**Migrations**: 3 tracked (InitialCreate → AddStudentTutorRoles → UpdateRoleNames)

---

## Tests

8 unit test files:
- Argon2id password hashing
- `RegisterUserCommand` handler
- `LoginCommand` handler
- `UserAggregate` domain logic

---

## Known Gaps

- No logout / session revocation endpoint (refresh token invalidation)
- No "forgot password" / email reset flow
- No rate limiting on login endpoint at the application layer (only Redis store exists; wiring unclear)
