# SSZ Platform — MVP Plan

> **Last updated**: 2026-06-02
> **Active sprint**: Post-MVP — School Dashboard UI
> **Status snapshot**: see `docs/STATUS.md`

---

## MVP Definition

The SSZ Platform MVP is a working end-to-end loop where a tutor can create
content, assign it to a student, the student can attempt exercises, get
auto-graded results for closed-form exercises, submit free-form work for
review, and the tutor can review and provide feedback.

The MVP is feature-complete when:

1. A tutor can register, create a school, invite students, build a course
   with lessons / vocabulary / grammar / exercises, and assign content.
2. A student can register, accept an invitation, see assignments, run
   exercises, get auto-scored results for closed-form exercises, submit
   free-form work, and see review feedback.
3. All inter-service communication is event-driven through RabbitMQ with
   idempotent consumers; HTTP is used only for synchronous lookups.
4. Every service has Swagger documentation, structured logging with correlation
   IDs, health probes, and is wired into `docker-compose.yml`.

**MVP backend is complete.** Active work is now on the school dashboard and frontend.

---

## Sprint Plan

### Sprints 1–5 — Foundation (Done)

| Sprint | Scope | Status |
|--------|-------|--------|
| 1 | Auth Service, User Profile Service | ✅ Done |
| 2 | Organization Service, Notification Service (email only) | ✅ Done |
| 3 | Content Service (Blocks 1–6) | ✅ Done |
| 4 | Media Service, Learning Service (core, no SRS) | ✅ Done |
| 5 | Exercise Engine Service, `@ssz/contracts` v1 | ✅ Done |

---

### Sprint 6 — Learning Service SRS + Cross-cutting (Done)

**Goal**: spaced repetition for exercises and vocabulary, plus infrastructure carry-overs.

| Step | Scope | Status |
|------|-------|--------|
| 1 | `@ssz/contracts` formal event types (Learning + Exercise Engine) | ✅ Done |
| 2 | Infrastructure wire-up (docker-compose, nginx, health checks) | ✅ Done |
| 3 | Learning content sync consumers + ADR-007 | ✅ Done |
| 5 | Learning Service SRS (FSRS-6, Redis due queue, daily limits) | ✅ Done |

---

### Sprint 7 (deferred) — LLM Integration

**Goal**: AI-powered exercise generation and free-form answer feedback.

- `LlmAnswerValidator` / `LlmFeedbackGenerator` behind ports from Sprint 5
- `IExerciseGenerator` port + `LlmExerciseGenerator` for tutors
- Provider abstraction (Anthropic Claude primary; OpenAI compatible fallback)
- Cost & latency telemetry; per-tutor rate limiting via Redis
- Feature flag `llm.enabled` per environment

---

### Sprint 8 (deferred) — Pronunciation & VoxOrd Backend Hooks

**Goal**: bring VoxOrd's local pronunciation flow into the platform.

- Pronunciation exercise template in Content Service
- `pronunciation-attempt` flow in Exercise Engine
- Audio upload via Media Service for tutor review

---

### Sprint 9 — Analytics Service (Done ✅)

**Goal**: event-driven analytics and school dashboard API.

> Fully implemented as feature branch `feature/analytics-service-projections`.
> See `docs/plan/school-dashboard-backend.md` for the systemic-first plan.

| Phase | Scope | Status |
|-------|-------|--------|
| A.2 | Event archive (wildcard consumer + replay API) | ✅ Done |
| A.3 | Transactional outbox (learning/content/organization) | ✅ Done |
| B.1 | Analytics service scaffold (Prisma, Swagger, health, JWT guard) | ✅ Done |
| B.2 | Directory projections: SchoolMembership, UserDirectory, ContainerDirectory | ✅ Done |
| B.3 | Metric projections: EnrollmentProjection, ProgressActivity, SubmissionProjection + seed | ✅ Done |
| B.4 | Dashboard KPI endpoint with trends (`value + delta + trend + spark[7]`) | ✅ Done |
| B.5 | At-risk students endpoint (with UserDirectory/ContainerDirectory denorm) | ✅ Done |
| B.6 | Course health endpoint (enrollment + completion + trend + dropoff) | ✅ Done |
| B.7 | School activity feed (audit module, cursor-paginated) | ✅ Done |
| C.1 | BFF composite `GET /api/schools/[id]/dashboard` (ssz-platform-web) | ✅ Done |
| D.1 | Nudge at-risk mutation + analytics.events exchange + notification consumer | ✅ Done |
| D.2 | School type `ONLINE\|HYBRID` across org-service | ✅ Done |

