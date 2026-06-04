# SSZ Platform — Frontend API Guide

> Инструкция для Claude Code при работе над фронтендом (веб или мобайл).
> Последнее обновление: 2026-06-04

---

## Запуск бекенда (dev)

```bash
cd infrastructure
docker compose --env-file .env.dev -f docker-compose.base.yml -f docker-compose.dev.yml up -d
```

Без `--env-file .env.dev` NestJS-сервисы не поднимутся (неверные пароли БД).

---

## Текущее состояние сервисов

| Сервис | Технология | Порт | Статус |
|---|---|---|---|
| nginx (API Gateway) | nginx 1.27 | **:80** | Running |
| Auth Service | C# / ASP.NET Core 8 | :5062 | Running |
| User Profile Service | NestJS | :3001 | Running |
| Organization Service | NestJS | :3002 | Running |
| Content Service | NestJS | :3003 | Running |
| Media Service | NestJS | :3004 | Running |
| Notification Service | NestJS | :3005 | Running (email + in-app nudge) |
| Exercise Engine Service | NestJS | :3006 | Running |
| Learning Service | NestJS | :3007 | Running |
| Analytics Service | NestJS | :3008 | Running |

---

## Единственный entry point для фронтенда

```
http://localhost:80
```

Все запросы — через nginx. Прямые порты (`:5062`, `:3001` и т.д.) доступны только для дебага в dev, в коде фронтенда использовать только `:80`.

---

## CORS

Nginx разрешает `http://localhost:3000` (предполагаемый dev-сервер фронта).

Разрешённые заголовки: `Authorization`, `Content-Type`, `X-Correlation-ID`.

Если фронтенд запускается на другом порту — изменить `Access-Control-Allow-Origin` в `infrastructure/nginx/nginx.dev.conf`.

---

## Аутентификация

Auth Service — C# / ASP.NET Core 8. JWT **RS256** (RSA-4096).

Схема токенов:
- **Access token** — 15 минут, передаётся в каждом запросе
- **Refresh token** — долгоживущий, ротируется при каждом обновлении

```
Authorization: Bearer <accessToken>
```

### Формат ответа с токенами (`AuthTokensResponse`)

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "accessTokenExpiresAt": "2026-05-21T11:00:00Z",
  "refreshTokenExpiresAt": "2026-05-28T10:35:00Z"
}
```

---

## 1. Auth Service `/api/v1/auth/`

### POST /api/v1/auth/register

Регистрация нового пользователя.

```json
// Request
{ "email": "user@example.com", "password": "SecurePass123!", "role": "student" }

// role: "student" или "tutor" (самостоятельно)
// "school_admin", "platform_admin" — только через platform_admin

// 201 Created
{ "userId": "uuid", "email": "user@example.com" }

// 409 — email уже занят
// 422 — слабый пароль или невалидный email
```

### POST /api/v1/auth/login

Вход по email/паролю. Два возможных ответа:

```json
// Request
{ "email": "user@example.com", "password": "SecurePass123!" }

// 200 — без 2FA → AuthTokensResponse (сохранить оба токена)

// 200 — если включён 2FA → MFA challenge:
{ "mfaRequired": true, "challenge": "<mfaChallengeToken>" }
// После этого вызвать /mfa/challenge или /mfa/backup

// 401 — неверные данные
// 423 — аккаунт заблокирован (прогрессивная блокировка)
```

### POST /api/v1/auth/mfa/challenge

Завершить вход с TOTP-кодом.

```json
// Request
{ "mfaChallengeToken": "<из login-ответа>", "code": "123456" }

// 200 → AuthTokensResponse
// 401 — неверный код или просроченный challenge
```

### POST /api/v1/auth/mfa/backup

Завершить вход с резервным кодом.

```json
// Request
{ "mfaChallengeToken": "<из login-ответа>", "backupCode": "XXXX-XXXX" }

// 200 → AuthTokensResponse
```

### POST /api/v1/auth/refresh

Обновить токены (вызывать до или после истечения access token).

```json
// Request
{ "refreshToken": "<refreshToken>" }

// 200 → AuthTokensResponse (заменить оба токена в хранилище)
// 401 — refresh token истёк или отозван → редирект на логин
```

### POST /api/v1/auth/logout

🔒 Требует Authorization. Отзывает все сессии пользователя.

```
// 204 No Content → очистить токены из хранилища
```

### POST /api/v1/auth/password/forgot

Сброс пароля — шаг 1 (запрос письма). Всегда 204 (защита от перебора).

```json
{ "email": "user@example.com" }
// 204 No Content
```

### POST /api/v1/auth/password/reset

Сброс пароля — шаг 2 (токен из письма).

```json
{ "token": "<token-из-ссылки>", "newPassword": "NewPass123!" }
// 204 → пользователь может войти с новым паролем
// 401 — токен просрочен или недействителен
```

### POST /api/v1/auth/email/verify/request

🔒 Требует Authorization. Повторно отправить письмо с подтверждением email.

```
// 204 No Content
```

### POST /api/v1/auth/email/verify/confirm

Подтвердить email по токену из письма.

```json
{ "token": "<token-из-ссылки>" }
// 204 → email подтверждён
// 401 — токен недействителен
```

> **Важно**: неподтверждённый email не блокирует вход (MVP-решение).

### GET /api/v1/auth/roles

🔒 Вернуть список ролей текущего пользователя.

```json
// 200
{ "roles": ["student"] }
```

### POST /api/v1/auth/roles

🔒 Назначить роль (student/tutor — самостоятельно; остальные — только platform_admin).

```json
{ "roleName": "tutor" }
// 200 — назначено (идемпотентный)
// 403 — нет прав
```

### POST /api/v1/auth/2fa/setup

🔒 Инициировать настройку TOTP 2FA.

```json
// 200
{
  "secretKey": "BASE32SECRET",
  "qrCodeUri": "otpauth://totp/...",
  "qrCodeImageBase64": "iVBOR..."  // PNG, рендерить как <img src="data:image/png;base64,...">
}
// После показа QR — вызвать /2fa/verify
```

### POST /api/v1/auth/2fa/verify

🔒 Подтвердить код и активировать 2FA.

```json
// Request
{ "code": "123456" }

