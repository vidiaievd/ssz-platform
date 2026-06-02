# Backend TODO

> Задачи для бэкенда, которые нужны для реализации фич на фронте.
> Последнее обновление: 2026-06-02

---

## Schools (`organization-service`) — ✅ Все базовые задачи выполнены

### `POST /api/v1/schools` — поля payload ✅

Поддерживаются опциональные поля: `slug` (авто-генерация из `name` если не передан), `website`, `contactEmail`, `city`, `description`, `avatarUrl`.
Response: `201 Created` + полный объект школы.

### `PATCH /api/v1/schools/{id}` ✅

Все поля редактируемы через PATCH. Slug проверяется на уникальность.

### `GET /api/v1/schools/slug-available?slug=` ✅

```json
{ "available": true | false, "suggestions": ["nordic-academy-2"] }
```
Suggestions только если `available: false`.

### `GET /api/v1/schools/by-slug/{slug}` ✅

Resolve slug → объект School. `404` если не найден, `403` если не участник.

### `GET /api/v1/schools` и `GET /api/v1/schools/{id}` ✅

`GET /schools` возвращает только школы текущего пользователя (как владелец или участник).
Все response содержат поля: `slug`, `website`, `contactEmail`, `city`.

---

## Школьные группы/когорты (`organization-service`) — ✅ Реализовано

Студент может состоять в нескольких группах и нескольких школах одновременно.

```
POST   /api/v1/schools/{schoolId}/groups              { name, description? } → { id }
GET    /api/v1/schools/{schoolId}/groups              список групп (summary)
GET    /api/v1/schools/{schoolId}/groups/{groupId}    детали + участники
PATCH  /api/v1/schools/{schoolId}/groups/{groupId}    обновить name/description
DELETE /api/v1/schools/{schoolId}/groups/{groupId}    мягкое удаление
POST   /api/v1/schools/{schoolId}/groups/{groupId}/members  { userId } → добавить участника школы
DELETE /api/v1/schools/{schoolId}/groups/{groupId}/members/{userId}
```

**Права:** создание/изменение/удаление — OWNER/ADMIN; управление участниками — OWNER/ADMIN/TEACHER; просмотр — любой участник школы.

> **Требует миграции БД:**
> ```bash
> cd services/organization-service && npx prisma migrate dev --name add-school-groups
> ```

---

## Связь «частный репетитор ↔ студент» (`organization-service`) — ✅ Реализовано

Реализовано через модуль `tutoring` (URL-префикс `/api/v1/tutoring`):

```
POST   /api/v1/tutoring/group                         создать группу репетитора (one per tutor)
GET    /api/v1/tutoring/group                         группа + список студентов
PATCH  /api/v1/tutoring/group                         обновить name/description/avatar
DELETE /api/v1/tutoring/group                         мягкое удаление группы
GET    /api/v1/tutoring/my-tutor                      студент: посмотреть своего репетитора
DELETE /api/v1/tutoring/group/students/{userId}       репетитор удаляет студента / студент уходит сам

POST   /api/v1/tutoring/group/invitations             отправить приглашение студенту { email }
GET    /api/v1/tutoring/group/invitations             список ожидающих приглашений
POST   /api/v1/tutoring/invitations/{token}/accept    студент принимает приглашение
```

---

## Групповые задания (`learning-service`) — ✅ Реализовано

```
POST /api/v1/assignments/group
```
```json
{
  "schoolId": "uuid-школы",
  "groupId": "uuid-группы",
  "contentType": "LESSON",
  "contentId": "uuid-контента",
  "dueAt": "2026-06-15T12:00:00Z",
  "notes": "..."
}
// 201 → AssignmentResponseDto[] — одна запись на каждого участника группы
```

Поле `groupId` добавлено в модель `Assignment` как метаданные (позволяет фильтровать все задания группы).

> **Требует миграции БД:**
> ```bash
> cd services/learning-service && npx prisma migrate dev --name add-group-id-to-assignments && npx prisma generate
> ```

---

## Profiles (`profile-service`) — ✅ Поле uiLocale согласовано

`GET /api/v1/profiles/me` возвращает `uiLocale` (не `locale`). `PATCH` принимает `uiLocale`.
БД-колонка осталась `locale` (без миграции), маппинг на уровне сервиса.

---

## Entitlements (`content-service`) — ✅ Реализовано

```
GET /api/v1/me/entitlements        активные доступы текущего пользователя
```

---

