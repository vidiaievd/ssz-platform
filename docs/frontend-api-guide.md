# SSZ Platform — Frontend API Guide

> Инструкция для Claude Code при работе над фронтендом (веб или мобайл).
> Последнее обновление: 2026-05-31

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
| Notification Service | NestJS | :3005 | Running (только email) |
| Exercise Engine Service | NestJS | :3006 | Running |
| Learning Service | NestJS | :3007 | Running |

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
  "city": "Kyiv"                       // опционально, «Online» для дистанционных
}
// 201 → SchoolResponseDto (id, name, slug, website, contactEmail, city, ownerId, members, ...)
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

Обновить данные школы (только OWNER/ADMIN). Все поля опциональны: `name`, `slug`, `description`, `avatarUrl`, `website`, `contactEmail`, `city`. `204`.

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

Отправить приглашение по email.

```json
{
  "email": "teacher@example.com",
  "role": "TEACHER"  // ADMIN | CONTENT_ADMIN | TEACHER | STUDENT (не OWNER)
}
// 201 → InvitationResponseDto (с токеном для ссылки)
```

#### POST /api/v1/schools/invitations/{token}/accept

Принять приглашение по токену из письма. `204`.

---

### Группы в школе — `/api/v1/schools/{schoolId}/groups/`

Студент может состоять в нескольких группах одновременно.

**Права:** создание/редактирование/удаление групп — OWNER/ADMIN; управление участниками — OWNER/ADMIN/TEACHER; просмотр — любой участник школы.

#### POST /api/v1/schools/{schoolId}/groups

```json
{ "name": "Level A2 — Spring 2026", "description": "..." }
// 201 → { "id": "uuid" }
```

#### GET /api/v1/schools/{schoolId}/groups

Список групп (summary). `200 → SchoolGroupSummaryResponseDto[]`

```json
[{ "id": "uuid", "name": "...", "description": "...", "memberCount": 12, "createdAt": "..." }]
```

#### GET /api/v1/schools/{schoolId}/groups/{groupId}

Детали группы + список участников. `200 → SchoolGroupResponseDto`

```json
{
  "id": "uuid", "schoolId": "uuid", "name": "...", "description": "...",
  "members": [{ "id": "uuid", "userId": "uuid", "addedAt": "..." }],
  "createdAt": "...", "updatedAt": "..."
}
```

#### PATCH /api/v1/schools/{schoolId}/groups/{groupId}

Обновить `name` и/или `description`. `204`.

#### DELETE /api/v1/schools/{schoolId}/groups/{groupId}

Мягкое удаление группы. `204`.

#### POST /api/v1/schools/{schoolId}/groups/{groupId}/members

Добавить участника школы в группу.

```json
{ "userId": "uuid" }  // userId должен быть членом школы
// 204 No Content
// 403 — userId не является участником школы
```

#### DELETE /api/v1/schools/{schoolId}/groups/{groupId}/members/{userId}

Удалить участника из группы (или уйти самому). `204`.

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

Загрузка файлов через S3-совместимый MinIO (два шага: presigned URL → upload → finalize).

### POST /api/v1/media/uploads/request

Запросить presigned URL для загрузки.

```json
// Request
{
  "mimeType": "image/jpeg",
  "sizeBytes": 204800,
  "originalFilename": "avatar.jpg",
  "entityType": "profile_avatar",  // тип сущности
  "entityId": "uuid-пользователя"
}

// 201 → { "assetId": "uuid", "uploadUrl": "https://minio/...", "expiresAt": "..." }
```

Затем сделать PUT на `uploadUrl` с бинарным телом файла (без токена авторизации, прямо на MinIO).

### POST /api/v1/media/uploads/{assetId}/finalize

Сообщить серверу что файл загружен. Запускает фоновую обработку.

```
// 204 No Content
// 404 — assetId не найден
// 422 — файл не обнаружен в хранилище
```

### GET /api/v1/media/assets

Список своих файлов. `200`.

### GET /api/v1/media/assets/{assetId}

Конкретный ассет с URL для скачивания (presigned для приватных). `200` или `404`.

### DELETE /api/v1/media/assets/{assetId}

Удалить ассет. `204`.

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

### Репетитор (школа): создание задания для группы

1. `POST /api/v1/auth/register` с `role: "school_admin"` → создать аккаунт
2. `POST /api/v1/schools` → создать школу
3. `POST /api/v1/schools/{schoolId}/invitations` → пригласить студентов
4. `POST /api/v1/schools/{schoolId}/groups` → создать группу
5. `POST /api/v1/schools/{schoolId}/groups/{groupId}/members` → добавить студентов в группу
6. `POST /api/v1/assignments/group` → выдать задание всей группе

### Репетитор (частный): пригласить студента

1. `POST /api/v1/auth/register` с `role: "tutor"` → создать аккаунт
2. `POST /api/v1/tutoring/group` → создать тьюторинг-группу
3. `POST /api/v1/tutoring/group/invitations` → пригласить студента по email
4. Студент: `POST /api/v1/tutoring/invitations/{token}/accept` → принять
5. `POST /api/v1/assignments` → выдать задание конкретному студенту

### Загрузка файла (аватар)

1. `POST /api/v1/media/uploads/request` → получить `{ assetId, uploadUrl }`
2. `PUT {uploadUrl}` с бинарным телом файла (без Authorization — прямо на MinIO)
3. `POST /api/v1/media/uploads/{assetId}/finalize` → запустить обработку
4. `PATCH /api/v1/profiles/me` → обновить `avatarUrl` значением из ассета