// 200
{
  "message": "Two-factor authentication has been enabled.",
  "backupCodes": ["XXXX-XXXX", "..."],  // показать один раз, больше не будут доступны
  "warning": "Store these backup codes securely..."
}
```

### DELETE /api/v1/auth/2fa

🔒 Отключить 2FA (требует текущий TOTP-код для подтверждения).

```json
// Request
{ "code": "123456" }
// 204 No Content
```

---

## 2. User Profile Service `/api/v1/profiles/`

🔒 Все эндпоинты требуют Authorization.

### GET /api/v1/profiles/me

Получить свой профиль.

```json
// 200 → ProfileResponseDto (содержит поле uiLocale)
// 404 — профиль ещё не создан (создаётся автоматически после регистрации через RabbitMQ)
```

### PATCH /api/v1/profiles/me

Обновить базовый профиль.

```json
{
  "displayName": "Ім'я для відображення",
  "firstName": "Dmytro",
  "lastName": "Vidiaiev",
  "avatarUrl": "https://...",
  "bio": "...",
  "timezone": "Europe/Kyiv",
  "uiLocale": "uk"    // язык UI — каноническое имя поля (не locale)
}
// 200 → обновлённый профиль
```

> **Важно**: поле называется `uiLocale` (не `locale`). В БД хранится как `locale`, маппинг на уровне сервиса.

### DELETE /api/v1/profiles/me

Мягкое удаление своего профиля. `204 No Content`.

### POST /api/v1/profiles/me/student

Создать студенческий профиль (дополнение к базовому).

```json
{ "nativeLanguage": "uk" }  // ISO 639-1
// 201 → StudentProfileResponseDto
// 409 — уже существует
```

### GET /api/v1/profiles/me/student

Получить свой студенческий профиль. `200` или `404`.

### POST /api/v1/profiles/me/student/languages

Добавить целевой язык для изучения.

```json
{ "code": "no", "level": "A1" }  // code: ISO 639-1
// 204 No Content
```

### DELETE /api/v1/profiles/me/student/languages/{code}

Удалить целевой язык. `204 No Content`.

### POST /api/v1/profiles/me/tutor

Создать профиль репетитора.

```json
{ "hourlyRate": 25.0, "yearsOfExperience": 3 }
// 201 → TutorProfileResponseDto
```

### POST /api/v1/profiles/me/tutor/languages

Добавить язык преподавания.

```json
{ "code": "no", "level": "C2" }
// 204 No Content
```

### DELETE /api/v1/profiles/me/tutor/languages/{code}

Удалить язык преподавания. `204`.

### GET /api/v1/profiles/tutors

Список репетиторов с фильтрами (query params). `200`.

### GET /api/v1/profiles/{userId}

Профиль пользователя по userId. `200` или `404`.

### GET /api/v1/profiles/{userId}/student

Студенческий профиль по userId. `200` или `404`.

### GET /api/v1/profiles/{userId}/tutor

Профиль репетитора по userId. `200` или `404`.

### GET /api/v1/users/lookup?email={email}

🔒 Только для пользователей с ролью `tutor` или `school_admin`. Поиск пользователя по email для 3-веточного invite-flow.

```json
// 200 — пользователь найден
{ "userId": "uuid", "roles": ["student", "tutor"], "displayName": "Maria Singh" }

