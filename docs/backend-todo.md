# Backend TODO

> Задачи для бэкенда, которые нужны для реализации фич на фронте.
> Последнее обновление: 2026-05-31

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

## Открытые вопросы

### `GET /api/v1/schools/{schoolId}/overview` — ❓ Ожидает решения

Для дашборда школы нужны агрегированные метрики без N+1 запросов с фронта: число участников по ролям, активные enrollments, ожидающие приглашения, недавняя активность.

Варианты:
- Фронт собирает kompozit из существующих GET-ов (быстро, N запросов)
- Новый `GET /api/v1/schools/{schoolId}/overview` (рекомендуется при росте)

**Нужно решение**: нужен серверный `overview` или фронт делает композит сам?

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
| `GET /api/v1/schools/{id}/overview` (метрики) | ❓ Ожидает решения (флоу 06) |

> **Pending migrations:**
> ```bash
> # organization-service
> cd services/organization-service && npx prisma migrate dev --name add-school-groups
> # learning-service
> cd services/learning-service && npx prisma migrate dev --name add-group-id-to-assignments && npx prisma generate
> # Ранее: slug/website/contact_email/city в таблице schools — также требует migrate dev
> ```
