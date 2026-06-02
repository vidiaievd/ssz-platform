# Backend TODO

> Задачи для бэкенда, которые нужны для реализации фич на фронте.
> Последнее обновление: 2026-06-02

---

## Schools (`organization-service`) — ✅ Все базовые задачи выполнены

### `POST /api/v1/schools` — поля payload ✅

Поддерживаются опциональные поля: `slug` (авто-генерация из `name` если не передан), `website`, `contactEmail`, `city`, `description`, `avatarUrl`, **`type` (`ONLINE`|`HYBRID`, default `ONLINE`)**.
Response: `201 Created` + полный объект школы.

### `PATCH /api/v1/schools/{id}` ✅

Все поля редактируемы через PATCH, включая `type`. Slug проверяется на уникальность.

### `GET /api/v1/schools/slug-available?slug=` ✅

```json
{ "available": true | false, "suggestions": ["nordic-academy-2"] }
```

### `GET /api/v1/schools/by-slug/{slug}` ✅

Resolve slug → объект School.

### `GET /api/v1/schools` и `GET /api/v1/schools/{id}` ✅

`GET /schools` возвращает только школы текущего пользователя. Response включает поле `type`.

---

## Школьные группы/когорты (`organization-service`) — ✅ Реализовано

```
POST   /api/v1/schools/{schoolId}/groups
GET    /api/v1/schools/{schoolId}/groups
GET    /api/v1/schools/{schoolId}/groups/{groupId}
PATCH  /api/v1/schools/{schoolId}/groups/{groupId}
DELETE /api/v1/schools/{schoolId}/groups/{groupId}
POST   /api/v1/schools/{schoolId}/groups/{groupId}/members  { userId }
DELETE /api/v1/schools/{schoolId}/groups/{groupId}/members/{userId}
```

---

## Связь «частный репетитор ↔ студент» (`organization-service`) — ✅ Реализовано

```
POST   /api/v1/tutoring/group
GET    /api/v1/tutoring/group
PATCH  /api/v1/tutoring/group
DELETE /api/v1/tutoring/group
GET    /api/v1/tutoring/my-tutor
DELETE /api/v1/tutoring/group/students/{userId}
POST   /api/v1/tutoring/group/invitations
GET    /api/v1/tutoring/group/invitations
POST   /api/v1/tutoring/invitations/{token}/accept
```

---

## Групповые задания (`learning-service`) — ✅ Реализовано

```
POST /api/v1/assignments/group
```

---

## Profiles (`profile-service`) — ✅ Поле uiLocale согласовано

`GET /api/v1/profiles/me` возвращает `uiLocale`. `PATCH` принимает `uiLocale`.

---

## Entitlements (`content-service`) — ✅ Реализовано

```
GET /api/v1/me/entitlements
```

---

## Exercise Engine — история попыток — ✅ Реализовано

```
GET /api/v1/exercises/{id}/attempts
GET /api/v1/exercises/{id}/attempts/{attemptId}
```

---

## Learning Service — прогресс, флаги — ✅ Реализовано

```
GET   /api/v1/progress/{contentType}/{contentId}
GET   /api/v1/progress/assignment/{id}
PATCH /api/v1/progress/{contentType}/{contentId}/flag
PATCH /api/v1/progress/{contentType}/{contentId}/resolve
```

---

## School Dashboard — ✅ Полностью реализовано

> Бэкенд-план: [`docs/plan/school-dashboard-backend.md`](plan/school-dashboard-backend.md).

Все виджеты дашборда подкреплены реальными данными из Analytics Service.

### ✅ 0. Роль зрителя в школе

`SchoolResponseDto.members[].role` присутствует. OWNER выводится из `ownerId`.
Analytics Service авторизует через собственную проекцию `SchoolMembership` — без обращения к org-service.

### ✅ 1. KPI strip — `GET /api/v1/schools/{schoolId}/dashboard/kpis`

4 headline-метрики: `active_students_7d`, `lessons_completed_7d`, `pending_reviews`, `at_risk`.
Каждая: `value + delta + trend + spark[7]` (нормализован 0–100). Owner-only метрики (`at_risk`) фильтруются по роли.
Delta = null до накопления ≥14д истории.

### ✅ 2. Activity feed — `GET /api/v1/schools/{schoolId}/activity?limit=&cursor=`

Хронологическая лента событий школы (people / content / review), курсорная пагинация.
`actorName` денормализован из `UserDirectory` при записи. Источники: `school.member.added`, `content.container.published`, `learning.enrollment.created`, `learning.submission.*`.