// 404 — нет такого email в системе → ветка A (register)
```

Используется перед `POST /schools/{schoolId}/invitations` чтобы выбрать ветку:
- **404** → kind `register` (новый пользователь)
- **200, roles включает `student`** → прямое добавление через `POST /groups/{id}/members`
- **200, roles без `student`** → kind `onboard_existing`

---

## 3. Organization Service `/api/v1/`

🔒 Все эндпоинты требуют Authorization.

### Школы — `/api/v1/schools/`

#### POST /api/v1/schools

Создать школу. Создатель автоматически получает роль OWNER.

```json
{
  "name": "My Language School",        // уникальное имя
  "slug": "my-language-school",        // опционально — авто-генерируется из name если не передан
  "description": "...",                // опционально
  "avatarUrl": "https://...",          // опционально
  "website": "https://myschool.com",   // опционально
  "contactEmail": "info@myschool.com", // опционально
  "city": "Kyiv",                      // опционально
  "type": "ONLINE"                     // опционально — "ONLINE" (default) | "HYBRID"
}
// 201 → SchoolResponseDto (id, name, slug, website, contactEmail, city, type, ownerId, members, ...)
```

#### GET /api/v1/schools

Список школ, в которых состоит текущий пользователь (как владелец или участник). `200`.

#### GET /api/v1/schools/slug-available?slug={slug}

Проверить доступность slug перед созданием/обновлением.

```json
// 200
{ "available": true }
// или
{ "available": false, "suggestions": ["nordic-academy-2", "nordic-academy-online"] }
```

#### GET /api/v1/schools/by-slug/{slug}

Resolve slug → объект School. `200`, `403` (не участник), `404`.

#### GET /api/v1/schools/{schoolId}

Детали школы (только для участников). `200`, `403`, `404`.

#### PATCH /api/v1/schools/{schoolId}

Обновить данные школы (только OWNER/ADMIN). Все поля опциональны: `name`, `slug`, `description`, `avatarUrl`, `website`, `contactEmail`, `city`, `type` (`"ONLINE"` | `"HYBRID"`). `204`.

> При изменении `slug` старые ссылки перестают работать — предупредить пользователя на фронте.

#### DELETE /api/v1/schools/{schoolId}

Мягкое удаление школы (только OWNER). `204`.

#### POST /api/v1/schools/{schoolId}/members

Напрямую добавить участника (OWNER/ADMIN).

```json
{
  "userId": "uuid",
  "role": "TEACHER"  // ADMIN | CONTENT_ADMIN | TEACHER | STUDENT
}
// 204 No Content
// 409 — уже участник
```

#### DELETE /api/v1/schools/{schoolId}/members/{userId}

Удалить участника из школы или самостоятельно покинуть. `204`.

#### POST /api/v1/schools/{schoolId}/invitations

Отправить приглашение по email. Расширен для 3-веточного student-flow.

```json
{
  "email": "student@example.com",
  "role": "STUDENT",           // ADMIN | CONTENT_ADMIN | TEACHER | STUDENT (не OWNER)
  "kind": "register",          // "register" (default) | "onboard_existing"
  "targetGroupId": "uuid"      // опционально — авто-добавить в группу после accept
}
// 201 → { invitationId, token, kind, expiresAt, deliveryStatus: "queued" }
```

**Ветки (выбрать kind через `/users/lookup`):**
- `kind=register` — email не в системе; студент получает ссылку регистрации → после accept добавляется в школу + `targetGroupId`
- `kind=onboard_existing` — пользователь есть, но без роли `student`; получает ссылку онбординга → после accept роль `student` добавляется, студент попадает в школу + `targetGroupId`
- Прямое добавление (ветка B) — `POST /groups/{groupId}/members` без письма

#### POST /api/v1/schools/invitations/{token}/accept

Принять приглашение по токену из письма. `204`.
Обе ветки (`register` и `onboard_existing`) добавляют пользователя в школу как STUDENT и, если задан `targetGroupId`, в группу. Публикуется платформенная роль `Student`.

---

### Группы-когорты в школе — `/api/v1/schools/{schoolId}/groups/`

Студент может состоять в нескольких группах. Группа — полноценная когорта: связана с курсом, имеет статус жизненного цикла, учителей, ёмкость и term-даты.

**Права:** создание/редактирование/публикация/архивация — OWNER/ADMIN; управление участниками и учителями — OWNER/ADMIN/TEACHER; просмотр — любой участник школы.

#### POST /api/v1/schools/{schoolId}/groups

```json
{
  "name": "Level A2 — Spring 2026",
  "description": "...",             // опционально
  "mode": "online",                 // "online" (default) | "in_person"
  "courseId": "uuid",               // опционально, UUID курса (content container)
  "lang": "en",                     // опционально, ISO 639-1
  "level": "A2",                    // опционально, CEFR A1–C2
  "capacityMin": 4,                 // опционально
  "capacityMax": 12,                // опционально
  "startDate": "2026-09-01",        // опционально, ISO date
  "endDate": "2026-12-31"           // опционально, ISO date
}
// 201 → { "id": "uuid" }
// Новые группы всегда создаются со статусом "draft"
```

#### GET /api/v1/schools/{schoolId}/groups

Список групп (summary). `200 → SchoolGroupSummaryResponseDto[]`

```json
[{
  "id": "uuid", "schoolId": "uuid", "name": "Level A2 — Spring 2026",
  "description": "...",
  "status": "draft",          // "draft" | "active" | "archived"
  "mode": "online",           // "online" | "in_person"
  "courseId": "uuid | null",
  "lang": "en | null",
  "level": "A2 | null",
  "capacityMin": 4, "capacityMax": 12,
  "startDate": "2026-09-01 | null", "endDate": "2026-12-31 | null",
  "studentCount": 8,
  "teachers": [{ "id": "uuid", "userId": "uuid", "role": "primary", "fromDate": null, "toDate": null, "reason": null }],
  "createdAt": "..."
}]
```

#### GET /api/v1/schools/{schoolId}/groups/{groupId}

Детали группы + список участников + учителей. `200 → SchoolGroupResponseDto`

```json
{
  // ... все поля summary ...
  "members": [{ "id": "uuid", "userId": "uuid", "addedAt": "..." }],
  "updatedAt": "..."
}
```

#### PATCH /api/v1/schools/{schoolId}/groups/{groupId}

Обновить любые поля когорты (все опциональны): `name`, `description`, `mode`, `courseId`, `lang`, `level`, `capacityMin`, `capacityMax`, `startDate`, `endDate`. `204`.

> Смена `status` — только через `/publish` и `/archive`, не через PATCH.

#### POST /api/v1/schools/{schoolId}/groups/{groupId}/publish

Перевод `draft → active`. Проверяет инварианты: есть `courseId`, есть primary-учитель.

```json
// 200 — успешно опубликована
// 409 → { "blockers": ["no-course", "no-primary"] }  // одно или несколько
```

При публикации автоматически выдаются entitlements на курс всем уже добавленным студентам.

#### POST /api/v1/schools/{schoolId}/groups/{groupId}/archive

Архивация группы (любой статус → archived). `204`. Публикует `school.group.archived` → content-service отзывает entitlements.

#### DELETE /api/v1/schools/{schoolId}/groups/{groupId}

Hard-delete — только для пустых `draft`/`archived` групп. Для активных групп — сначала `/archive`. `204` или `409`.

#### POST /api/v1/schools/{schoolId}/groups/{groupId}/members

Добавить участника школы в группу. Публикует `school.group.member.added` → content-service выдаёт entitlement на курс (если группа активна и имеет courseId).

```json
{ "userId": "uuid" }  // userId должен быть членом школы
// 204 No Content
// 403 — userId не является участником школы
```

#### DELETE /api/v1/schools/{schoolId}/groups/{groupId}/members/{userId}

Удалить участника из группы (или уйти самому). `204`. Публикует `school.group.member.removed` → entitlement отзывается если нет другой активной группы с тем же курсом.

#### POST /api/v1/schools/{schoolId}/groups/{groupId}/teachers

Назначить учителя (должен быть TEACHER-членом школы).

```json
{
  "userId": "uuid",
  "role": "primary",           // "primary" | "co_primary" | "substitute"
  "fromDate": "2026-10-01",    // опционально, только для substitute
  "toDate": "2026-10-15",      // опционально, только для substitute
  "reason": "Отпуск",          // обязательно для substitute
  "override": false            // true — заменить существующего primary/co_primary
}
// 200 → { "ok": true, "warnings": [{ "type": "replaced-primary" }] }
// 409 → { "error": "language-mismatch", "teacherLangs": ["uk"], "requiredLang": "en" }
//        { "error": "primary-already-assigned", "existingUserId": "uuid" }
```

Валидация: язык преподавания учителя должен совпадать с `group.lang` (hard block, не overridable).

#### DELETE /api/v1/schools/{schoolId}/groups/{groupId}/teachers/{userId}?role=primary

Удалить назначение учителя. `?role=` обязателен. `204`.

---

### Учителя школы — `/api/v1/schools/{schoolId}/teachers/`

Нагрузка и доступность учителей для timetable/assign-модалок.

#### GET /api/v1/schools/{schoolId}/teachers

Все TEACHER-члены школы с атрибутами нагрузки.

```json
[{
  "userId": "uuid",
  "maxWeeklyHours": 20,           // null если не задано
  "availability": [
    { "weekday": 1, "start": "09:00", "end": "17:00" }  // weekday: 1=Пн … 7=Вс
  ]
}]
```

#### PATCH /api/v1/schools/{schoolId}/teachers/{userId}

Обновить нагрузку/доступность учителя (OWNER/ADMIN). `204`.

```json
{
  "maxWeeklyHours": 20,     // опционально
  "availability": [{ "weekday": 1, "start": "09:00", "end": "17:00" }]  // опционально
}
```

---

### Связь частного репетитора со студентами — `/api/v1/tutoring/`

Для репетиторов вне школы. У каждого репетитора одна группа (тьюторинг-группа).

#### POST /api/v1/tutoring/group

Создать тьюторинг-группу (требует роль `tutor` на платформе).

```json
{ "name": "Мои студенты", "description": "...", "avatarUrl": "https://..." }
// 201 → { "id": "uuid" }
// 409 — группа уже существует
```

#### GET /api/v1/tutoring/group

Получить свою группу со списком студентов (для репетитора).

```json
// 200
{
  "id": "uuid", "tutorId": "uuid", "name": "...", "isActive": true,
  "students": [{ "id": "uuid", "userId": "uuid", "joinedAt": "..." }],
  "createdAt": "...", "updatedAt": "..."
}
```

#### PATCH /api/v1/tutoring/group

Обновить name/description/avatarUrl. `204`.

#### DELETE /api/v1/tutoring/group

Мягкое удаление группы. `204`.

#### GET /api/v1/tutoring/my-tutor

Для студента: посмотреть информацию о своём репетиторе.

```json
// 200 → TutoringGroupSummaryResponseDto
{ "id": "uuid", "tutorId": "uuid", "name": "...", "studentCount": 5, "createdAt": "..." }
// 404 — не привязан ни к одному репетитору
```

#### DELETE /api/v1/tutoring/group/students/{userId}

Репетитор удаляет студента или студент уходит сам. `204`.

#### POST /api/v1/tutoring/group/invitations

Репетитор отправляет приглашение студенту по email.

```json
{ "email": "student@example.com" }
// 201 → { "invitationId": "uuid", "token": "...", "expiresAt": "...", "deliveryStatus": "queued" }
// 404 — тьюторинг-группа не создана
```

#### GET /api/v1/tutoring/group/invitations

Список ожидающих приглашений (для репетитора).

```json
// 200 → [{ "id": "uuid", "email": "...", "expiresAt": "...", "createdAt": "..." }]
```

#### POST /api/v1/tutoring/invitations/{token}/accept

Студент принимает приглашение по токену из письма. `204`.

---

## 4. Content Service `/api/v1/`

🔒 Все эндпоинты требуют Authorization.

Контент-сервис управляет: **контейнерами** (курсы/модули), **уроками**, **словарными списками**, **упражнениями**, **грамматическими правилами**, **тегами**, **шерингом** и **доступом**.

### Контейнеры (курсы/модули)

```
POST   /api/v1/containers                           Создать контейнер
GET    /api/v1/containers                           Список (фильтры, пагинация)
GET    /api/v1/containers/{id}                      Получить по ID
GET    /api/v1/containers/slug/{slug}               Получить опубликованный по slug
PATCH  /api/v1/containers/{id}                      Обновить метаданные
DELETE /api/v1/containers/{id}                      Мягкое удаление