## Exercise Engine — история попыток — ✅ Реализовано

```
GET /api/v1/exercises/{id}/attempts             список попыток (пагинация, фильтр по status)
GET /api/v1/exercises/{id}/attempts/{attemptId} детали попытки
```

---

## Learning Service — прогресс, флаги — ✅ Реализовано

```
GET   /api/v1/progress/{contentType}/{contentId}         прогресс по элементу
GET   /api/v1/progress/assignment/{id}                   прогресс по заданию
PATCH /api/v1/progress/{contentType}/{contentId}/flag    поставить флаг «нужна проверка»
PATCH /api/v1/progress/{contentType}/{contentId}/resolve снять флаг проверки
```

---

## School Dashboard — данные для дашборда школы — ❗ Требует реализации

> Источник требований: [`docs/plan/spec/School-Dashboard-Implementation-Spec.md`](plan/spec/School-Dashboard-Implementation-Spec.md).
> Frontend-план: [`docs/plan/school-dashboard/`](plan/school-dashboard/).
> Фронт спроектирован так, что **собирается и мёржится до готовности бэкенда**: BFF-композит
> `GET /api/schools/[id]/dashboard` возвращает недоступные секции как `{ status: 'unavailable' }`,
> виджеты рендерят per-widget empty/«скоро». Ниже — что нужно, чтобы наполнить их реальными данными.

Дашборд состоит из 8 источников данных + 1 мутация. Готовность бэкенда сильно разнится — поэтому
разбито на три категории: ✅ выводимо из existing · ⚠️ частично есть / нужно решение · ❌ нет, нужна
реализация.

### Рекомендуемый контракт: `GET /api/v1/schools/{schoolId}/dashboard?role={role}`

Один агрегирующий эндпоинт (расширение давно обсуждаемого `/overview`), отдающий всё под форму
виджетов, **без N+1 с фронта**. Альтернатива — отдельные эндпоинты на виджет (ниже в каждом пункте
указан путь по спеке). Решение за бэкендом; фронту достаточно одного композита.

---

### 0. ⚠️ Гранулярная роль зрителя в школе — частично выводимо, нужно подтвердить shape

Условная отрисовка дашборда завязана на роль зрителя **в этой школе**
(`OWNER/ADMIN/TEACHER/CONTENT_ADMIN`). В JWT — только глобальные роли (`tutor`/`school_admin`).

**Что уже есть (по гайду):** `SchoolResponseDto` возвращает `ownerId` (и `members`) — см.
`POST /api/v1/schools` → «id, name, slug, …, ownerId, members, …». Значит:
- **OWNER ↔ не-OWNER различается уже сейчас:** `school.ownerId === me.userId`. Мой `userId` берётся из
  `GET /profiles/me` (layout его уже префетчит), `ownerId` — из уже загруженного списка `/schools`.
  **N+1 не нужен, бэкенду делать ничего не надо.**

**Что под вопросом:** форма встроенного школьного `members[]` в гайде не задокументирована (показано
только «members, …»). Единственный конкретный member-shape в гайде — групповой `{ id, userId, addedAt }`
— **без `role`**. Нужно подтвердить: содержит ли школьный `members[]` поле `role` на участника?
- **Если да** → все роли (admin/teacher/editor) выводятся на фронте из уже полученного объекта школы.
  Бэкенду делать **нечего** — на фронте только расширить тип `School` (`ownerId`, `members[].role`).
- **Если нет** → маленькая правка: добавить `role` во встроенный `members[]`, **или** отдать
  `GET /api/v1/schools/{schoolId}/me` → `{ role, joinedAt }` (предпочтительно, без вытягивания всех
  участников).

**Действие:** подтвердить shape школьного `members[]` (есть ли `role`). До подтверждения фронт
определяет OWNER через `ownerId`, остальных — деградирует до минимальных прав.

---

### 1. ❌ KPI strip — `GET /dashboard/kpis?role=`

4 headline-метрики с **7-дневными окнами, дельтами, трендом и sparkline-серией (7 точек)**:
`active_students_7d`, `lessons_completed_7d`, `pending_reviews`, `at_risk`.

Counts можно посчитать из existing, но **дельты (vs прошлый период), тренд и тайм-серии для sparkline
требуют серверной агрегации** по активности/прогрессу. Форма ответа — см. пример в спеке §6.
Owner-only метрики не должны уходить в payload не-owner ролей.

### 2. ❌ Activity feed — `GET /activity?limit=6` (+ `/audit` для full)

