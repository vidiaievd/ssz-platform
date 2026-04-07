# SSZ Platform — CLAUDE.md

## Overview

EdTech platform for private tutors and language schools providing tools to create learning materials, and for students — tools for studying, training, and memorization of foreign languages.

## Tech Stack

- **Auth Service**: C# / ASP.NET Core 8, Clean Architecture, MediatR CQRS
- **All other microservices**: NestJS (TypeScript)
- **Databases**: PostgreSQL (database-per-service pattern)
- **Message broker**: RabbitMQ (event-driven communication)
- **Cache**: Redis (rate limiting, OTP replay protection, SRS queues, sessions)
- **API Gateway**: nginx
- **Mobile app**: React Native 0.84 (VoxOrd)
- **Containerization**: Docker / Docker Compose
- **Branching strategy**: Git Flow with PRs

## Architecture — Microservices

### 1. Auth Service (C# — exists)
Registration, login, MFA/TOTP, JWT RS256 (RSA-4096), refresh tokens, session revocation.
Argon2id password hashing, AES-256-GCM encryption, Serilog logging.
Roles: `student`, `tutor`, `school_admin`, `platform_admin`.
Database: `auth_db`

### 2. User Profile Service (NestJS)
User profiles separated from auth. Student profiles (level, target language, progress summary),
tutor profiles (qualifications, languages, schedule), school profiles (description, branding, plan).
Avatars, notification preferences, UI settings.
Database: `profiles_db`

### 3. Organization Service (NestJS)
Schools as entities: creation, teacher invitations, groups/classes management.
Internal roles (owner, admin, teacher). School subscriptions and plans.
Student enrollment to schools/groups.
Database: `organizations_db`

### 4. Content Service (NestJS)
Core for schools and tutors. Learning material management:
courses → modules → lessons → exercises.
Content types: text, audio, video, flashcards, grammar rules.
Exercise templates: fill-in-the-blank, matching, multiple choice, translation, listening.
Shared material library + private school materials. Content versioning.
Tags: language, level (A1–C2), topic.
Database: `content_db`

### 5. Learning Service (NestJS)
Core for students. Material assignment (manual by teacher or automatic).
Progress tracking: completed lessons, exercise results.
Spaced Repetition System (SRS) — interval repetition algorithm for flashcards and words.
Adaptive review queue. Stats: streak, study time, accuracy by exercise type.
Database: `learning_db`

### 6. Exercise Engine Service (NestJS)
Exercise generation and validation. Answer checking (exact match, fuzzy matching, acceptable variants).
Scoring logic. Support for different types: quiz, drag-and-drop, typing, audio response.
Potential LLM integration for exercise generation and free-form answer evaluation.
Database: `exercises_db`

### 7. Media Service (NestJS)
Upload, storage, processing of media files.
Audio (pronunciation, dictation), images (lesson illustrations), video.
Format conversion, thumbnails. S3-compatible storage (MinIO for self-hosted or AWS S3).
Database: `media_db`

### 8. Notification Service (NestJS)
Push notifications (FCM for mobile), email, in-app notifications.
Study reminders, new assigned materials, results.
Configurable preferences per user.
Database: `notifications_db`

### 9. Analytics Service (NestJS)
Analytics for schools/tutors: student progress, group summaries, material effectiveness.
Analytics for students: personal stats, progress charts.
Data aggregation, reports. Export to PDF/CSV.
Database: `analytics_db`

### 10. API Gateway (nginx — exists)
Request routing, rate limiting, CORS, SSL termination.

## Inter-Service Communication

- **Synchronous**: HTTP/gRPC for immediate responses (e.g., Learning Service fetches content from Content Service)
- **Asynchronous**: RabbitMQ events:
  - `user.registered` → Profile Service creates profile
  - `exercise.completed` → Learning Service updates progress, Analytics Service logs metric
  - `material.assigned` → Notification Service sends push
  - `course.published` → Learning Service updates available content

## Client Applications

- **Web (schools/tutors)**: Dashboard for content creation, student management, analytics
- **Web (students)**: Personal dashboard, lesson completion, statistics
- **Mobile (students)**: VoxOrd (React Native) — primary mobile learning interface

## Development Order

1. **Phase 1**: User Profile Service + Organization Service
2. **Phase 2**: Content Service + Media Service
3. **Phase 3**: Exercise Engine + Learning Service
4. **Phase 4**: Notification Service + Analytics Service

## Conventions

- Code comments in English only
- Detailed command explanations in responses
- When context is ambiguous, share full file contents
- Prefer complete file rewrites over partial snippets