POST   /api/v1/containers/{id}/draft                Создать черновик из опубликованной версии

GET    /api/v1/containers/{containerId}/versions                         Список версий
GET    /api/v1/containers/{containerId}/versions/{versionId}             Конкретная версия
POST   /api/v1/containers/{containerId}/versions/{versionId}/publish     Опубликовать черновик
DELETE /api/v1/containers/{containerId}/versions/{versionId}/cancel      Удалить черновик

GET    /api/v1/containers/{containerId}/versions/{versionId}/items       Элементы версии
POST   /api/v1/containers/{containerId}/versions/{versionId}/items       Добавить элемент
PATCH  /api/v1/containers/{containerId}/versions/{versionId}/items/{id}  Обновить элемент
DELETE /api/v1/containers/{containerId}/versions/{versionId}/items/{id}  Удалить элемент
PUT    /api/v1/containers/{containerId}/versions/{versionId}/items/reorder Переупорядочить

POST   /api/v1/containers/{id}/localizations                             Добавить локализацию
PATCH  /api/v1/containers/{id}/localizations/{languageCode}              Обновить локализацию
DELETE /api/v1/containers/{id}/localizations/{languageCode}              Удалить локализацию

POST   /api/v1/containers/{id}/entitlements                              Выдать доступ пользователю
GET    /api/v1/containers/{id}/entitlements                              Список доступов
DELETE /api/v1/content-entitlements/{id}                                 Отозвать доступ
GET    /api/v1/me/entitlements                                           Мои активные доступы (пагинация)
```

### Уроки

```
POST   /api/v1/lessons                              Создать урок
GET    /api/v1/lessons                              Список
GET    /api/v1/lessons/{id}                         По ID
GET    /api/v1/lessons/slug/{slug}                  По slug (опубликованный)
PATCH  /api/v1/lessons/{id}                         Обновить
DELETE /api/v1/lessons/{id}                         Удалить (мягко, вместе с вариантами)

GET    /api/v1/lessons/{id}/variants                Варианты контента
POST   /api/v1/lessons/{id}/variants                Создать вариант
GET    /api/v1/lessons/{id}/variants/best           Лучший вариант для студента (по профилю)
GET    /api/v1/lessons/{id}/variants/{variantId}    Конкретный вариант
PATCH  /api/v1/lessons/{id}/variants/{variantId}    Обновить
DELETE /api/v1/lessons/{id}/variants/{variantId}    Удалить
POST   /api/v1/lessons/{id}/variants/{variantId}/publish  Опубликовать (DRAFT → PUBLISHED)
```

### Словарные списки

```
POST   /api/v1/vocabulary-lists                     Создать список
GET    /api/v1/vocabulary-lists                     Список
GET    /api/v1/vocabulary-lists/{listId}            По ID
GET    /api/v1/vocabulary-lists/slug/{slug}         По slug
PATCH  /api/v1/vocabulary-lists/{listId}            Обновить
DELETE /api/v1/vocabulary-lists/{listId}            Удалить (вместе с элементами)

GET    /api/v1/vocabulary-lists/{listId}/items                                  Элементы (пагинация)
POST   /api/v1/vocabulary-lists/{listId}/items                                  Добавить слово
POST   /api/v1/vocabulary-lists/{listId}/items/bulk                             Массовое добавление (до 500)
PATCH  /api/v1/vocabulary-lists/{listId}/items/reorder                          Переупорядочить
GET    /api/v1/vocabulary-lists/{listId}/items/{itemId}                         Полное слово (для редактора)
PATCH  /api/v1/vocabulary-lists/{listId}/items/{itemId}                         Обновить
DELETE /api/v1/vocabulary-lists/{listId}/items/{itemId}                         Удалить (мягко)
GET    /api/v1/vocabulary-lists/{listId}/items/{itemId}/display                 Отображение для студента (кэш)
POST   /api/v1/vocabulary-lists/{listId}/items/batch-display                    Батч-получение (до 200 ID)

PUT    /api/v1/vocabulary-lists/{listId}/items/{itemId}/translations/{lang}     Создать/обновить перевод
DELETE /api/v1/vocabulary-lists/{listId}/items/{itemId}/translations/{lang}     Удалить перевод

POST   /api/v1/vocabulary-lists/{listId}/items/{itemId}/examples                Добавить пример
PATCH  /api/v1/vocabulary-lists/{listId}/items/{itemId}/examples/{exId}         Обновить пример
DELETE /api/v1/vocabulary-lists/{listId}/items/{itemId}/examples/{exId}         Удалить пример
PUT    /api/v1/vocabulary-lists/{listId}/items/{itemId}/examples/{exId}/translations/{lang}  Перевод примера
DELETE /api/v1/vocabulary-lists/{listId}/items/{itemId}/examples/{exId}/translations/{lang}  Удалить перевод
```

### Упражнения

```
POST   /api/v1/exercises                            Создать упражнение
GET    /api/v1/exercises                            Список
GET    /api/v1/exercises/{id}                       По ID (без инструкций)
GET    /api/v1/exercises/{id}/display               Для студента (без ответов)
GET    /api/v1/exercises/{id}/answers               С ответами (автор/движок)
PATCH  /api/v1/exercises/{id}                       Обновить
DELETE /api/v1/exercises/{id}                       Удалить

GET    /api/v1/exercises/{id}/instructions          Инструкции
POST   /api/v1/exercises/{id}/instructions          Создать/обновить инструкцию для языка
DELETE /api/v1/exercises/{id}/instructions/{instructionId}  Удалить

GET    /api/v1/exercise-templates                   Список шаблонов упражнений
GET    /api/v1/exercise-templates/{id}              Шаблон по ID
```

### Грамматические правила

```
POST   /api/v1/grammar-rules                        Создать правило
GET    /api/v1/grammar-rules                        Список
GET    /api/v1/grammar-rules/{id}                   По ID
PATCH  /api/v1/grammar-rules/{id}                   Обновить
DELETE /api/v1/grammar-rules/{id}                   Удалить (вместе с объяснениями)

POST   /api/v1/grammar-rules/{id}/explanations      Добавить объяснение
GET    /api/v1/grammar-rules/{id}/explanations      Список объяснений
GET    /api/v1/grammar-rules/{id}/explanations/best Лучшее для студента
GET    /api/v1/grammar-rules/{id}/explanations/{eid}   По ID
PATCH  /api/v1/grammar-rules/{id}/explanations/{eid}   Обновить
DELETE /api/v1/grammar-rules/{id}/explanations/{eid}   Удалить
POST   /api/v1/grammar-rules/{id}/explanations/{eid}/publish  Опубликовать

POST   /api/v1/grammar-rules/{id}/pool                  Добавить упражнение в пул
GET    /api/v1/grammar-rules/{id}/pool                  Список пула
GET    /api/v1/grammar-rules/{id}/pool/random            Случайное по весам
PATCH  /api/v1/grammar-rules/{id}/pool/{exerciseId}     Изменить вес
DELETE /api/v1/grammar-rules/{id}/pool/{exerciseId}     Удалить из пула
POST   /api/v1/grammar-rules/{id}/pool/reorder          Переупорядочить
```

### Теги

```
GET    /api/v1/tags                                 Список тегов (глобальных и/или школьных)
POST   /api/v1/tags                                 Создать тег
GET    /api/v1/tags/{id}                            По ID
PATCH  /api/v1/tags/{id}                            Обновить (slug не меняется)
DELETE /api/v1/tags/{id}                            Мягкое удаление