Хронология событий школы (people / content / review / milestone): кто · что · цель · время · тип.
**Audit/events-стрима сейчас нет** — лента пуста. Нужен источник событий (публикация урока,
запись студентов, сабмишен на ревью, майлстоун) + пагинация курсором (`nextCursor`). Форма — спека §6.

### 3. ❌ Course health — `GET /courses/health`

Per-course: enrollment, **completion % (агрегат), тренд, флаг `dropoff`**. Сортировка по enrollment на
сервере. Completion/тренд требуют агрегации прогресса по курсу — сейчас нет.

### 4. ❌ At-risk students — `GET /students/at-risk`

Студенты, **неактивные 7+ дней**, отсортированные по худшему прогрессу / самой долгой неактивности:
`{ name, course, lastSeen, progress, lang }` + `total`. Нужен per-student `lastActivity`/`lastSeen` и
запрос-агрегация. Сейчас нет.

### 5. ⚠️ Review queue (publish-approval) — `GET /moderation/queue?owner=1` — нужно решение

Спека описывает **контент (lesson/rubric), ждущий owner-апрува перед публикацией**. Это **не то же**,
что существующий `/api/v1/review/submissions/` (свободные ответы студентов на проверку, флоу 05).

**Нужно решение:** существует ли workflow «контент на апрув перед публикацией»?
- если да — отдать `GET /moderation/queue` (`{ kind, title, author, age }`);
- если нет — это новый флоу (статусы контента `draft/pending_approval/published` + права апрува).

Отдельно: **TeacherQueue** (сабмишены на проверку конкретному преподавателю) — вероятно выводимо из
`/review/submissions` с фильтром по преподавателю; подтвердить наличие фильтра.

### 6. ❌ Today's classes (hybrid) — `GET /schedule/today`

Сегодняшние занятия (комнаты + онлайн): время, название, преподаватель, комната, mode, students/cap,
status. **Scheduling-сервиса нет** (см. ниже «Scheduling / live-уроки»). Нужен также **тип школы
(`online`/`hybrid`)** в объекте школы — сейчас отсутствует, фронт дефолтит в `online`.

### 7. ✅ Onboarding status — выводимо из existing (бэкенд не нужен)

Чеклист новой школы фронт считает сам из наличных данных: есть ли курсы (`/containers`), участники
(`/members`/`invitations`), заполнен ли брендинг (поля school: `avatarUrl`, `description`). Отдельный
`GET /onboarding/status` **не требуется** (но можно добавить позже для единого источника правды).

### 8. ❌ Trial status — нет billing-сервиса — продуктовое решение

`trial: { daysLeft }` для TrialBanner. **Billing/subscription-сервиса нет.** До решения фронт держит
`trial = null` (баннер скрыт). Нужно: модель подписки/триала + источник `daysLeft`.

### 9. ❌ Mutation: nudge at-risk — `POST /api/v1/schools/{schoolId}/students/nudge`

`{ scope: 'all-at-risk' }` → `{ nudged: n }`. Рассылка напоминаний неактивным студентам (через
notification-service). Сейчас нет. Фронт реализует optimistic UI + Server Action; нужен реальный
эндпоинт.

---

### Сводка приоритетов для бэкенда

| # | Что | Приоритет | Блокирует |
|---|-----|-----------|-----------|
| 0 | Подтвердить `role` в школьном `members[]` (OWNER уже выводим из `ownerId`) | 🟡 уточнить | гранулярные не-owner роли |
| 1 | KPI-агрегаты + sparkline-серии | 🔴 высокий | KPI strip |
| 4 | At-risk (lastActivity + агрегация) | 🟠 средний | At-risk + KPI `at_risk` |
| 3 | Course-health агрегаты | 🟠 средний | Course health |
| 2 | Activity feed / audit events | 🟠 средний | Activity feed |
| 9 | Nudge at-risk mutation | 🟠 средний | Nudge-кнопка |
| 5 | Publish-approval queue (решение) | 🟡 уточнить | Review queue |
| 6 | Scheduling + тип школы | 🟢 низкий | Today's classes (hybrid) |
| 8 | Trial/billing | 🟢 низкий | Trial banner |
| 7 | Onboarding status | — | не требуется (frontend-композит) |

> **Рекомендация:** закрыть #0 и #1 первыми — без них дашборд показывает в основном онбординг +
> degraded-виджеты. Остальное подключается инкрементально без изменений на фронте (контракт
> `DashboardData` + degraded-режим уже это предусматривают).

