---
name: school-dashboard-backend-plan
description: Architectural decisions for implementing School Dashboard backend data
metadata:
  type: project
---

Backend plan for the School Dashboard lives in `docs/plan/school-dashboard-backend.md` (rewritten 2026-06-02 to **systemic-first**). Frontend spec: `ssz-platform-web/docs/plan/spec/School-Dashboard-Implementation-Spec.md` §6. Dashboard is treated as the FIRST CONSUMER, not the goal — build platform capabilities, not frontend patches.

Confirmed decisions (user chose systemic-first explicitly):
- **Pace: systemic-first.** Build the foundation (event backbone + Analytics) before the dashboard. Dashboard ships later but with no seams / no rewrite.
- **Analytics Service is the SINGLE owner of all dashboard reads** (counts + trends + feed). Domain services only emit events. NO "dashboard" module inside learning-service — that was rejected as a patch. learning-service stays a clean domain service.
- **Durable event archive on RabbitMQ + Postgres, NO Kafka.** RabbitMQ = transport (consume-and-gone, no replay); we add an append-only `event_archive` (wildcard `#` consumer) + replay API in Postgres so future projections replay instead of bespoke backfill. Kafka rejected as overkill for solo/early stage. Plus transactional outbox for publish atomicity (applied to learning/content/organization first).
- **Audit (feed) and metrics = two modules in Analytics**, splittable later.
- **Event archive = module in Analytics now**, designed for extraction to a dedicated event-store-service when a 2nd replay consumer or compliance appears.
- **One-time seed** still needed for data predating the archive; after that, replay covers all future projections.
- **#0 (members[].role) already done.** **#5 publish-approval deferred** (content-governance, separate workstream). #6 scheduling / #8 billing = own services later.

Phases: 0 confirmations → A event backbone (ADR, archive+replay, outbox) → B Analytics (scaffold, directory/membership projections, metric projections+seed, KPI/at-risk/course-health, audit feed) → C BFF composite → D nudge + school type.

Key data facts: progress per-content has NO schoolId → school-scope via schoolStudents(S) = distinct active Enrollment.userId, modeled as an Analytics projection. pending_reviews exact via Submission[schoolId,status]. Content events lack schoolId → attribute via SchoolMembership projection (ownerId→schoolId). Authorization via OrganizationClient.getMemberRole.