GET    /api/v1/{entityType}/{entityId}/tags         Теги у сущности
POST   /api/v1/{entityType}/{entityId}/tags         Присвоить тег
DELETE /api/v1/{entityType}/{entityId}/tags/{tagId} Снять тег

// entityType: containers | lessons | vocabulary-lists | grammar-rules | exercises
```

### Шеринг контента

```
POST   /api/v1/content-shares                       Поделиться с пользователем
GET    /api/v1/me/shared-with-me                    Что поделились со мной
GET    /api/v1/{entityType}/{entityId}/shares        Кому расшарено (требует edit-доступ)
DELETE /api/v1/content-shares/{id}                  Отозвать доступ
```

---

## 5. Media Service `/api/v1/media/`

🔒 Все эндпоинты требуют Authorization.

Сервис хранит файлы в MinIO (S3-совместимый object storage). Фронтенд **не загружает файл через API Gateway** — он загружает напрямую на MinIO по presigned PUT URL. API нужен только чтобы получить этот URL и подтвердить загрузку.

### Dev окружение

MinIO поднимается вместе с docker-compose:
- **API (загрузка/скачивание)**: `http://localhost:9000`
- **Консоль администратора**: `http://localhost:9001` (login: `minioadmin` / `minioadmin`)
- **Публичные файлы** доступны напрямую: `http://localhost:9000/ssz-public/{key}`

### Жизненный цикл загрузки

```
1. POST /api/v1/media/uploads/request   ← создаём запись, получаем presigned URL
2. PUT {uploadUrl}                       ← загружаем файл НАПРЯМУЮ на MinIO (без Authorization)
3. POST /api/v1/media/uploads/{id}/finalize  ← подтверждаем, запускаем обработку
```

### Статусы ассета

| Статус | Описание |
|--------|----------|
| `PENDING_UPLOAD` | Создан, ожидает загрузки файла |
| `UPLOADED` | Файл загружен, ожидает обработки |
| `PROCESSING` | Идёт ресайз/конвертация (BullMQ) |
| `READY` | Готов к использованию, варианты доступны |
| `FAILED` | Ошибка обработки |
| `DELETED` | Мягко удалён |

Изображения и аудио: `UPLOADED → PROCESSING → READY`.
Видео и SVG: `UPLOADED → READY` (без обработки).

### Публичные vs приватные ассеты

Bucket определяется по `entityType`:

| `entityType` | Bucket | URL |
|---|---|---|
| `profile_avatar` | `ssz-public` | Прямой URL, не истекает |
| Всё остальное | `ssz-private` | Presigned URL, TTL 1 час |

### Допустимые MIME-типы

| Категория | MIME-типы | Лимит |
|---|---|---|
| Изображения | `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `image/svg+xml` | 20 МБ |
| Аудио | `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/opus`, `audio/aac`, `audio/flac`, `audio/mp4` | 100 МБ |
| Видео | `video/mp4`, `video/webm`, `video/ogg`, `video/quicktime` | 500 МБ |

Любой другой MIME-тип → `422 MIME_TYPE_NOT_ALLOWED`.

### Формат storageKey

Ключ объекта в MinIO: `{ownerId}/{uuid}/{sanitized_filename}`

Например: `a1b2c3d4.../e5f6.../avatar.jpg`

Варианты (после обработки) хранятся рядом: `{ownerId}/{uuid}/variants/{variantType}.{ext}`

---

### POST /api/v1/media/uploads/request

Создать запись ассета и получить presigned PUT URL.

```json
// Request
{
  "mimeType": "image/jpeg",          // обязательно
  "sizeBytes": 204800,               // обязательно, в байтах
  "originalFilename": "avatar.jpg",  // опционально, до 256 символов
  "entityType": "profile_avatar",    // опционально — определяет публичность bucket
  "entityId": "uuid-профиля"         // опционально — для последующей фильтрации
}

// 201 Created
{
  "assetId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "uploadUrl": "http://localhost:9000/ssz-public/...?X-Amz-Signature=...",
  "expiresAt": "2026-06-02T10:15:00Z",   // TTL 15 минут
  "finalizeUrl": "/api/v1/media/uploads/{assetId}/finalize"
}

// 422 — MIME_TYPE_NOT_ALLOWED или FILE_TOO_LARGE
```

**Важно**: `uploadUrl` истекает через 15 минут. Не кешировать — запрашивать перед каждой загрузкой.

---

### PUT {uploadUrl}

Загрузить файл напрямую в MinIO. Выполняется **без** заголовка Authorization.

```
PUT http://localhost:9000/ssz-public/...?X-Amz-Signature=...
Content-Type: image/jpeg      ← должен совпадать с mimeType из запроса
Body: <binary file content>

200 OK  ← MinIO возвращает пустое тело при успехе
```

Пример на TypeScript:

```ts
async function uploadToMinIO(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`MinIO upload failed: ${response.status}`);
  }
}
```

---

### POST /api/v1/media/uploads/{assetId}/finalize

Подтвердить загрузку. Сервис проверяет наличие файла в MinIO, переводит ассет в `UPLOADED` и ставит в очередь обработки (для изображений и аудио).

```
// 204 No Content — успешно

// 404 — assetId не найден или не принадлежит текущему пользователю
// 422 — файл ещё не появился в MinIO (нужно сначала сделать PUT)
// 422 — неверный переход статуса (finalize уже был вызван)
```

---

### Полный flow загрузки (TypeScript)

```ts
async function uploadAvatar(file: File, profileId: string): Promise<string> {
  // 1. Запросить presigned URL
  const { assetId, uploadUrl } = await api.post('/api/v1/media/uploads/request', {
    mimeType: file.type,
    sizeBytes: file.size,
    originalFilename: file.name,
    entityType: 'profile_avatar',
    entityId: profileId,
  });

  // 2. Загрузить напрямую в MinIO (без Authorization)
  await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  // 3. Подтвердить загрузку
  await api.post(`/api/v1/media/uploads/${assetId}/finalize`);

  // 4. Получить финальный URL (или опросить до статуса READY)
  const asset = await api.get(`/api/v1/media/assets/${assetId}`);
  return asset.url;  // для profile_avatar — прямой публичный URL
}
```

---

### GET /api/v1/media/assets

Список своих ассетов с пагинацией.

```
?entityType=profile_avatar     // фильтр по типу сущности (опционально)
?entityId=uuid                 // фильтр по ID сущности (опционально, нужен entityType)
?limit=20&offset=0             // пагинация, limit максимум 100