### ✅ 3. Course health — `GET /api/v1/schools/{schoolId}/dashboard/courses/health`

Per-course: enrollment, completion (0 до заполнения leafItemCount), trend (recent vs prev 7d), dropoff flag.
Sorted by enrollment desc.

### ✅ 4. At-risk students — `GET /api/v1/schools/{schoolId}/dashboard/at-risk?limit=`

Студенты без активности в последние `AT_RISK_THRESHOLD_DAYS` дней.
Response: `{ students: [{ userId, name, course, lastSeen, progress, lang }], total }`.
Sorted by longest inactivity. Owner/admin only.

### ⚠️ 5. Review queue (publish-approval) — нужно решение

`GET /moderation/queue` — контент, ожидающий owner-апрува перед публикацией.
Это **отдельный workstream** (content-governance), не данные дашборда.
Отдельная спека/PR. До реализации — `{ status: 'unavailable' }` в BFF.

### ❌ 6. Today's classes — `GET /schedule/today` — вне scope

Scheduling-сервиса нет. `School.type: ONLINE|HYBRID` добавлен (D.2) — условный рендер будет работать как только scheduling появится.
До реализации — `{ status: 'unavailable' }` в BFF.

### ✅ 7. Onboarding status — frontend-композит (бэкенд не нужен)

Фронт считает сам из наличных данных.

### ❌ 8. Trial status — нет billing-сервиса

`trial = null` (баннер скрыт). До реализации — `{ status: 'unavailable' }` в BFF.

### ✅ 9. Mutation: nudge at-risk — `POST /api/v1/schools/{schoolId}/dashboard/nudge`

`{ scope: 'all-at-risk' }` → `{ nudged: n }`.
Публикует `analytics.nudge.requested` per student → notification-service создаёт STUDY_REMINDER in-app запись.

---

### Сводка приоритетов

| # | Что | Статус |
|---|-----|--------|
| 0 | Роль зрителя (`members[].role`) | ✅ Готово |
| 1 | KPI-агрегаты + sparkline | ✅ Готово |
| 2 | Activity feed / audit | ✅ Готово |
| 3 | Course health | ✅ Готово |
| 4 | At-risk students | ✅ Готово |
| 5 | Publish-approval queue | ⚠️ Отдельный workstream |
| 6 | Scheduling + тип школы | `type` ✅; scheduling ❌ отдельный сервис |
| 7 | Onboarding status | ✅ Frontend-композит |
| 8 | Trial/billing | ❌ Отдельный billing-сервис |
| 9 | Nudge at-risk mutation | ✅ Готово |

---

## Флоу без бэкенда — продуктовые решения

### Scheduling / live-уроки / календарь
Нет API бронирования. `School.type: HYBRID` добавлен. Нужен новый сервис (слоты, бронь, видеозвонок).

### Trial/billing
Нет billing-сервиса. До решения фронт держит `trial = null`.

### Messaging тьютор↔студент
Нет API чата. Решить: встроенный обмен или только комментарии в review-сабмишенах?

### Certificates / завершение курса
При `PATCH /enrollments/{id}/complete` можно выдавать сертификат. Нужно: шаблон, PDF, верифицируемая ссылка.

### Placement / диагностика уровня (CEFR)
Нет API диагностики. Для онбординга студента.

### Publish-approval (#5)
Отдельный workstream content-governance. Своя спека/PR.

---

## Статус

| Задача | Статус |
|--------|--------|
| Группы/когорты в школе — API | ✅ Готово |
| Связь репетитор↔студент — API | ✅ Готово |
| Групповые задания | ✅ Готово |
| `GET /api/v1/me/entitlements` | ✅ Готово |
| `GET /api/v1/exercises/{id}/attempts` | ✅ Готово |
| `GET /api/v1/progress/{type}/{id}`, flag, resolve | ✅ Готово |
| School CRUD + slug + все поля | ✅ Готово |
| `School.type: ONLINE\|HYBRID` | ✅ Готово (D.2) |
| KPI-агрегаты + sparkline-серии | ✅ Готово (B.4) |
| At-risk students | ✅ Готово (B.5) |
| Course health | ✅ Готово (B.6) |
| Activity feed / audit | ✅ Готово (B.7) |
| Nudge at-risk mutation | ✅ Готово (D.1) |
| BFF composite `GET /api/schools/[id]/dashboard` | ✅ Готово (C.1, web) |
| Publish-approval queue | ⚠️ Нужно решение (отдельный workstream) |
| Scheduling / Today's classes | ❌ Отдельный сервис |
| Trial/billing | ❌ Отдельный сервис |