---

## Флоу без бэкенда — продуктовые решения

Эти направления полезны, но API **не существует**. UI не планируем, пока бэкенд не подтвердит модель.

### Messaging тьютор↔студент
Нет API чата/сообщений. Решить: нужен встроенный обмен (1:1, тред на задание) или достаточно комментариев в review-сабмишенах? Если да — нужен новый сервис (threads, messages, read-state, realtime).

### Scheduling / live-уроки / календарь
Нет API бронирования. Для частного репетитора: слоты доступности, бронь урока, напоминания, интеграция с видеозвонком. Нужен новый сервис и решение по видео.

### Certificates / завершение курса
Нет API сертификатов. При `PATCH /enrollments/{id}/complete` можно выдавать сертификат. Нужно: шаблон, генерация PDF, верифицируемая ссылка, список «мои сертификаты».

### Placement / диагностика уровня (CEFR)
Нет API диагностического теста. Для онбординга студента: адаптивный тест → CEFR-уровень в профиль. Либо отдельный эндпоинт, либо exercise-engine с особым режимом.

### Gamification / достижения
Стрики замоканы, достижений нет. Если ретеншн-флоу пойдёт дальше виджетов — нужны бэкенд-стрики, достижения/бейджи, дневные цели.

---

## Статус

| Задача | Статус |
|--------|--------|
| Группы/когорты в школе — API | ✅ Готово (`POST/GET/PATCH/DELETE /schools/{id}/groups`, `POST/DELETE .../members`) |
| Связь репетитор↔студент вне школы — API | ✅ Готово (модуль `tutoring`: `/tutoring/group`, `/invitations`, `/my-tutor`) |
| `GET /api/v1/tutoring/group/invitations` — список ожидающих приглашений | ✅ Готово |
| Групповые задания — `POST /assignments/group` | ✅ Готово (`groupId` в Assignment, bulk-создание по участникам группы) |
| `GET /api/v1/me/entitlements` | ✅ Готово (content-service, модуль `entitlement`) |
| `GET /api/v1/exercises/{id}/attempts` (+ by id) | ✅ Готово (exercise-engine-service, `AttemptsController`) |
| `GET /api/v1/progress/{type}/{id}`, `…/flag`, `…/resolve` | ✅ Готово (learning-service, `ProgressController`) |
| `POST /api/v1/schools` — вернуть объект школы в response | ✅ Готово |
| `GET /api/v1/schools` — фильтрация по текущему пользователю | ✅ Готово |
| `POST /api/v1/schools` — поля `slug`, `website`, `contactEmail`, `city` | ✅ Готово |
| `PATCH /api/v1/schools/{id}` — все новые поля | ✅ Готово |
| `GET /api/v1/schools/slug-available` | ✅ Готово |
| `GET` responses — включить новые поля | ✅ Готово |
| `GET /api/v1/schools/by-slug/{slug}` — для slug-routing | ✅ Готово |
| `PATCH /api/v1/profiles/me` — поле `uiLocale` (было `locale`) | ✅ Готово |
| `GET /api/v1/schools/{id}/overview` (метрики) | ❓ Заменено детальным разделом «School Dashboard» (см. выше) |
| Роль зрителя в школе | ⚠️ OWNER выводим из `ownerId`; подтвердить `role` в `members[]` для остальных |
| KPI-агрегаты + sparkline-серии (`/dashboard/kpis`) | ❌ Нужно |
| At-risk students (`/students/at-risk`) | ❌ Нужно |
| Course health (`/courses/health`) | ❌ Нужно |
| Activity feed / audit (`/activity`) | ❌ Нужно |
| Publish-approval queue (`/moderation/queue`) | 🟡 Нужно решение (≠ `/review/submissions`) |
| Nudge at-risk (`POST /schools/{id}/students/nudge`) | ❌ Нужно |
| Тип школы `online`/`hybrid` + scheduling (`/schedule/today`) | ❌ Нужно (Today's classes) |
| Trial/billing (`trial.daysLeft`) | ❌ Нужно (продуктовое решение) |

> **Pending migrations:**
> ```bash
> # organization-service
> cd services/organization-service && npx prisma migrate dev --name add-school-groups
> # learning-service
> cd services/learning-service && npx prisma migrate dev --name add-group-id-to-assignments && npx prisma generate
> # Ранее: slug/website/contact_email/city в таблице schools — также требует migrate dev
> ```