// 200 OK
{
  "items": [ AssetResponseDto ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

---

### GET /api/v1/media/assets/{assetId}

Получить один ассет. Для приватных ассетов поле `url` содержит presigned GET URL с TTL 1 час.

```json
// 200 OK
{
  "id": "3fa85f64-...",
  "ownerId": "user-uuid",
  "mimeType": "image/jpeg",
  "sizeBytes": 204800,
  "storageKey": "user-uuid/uuid/avatar.jpg",
  "originalFilename": "avatar.jpg",
  "status": "READY",                          // см. таблицу статусов
  "entityType": "profile_avatar",
  "entityId": "profile-uuid",
  "url": "http://localhost:9000/ssz-public/user-uuid/.../avatar.jpg",
  "uploadedAt": "2026-06-02T10:00:00.000Z",
  "createdAt": "2026-06-02T09:59:45.000Z",
  "variants": [
    {
      "variantType": "thumb_256",
      "mimeType": "image/webp",
      "sizeBytes": 12800,
      "url": "http://localhost:9000/ssz-public/user-uuid/.../variants/thumb_256.webp"
    }
  ]
}

// 404 — не найден или не принадлежит текущему пользователю
```

**Важно**: поле `url` для публичных ассетов (`profile_avatar`) — постоянная ссылка, можно сохранять в профиле. Для приватных — ссылка живёт 1 час, получать при каждом показе.

---

### DELETE /api/v1/media/assets/{assetId}

Мягкое удаление. Файл физически удаляется из MinIO.

```
// 204 No Content
// 404 — не найден или не принадлежит текущему пользователю
```

---

### Ожидание обработки (polling)

После `finalize` для изображений и аудио запускается фоновая обработка. Если нужен вариант (thumbnail), нужно подождать статуса `READY`:

```ts
async function waitForReady(assetId: string, maxAttempts = 10): Promise<AssetResponseDto> {
  for (let i = 0; i < maxAttempts; i++) {
    const asset = await api.get(`/api/v1/media/assets/${assetId}`);
    if (asset.status === 'READY') return asset;
    if (asset.status === 'FAILED') throw new Error('Asset processing failed');
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Asset processing timeout');
}
```

SVG и видео переходят в `READY` сразу без обработки — polling для них не нужен.

---

## 6. Exercise Engine Service `/api/v1/exercises/{exerciseId}/attempts`

🔒 Все эндпоинты требуют Authorization.

Движок упражнений — выполнение и проверка ответов студентом.

### POST /api/v1/exercises/{exerciseId}/attempts

Начать попытку выполнения упражнения.

```json
// Request
{
  "language": "no",            // целевой язык инструкций (ISO 639-1)
  "assignmentId": "uuid",      // опционально — если через задание от репетитора
  "enrollmentId": "uuid"       // опционально — если через запись в курс
}

// 201 → StartAttemptResponseDto:
{
  "attemptId": "uuid",
  "templateCode": "fill_in_blank",   // тип упражнения
  "targetLanguage": "no",
  "difficultyLevel": "A2",
  "exerciseContent": { ... },        // контент (форма зависит от templateCode)
  "expectedAnswers": { ... },        // ожидаемые ответы (форма зависит от templateCode)
  "answerSchema": { ... },           // JSON Schema для валидации submittedAnswer
  "checkSettings": { ... }           // настройки проверки
}
```

### POST /api/v1/exercises/{exerciseId}/attempts/{attemptId}/submit

Отправить ответ.

```json
// Request
{
  "submittedAnswer": { ... },    // форма зависит от templateCode, валидируется по answerSchema
  "timeSpentSeconds": 45,
  "locale": "uk"                 // язык обратной связи
}

// 200 → SubmitAnswerResponseDto:
{
  "attemptId": "uuid",
  "correct": true,
  "score": 1.0,
  "requiresReview": false,        // true для свободных ответов → отправить в review/submissions
  "feedback": {
    "summary": "...",
    "hints": [],
    "correctAnswer": { ... }      // если incorrect
  }
}
```

### GET /api/v1/exercises/{exerciseId}/attempts

Список своих попыток по упражнению.

```
?status=SCORED           // фильтр по статусу (опционально)
?limit=20&offset=0       // пагинация

// 200 → { items: AttemptResponseDto[], total, limit, offset }
```

### GET /api/v1/exercises/{exerciseId}/attempts/{attemptId}

Детали конкретной попытки. `200`, `403`, `404`.

```json
{
  "id": "uuid", "userId": "uuid", "exerciseId": "uuid",
  "assignmentId": "uuid | null", "enrollmentId": "uuid | null",
  "templateCode": "fill_in_blank", "targetLanguage": "no",
  "difficultyLevel": "A2", "status": "SCORED",
  "score": 1.0, "passed": true, "timeSpentSeconds": 45,
  "startedAt": "...", "submittedAt": "...", "scoredAt": "...",
  "feedback": { ... }
}
```

### DELETE /api/v1/exercises/{exerciseId}/attempts/{attemptId}

Отменить текущую попытку. `204`.

---

## 7. Learning Service

🔒 Все эндпоинты требуют Authorization.

### Задания от репетитора — `/api/v1/assignments/`

#### Одиночное задание (конкретному студенту)

```
POST /api/v1/assignments
```
```json
{
  "assigneeId": "uuid-студента",
  "schoolId": "uuid-школы",
  "contentType": "LESSON",          // CONTAINER | LESSON | VOCABULARY_LIST | GRAMMAR_RULE | EXERCISE
  "contentId": "uuid-контента",
  "dueAt": "2026-06-01T18:00:00Z",
  "notes": "Пройти до конца недели"
}
// 201 → AssignmentResponseDto (содержит groupId: null для одиночных)
```

#### Групповое задание (всем участникам группы сразу)

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
// Студенты без доступа к контенту — пропускаются (не ошибка)
// 403 — нет роли учителя/администратора в школе
// 404 — группа не найдена
// 422 — в группе нет участников
```

> `groupId` сохраняется в каждой записи Assignment как метаданные — можно фильтровать задания группы.

#### Другие эндпоинты

```
GET  /api/v1/assignments/mine           Задания мне (студент)
GET  /api/v1/assignments/given          Задания, которые я выдал (репетитор)
GET  /api/v1/assignments/{id}           Детали задания
DELETE /api/v1/assignments/{id}         Отменить задание
PATCH /api/v1/assignments/{id}/due-date Изменить дедлайн
```

---

### Записи в курсы — `/api/v1/enrollments/`

```
POST /api/v1/enrollments
```
```json
{
  "containerId": "uuid-контейнера",
  "schoolId": "uuid-школы"          // опционально, для доступа уровня FREE_WITHIN_SCHOOL
}
// 201 → EnrollmentResponseDto
```

```
GET    /api/v1/enrollments             Мои записи
GET    /api/v1/enrollments/{id}        Конкретная запись
DELETE /api/v1/enrollments/{id}        Отписаться
PATCH  /api/v1/enrollments/{id}/complete  Отметить как завершённую
```

---

### Прогресс — `/api/v1/progress/`

```
POST /api/v1/progress                               Записать результат попытки, обновить прогресс
GET  /api/v1/progress                               Весь мой прогресс (фильтр ?contentType=)
GET  /api/v1/progress/{contentType}/{contentId}     Прогресс по конкретному элементу
GET  /api/v1/progress/assignment/{id}               Прогресс по заданию

PATCH /api/v1/progress/{contentType}/{contentId}/flag     Поставить флаг «нужна проверка» (репетитор)
PATCH /api/v1/progress/{contentType}/{contentId}/resolve  Снять флаг проверки (репетитор)
```

---

### Свободные ответы на проверку — `/api/v1/review/submissions/`

```
POST /api/v1/review/submissions
```
```json
{
  "exerciseId": "uuid",
  "text": "Свободный ответ студента...",
  "mediaRefs": ["uuid-media"],     // опционально
  "assignmentId": "uuid",          // опционально
  "schoolId": "uuid"               // опционально — для роутинга к проверяющему
}
// 201 → SubmissionResponseDto
```

```
GET  /api/v1/review/submissions              Мои отправки
GET  /api/v1/review/submissions/pending      Ожидают проверки (репетитор/админ)
GET  /api/v1/review/submissions/{id}         Конкретная отправка
POST /api/v1/review/submissions/{id}/resubmit  Переотправить после доработки

PATCH /api/v1/review/submissions/{id}/review   Проверить (репетитор/админ)
```
```json
// body для review:
{
  "decision": "APPROVED",   // APPROVED | REJECTED | REVISION_REQUESTED
  "feedback": "Хорошая работа!",
  "score": 0.9
}
```

---

### Интервальные повторения (SRS / FSRS-6) — `/api/v1/srs/`

```
GET  /api/v1/srs/due                    Карточки к повторению сегодня
GET  /api/v1/srs/stats/me              Статистика по SRS
GET  /api/v1/srs/cards/{id}            Конкретная карточка
POST /api/v1/srs/cards/{id}/review     Оценить карточку
POST /api/v1/srs/cards/{id}/suspend    Приостановить карточку
POST /api/v1/srs/cards/{id}/unsuspend  Возобновить карточку
```

```json
// POST /srs/cards/{id}/review
{
  "rating": "GOOD",        // AGAIN | HARD | GOOD | EASY (алгоритм FSRS-6)
  "reviewedAt": "2026-05-21T10:00:00Z"  // опционально
}
// 429 — дневной лимит повторений исчерпан
```

---

## 8. Analytics Service

🔒 Все эндпоинты требуют Authorization (Bearer JWT). Доступ проверяется через SchoolMembership проекцию.

**Base path**: `/api/v1/analytics/schools/{schoolId}`.

### GET /api/v1/analytics/schools/{schoolId}/kpis

Ключевые метрики школы. Роль `TEACHER` не получает `at_risk`.

```json
// 200
{
  "role": "OWNER",
  "kpis": [
    {
      "key": "active_students_7d",
      "label": "Active students · 7d",
      "value": 412,
      "delta": "+18",           // null если история < 14 дней
      "trend": "up",            // "up" | "down" | "flat" | null
      "hint": "of 487 enrolled",
      "spark": [35, 42, 38, 55, 48, 62, 70]  // 7 точек, нормализованы 0–100, oldest→newest
    },
    {
      "key": "lessons_completed_7d",
      "label": "Lessons completed · 7d",
      "value": 1247,
      "delta": "+7%",
      "trend": "up",
      "hint": "across 14 courses",
      "spark": [28, 40, 32, 55, 48, 52, 68]
    },
    {
      "key": "pending_reviews",
      "label": "Pending reviews",
      "value": 7,
      "hint": "writing + speaking submissions",
      "sub": "oldest: 18 hours"  // опционально, только если value > 0
    },
    {
      "key": "at_risk",          // только для OWNER и ADMIN
      "label": "At-risk students",
      "value": 12,
      "delta": "-3",
      "trend": "up",
      "hint": "haven't logged in 7+ days"
    }
  ]
}
// 403 — не участник школы или недостаточная роль
// 404 — школа не найдена
```

---

### GET /api/v1/analytics/schools/{schoolId}/at-risk

Только для OWNER и ADMIN. Студенты без активности 7+ дней, сортировка по наибольшей неактивности.

```
?limit=10   // max 50, default 10
```

```json
// 200
{
  "students": [
    {
      "userId": "uuid",
      "name": "Maria Singh",
      "course": "Spanish Beginner (A1)",   // основной курс (последний по enrolledAt)
      "lastSeen": "2026-05-26T10:00:00.000Z",  // ISO, null если никогда не был активен
      "progress": 0.35,    // 0.0–1.0; 0 пока leafItemCount не заполнен
      "lang": "es"         // язык основного курса
    }
  ],
  "total": 12    // общий count до limit
}
// 403 — требуется OWNER или ADMIN
```

---

### GET /api/v1/analytics/schools/{schoolId}/courses/health

Доступен всем ролям дашборда. Сортировка по enrollment desc.

```json
// 200
{
  "courses": [
    {
      "courseId": "uuid",
      "name": "Spanish Beginner (A1)",
      "lang": "es",
      "enrollment": 48,        // активных студентов
      "completion": 0.62,      // 0.0–1.0; 0 пока leafItemCount = 0
      "trend": "up",           // "up" | "down" | "flat"
      "dropoff": true          // только если completion < порогового значения (default 0.3)
    }
  ]
}
```

---

### GET /api/v1/analytics/schools/{schoolId}/activity

Лента событий школы. Курсорная пагинация, новые первые.

```
?limit=6        // max 50, default 6
?cursor=<ISO>   // occurredAt последнего полученного элемента для следующей страницы
```

```json
// 200
{
  "items": [
    {
      "id": "uuid",
      "who": "Maria Singh",              // null если актор неизвестен
      "what": "published lesson",
      "target": "A2 · Restaurant role-play",  // null для событий без цели
      "occurredAt": "2026-06-02T16:00:00.000Z",
      "tag": "content"  // "people" | "content" | "review" | "milestone"
    }
  ],
  "nextCursor": "2026-06-02T15:00:00.000Z"  // null если больше нет
}
```

---

### GET /api/v1/analytics/schools/{schoolId}/students

Список студентов школы с производным статусом. Доступен любому участнику школы. Курсорная пагинация.

```
?segment=all        // "all" | "active" | "at-risk" | "new" | "finished" | "unassigned"
?search=Maria       // поиск по имени (опционально)
?limit=20           // max 100, default 20
?cursor=<userId>    // курсор пагинации (userId последнего элемента предыдущей страницы)
```

```json
// 200
{
  "items": [{
    "userId": "uuid",
    "name": "Maria Singh",
    "status": "active",       // "active" | "at-risk" | "new" | "finished" | "unassigned"
    "groups": [{ "id": "uuid", "name": "Level A2", "lang": "en", "level": "A2" }],
    "progress": 0.35,         // 0.0–1.0
    "lastSeen": "2026-06-03T10:00:00.000Z",  // null если не было активности
    "enrolledAt": "2026-05-01T00:00:00.000Z"
  }],
  "total": 48,
  "nextCursor": "uuid"   // null если последняя страница
}
// 404 — школа не найдена или нет доступа
```

**Правила производного статуса (сервер):**
- `finished` — enrollment COMPLETED
- `unassigned` — состоит в 0 группах
- `active` — последняя активность ≤ 7 дней
- `new` — enrolled ≤ 14 дней, активности не было
- `at-risk` — всё остальное (нет активности > 7 дней)
- `clash` — не выставляется до готовности scheduling-service

---

### GET /api/v1/analytics/schools/{schoolId}/students/{userId}

Детали студента: статус, группы, прогресс. Доступен любому участнику школы.

```json
// 200
{
  "userId": "uuid",
  "name": "Maria Singh",
  "status": "active",
  "progress": 0.35,
  "lastSeen": "2026-06-03T10:00:00.000Z",
  "enrolledAt": "2026-05-01T00:00:00.000Z",
  "completedAt": null,
  "groups": [{
    "id": "uuid",
    "name": "Level A2 — Spring 2026",
    "lang": "en",
    "level": "A2",
    "courseId": "uuid"
  }]
}
// 404 — школа не найдена, нет доступа, или userId не является студентом этой школы
```

---

### POST /api/v1/analytics/schools/{schoolId}/nudge

Только OWNER и ADMIN. Отправляет study-reminder всем at-risk студентам.

```json
// Request
{ "scope": "all-at-risk" }

// 200
{ "nudged": 12 }   // количество уведомлённых студентов (0 если нет at-risk)
// 403 — требуется OWNER или ADMIN
```

---

### BFF-композит (ssz-platform-web)

`GET /api/schools/[id]/dashboard` — объединяет все 4 виджета в один запрос.

```ts
// src/lib/dashboard/types.ts
type DashboardCompositeResponse = {
  schoolId: string;
  role: string;
  kpis: KpisPayload | { status: 'unavailable' };
  atRisk: AtRiskPayload | { status: 'unavailable' };
  courseHealth: CourseHealthPayload | { status: 'unavailable' };
  activity: ActivityPayload | { status: 'unavailable' };
  todaysClasses: { status: 'unavailable' };  // pending scheduling service
  trial: { status: 'unavailable' };          // pending billing service
};
```

`[id]` может быть UUID или slug — BFF резолвит через org-service. Каждый виджет независимо fault-tolerant.

---

## Форматы ошибок

### Auth Service (C# / ProblemDetails — RFC 7807)

```json
{
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.1",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Invalid credentials.",
  "instance": "/api/v1/auth/login"
}
```

### NestJS сервисы

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

---

## Swagger UI (dev, прямой доступ)

| Сервис | URL |
|---|---|
| Auth Service | http://localhost:5062/swagger |
| Auth Service OpenAPI JSON | http://localhost:5062/swagger/v1/swagger.json |
| User Profile Service | http://localhost:3001/api/docs |
| Organization Service | http://localhost:3002/api/docs |
| Content Service | http://localhost:3003/api/docs |
| Media Service | http://localhost:3004/api/docs |
| Notification Service | http://localhost:3005/api/docs |
| Exercise Engine Service | http://localhost:3006/api/docs |
| Learning Service | http://localhost:3007/api/docs |
| Analytics Service | http://localhost:3008/api/docs |

---

## Типичные пользовательские сценарии

### Студент: первый вход

1. `POST /api/v1/auth/register` → сохранить `userId`
2. `POST /api/v1/auth/login` → сохранить `accessToken` + `refreshToken`
3. `GET /api/v1/profiles/me` → профиль создаётся асинхронно, может быть 404 первые секунды
4. `POST /api/v1/profiles/me/student` → создать студенческий профиль
5. `POST /api/v1/profiles/me/student/languages` → добавить целевой язык

### Студент: выполнение упражнения

1. `GET /api/v1/exercises/{id}/display` → получить контент без ответов
2. `POST /api/v1/exercises/{id}/attempts` → начать попытку
3. `POST /api/v1/exercises/{id}/attempts/{attemptId}/submit` → отправить ответ
4. Если `requiresReview: true` → `POST /api/v1/review/submissions` для проверки репетитором

### Студент: повторение слов

1. `GET /api/v1/srs/due` → список карточек на сегодня
2. Для каждой: показать слово → `POST /api/v1/srs/cards/{id}/review` с rating

### Школьный администратор: добавить студента в группу (3-веточный flow)

1. `GET /api/v1/users/lookup?email=student@example.com`
   - **404** → `POST /api/v1/schools/{schoolId}/invitations` с `{ role:"STUDENT", kind:"register", targetGroupId }` → студент получает письмо регистрации
   - **200, roles включает "student"** → напрямую: `POST /api/v1/schools/{schoolId}/members { userId, role:"STUDENT" }` + `POST /api/v1/schools/{schoolId}/groups/{groupId}/members { userId }`
   - **200, roles без "student"** → `POST /api/v1/schools/{schoolId}/invitations` с `{ role:"STUDENT", kind:"onboard_existing", targetGroupId }` → пользователь получает ссылку онбординга
2. После `accept` (ветки A/C): пользователь попадает в школу и группу автоматически

### Школьный администратор: создать и опубликовать группу-когорту

1. `POST /api/v1/schools/{schoolId}/groups` с `{ name, courseId, lang, level, mode, capacityMax, startDate, endDate }`
2. `POST /api/v1/schools/{schoolId}/groups/{groupId}/teachers` с `{ userId, role:"primary" }` → назначить primary-учителя
3. `POST /api/v1/schools/{schoolId}/groups/{groupId}/members` → добавить студентов
4. `POST /api/v1/schools/{schoolId}/groups/{groupId}/publish` → перевести в `active` (проверяет courseId + primary)
   - При публикации: entitlements на курс выдаются всем участникам автоматически
5. `POST /api/v1/assignments/group` → выдать задание всей группе

### Репетитор (школа): создание задания для группы

1. `POST /api/v1/auth/register` с `role: "school_admin"` → создать аккаунт
2. `POST /api/v1/schools` с `{ "type": "ONLINE" }` → создать школу
3. `POST /api/v1/schools/{schoolId}/invitations` → пригласить студентов
4. `POST /api/v1/schools/{schoolId}/groups` → создать группу
5. `POST /api/v1/schools/{schoolId}/groups/{groupId}/members` → добавить студентов в группу
6. `POST /api/v1/assignments/group` → выдать задание всей группе

### Школьный администратор: мониторинг дашборда

Через BFF-композит (ssz-platform-web):
1. `GET /api/schools/{slugOrId}/dashboard` → composite response со всеми виджетами
   - `kpis.kpis` → KPI strip (4 метрики с трендами)
   - `atRisk.students` → список неактивных студентов
   - `courseHealth.courses` → health каждого курса
   - `activity.items` → лента событий

Напрямую к Analytics Service:
1. `GET /api/v1/analytics/schools/{id}/kpis` → KPI с value + delta + trend + spark
2. `GET /api/v1/analytics/schools/{id}/at-risk?limit=3` → top at-risk студенты
3. `GET /api/v1/analytics/schools/{id}/students?segment=at-risk` → полный список с фильтром по сегменту
4. `GET /api/v1/analytics/schools/{id}/students/{userId}` → детали конкретного студента
5. `POST /api/v1/analytics/schools/{id}/nudge { "scope": "all-at-risk" }` → разослать напоминания

### Репетитор (частный): пригласить студента

1. `POST /api/v1/auth/register` с `role: "tutor"` → создать аккаунт
2. `POST /api/v1/tutoring/group` → создать тьюторинг-группу
3. `POST /api/v1/tutoring/group/invitations` → пригласить студента по email
4. Студент: `POST /api/v1/tutoring/invitations/{token}/accept` → принять
5. `POST /api/v1/assignments` → выдать задание конкретному студенту

### Загрузка аватара пользователя

1. `POST /api/v1/media/uploads/request` с `entityType: "profile_avatar"` → получить `{ assetId, uploadUrl }`
2. `PUT {uploadUrl}` с бинарным телом файла (без Authorization — прямо на MinIO :9000)
3. `POST /api/v1/media/uploads/{assetId}/finalize` → подтвердить загрузку
4. `GET /api/v1/media/assets/{assetId}` → дождаться `status: "READY"`, взять `url`
5. `PATCH /api/v1/profiles/me` с `{ "avatarUrl": "<url из шага 4>" }` → сохранить в профиле

> `profile_avatar` → публичный bucket → `url` постоянный, не истекает. Можно сразу писать в профиль.