**Out of scope (D.3)**:
- Scheduling / Today's classes — separate service, `School.type` field is ready
- Trial/billing — separate billing service
- Publish-approval (#5) — content governance workstream; own spec/PR

---

### Sprint 10 — School Dashboard UI (current)

**Goal**: implement the school admin dashboard UI components and page in ssz-platform-web.

**BFF backend complete** (C.1). Next: build the UI.

**Scope**:
1. `<KpiCard>` component — stat + delta chip + inline `<Sparkline>`
2. `<Sparkline>` — 7-point SVG bar chart (no chart lib)
3. `<ActivityFeed>` / `<ActivityRow>` — tone-colored icon + actor + verb + target + timestamp
4. `<CourseHealthRow>` — grid row with completion `Progress` bar + trend + dropoff badge
5. `<AtRiskList>` — avatar + name + course + lastSeen + progress % + "Nudge all" button
6. Dashboard `page.tsx` — orchestrates `GET /api/schools/[id]/dashboard` + per-widget Suspense boundaries
7. Role-based widget visibility (teacher sees subset; owner/admin sees all)
8. Loading skeletons (per-widget Suspense fallbacks)
9. Empty + error states per widget
10. `POST /api/schools/[id]/nudge` Server Action with optimistic update + `revalidateTag('at-risk')`

---

### Sprint 11 — API Docs Service + Infrastructure Polish

**Goal**: consolidate developer experience.

1. `api-docs-service` (static HTML + nginx) with multi-spec Swagger UI dropdown
2. Analytics service registered in `docs-config.json`
3. CI/CD pipeline (GitHub Actions: typecheck + lint + test)

---

## Cross-cutting Concerns

| Concern | Owner sprint | Status |
|---------|--------------|--------|
| `@ssz/contracts` formal event types | Sprint 6 | ✅ Done |
| `analytics` exchange + `NudgeRequestedPayload` | Sprint 9 | ✅ Done |
| docker-compose + nginx for all services | Sprint 6 + 9 | ✅ Done |
| Transactional outbox (learning/content/organization) | A.3 | ✅ Done |
| Event archive + replay API | A.2 | ✅ Done |
| ADR-009 (rule-based / LLM strategy) | Sprint 5 | ✅ Done |
| ADR-010 (Exercise Engine boundaries) | Sprint 5 | ✅ Done |
| ADR-011 (event archive + outbox, no Kafka) | A.1 | ✅ Done |
| `leafItemCount` population via container-item events | TBD | ⏳ Pending |
| e2e integration tests across services | Sprint 6+ | Planned |
| API Docs aggregator | Sprint 11 | Planned |
| Mobile app (VoxOrd) full integration | Sprint 8+ | Planned |
| LLM integration | Sprint 7 | Planned |

---

## Decision Log Pointers

- **ADR-001 to ADR-006** — Auth, Content, Learning architectural decisions (existing)
- **ADR-007** — Container completion check strategy (Redis cache) — Sprint 6 ✅
- **ADR-008** — Submission reviewer routing — Sprint 6
- **ADR-009** — Rule-based MVP / LLM-ready architecture — Sprint 5 ✅
- **ADR-010** — Exercise Engine bounded context — Sprint 5 ✅
- **ADR-011** — Durable event archive + transactional outbox (no Kafka) — Sprint 9 / A.1 ✅
