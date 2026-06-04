# Backend TODO

> Задачи для бэкенда, которые нужны для реализации фич на фронте.
> Последнее обновление: 2026-06-004

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

## Школьные группы/когорты (`organization-service`) — ✅ Базовый CRUD / ⏳ требует расширения

> Базовый CRUD реализован. Для Group Management спеки группа должна стать **полноценной когортой**
> (курс, учителя, ёмкость, статус, term-даты). Детальное расширение модели — ниже в разделе
> **«Group Management — расширение когорты»**. Расписание выносится в **scheduling-service** (новый).

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

| #   | Что                             | Статус                                    |
| --- | ------------------------------- | ----------------------------------------- |
| 0   | Роль зрителя (`members[].role`) | ✅ Готово                                 |
| 1   | KPI-агрегаты + sparkline        | ✅ Готово                                 |
| 2   | Activity feed / audit           | ✅ Готово                                 |
| 3   | Course health                   | ✅ Готово                                 |
| 4   | At-risk students                | ✅ Готово                                 |
| 5   | Publish-approval queue          | ⚠️ Отдельный workstream                   |
| 6   | Scheduling + тип школы          | `type` ✅; scheduling ❌ отдельный сервис |
| 7   | Onboarding status               | ✅ Frontend-композит                      |
| 8   | Trial/billing                   | ❌ Отдельный billing-сервис               |
| 9   | Nudge at-risk mutation          | ✅ Готово                                 |

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

| Задача                                            | Статус                                              |
| ------------------------------------------------- | --------------------------------------------------- |
| Группы/когорты в школе — API                      | ✅ Готово                                           |
| Связь репетитор↔студент — API                     | ✅ Готово                                           |
| Групповые задания                                 | ✅ Готово                                           |
| `GET /api/v1/me/entitlements`                     | ✅ Готово                                           |
| `GET /api/v1/exercises/{id}/attempts`             | ✅ Готово                                           |
| `GET /api/v1/progress/{type}/{id}`, flag, resolve | ✅ Готово                                           |
| School CRUD + slug + все поля                     | ✅ Готово                                           |
| `School.type: ONLINE\|HYBRID`                     | ✅ Готово (D.2)                                     |
| KPI-агрегаты + sparkline-серии                    | ✅ Готово (B.4)                                     |
| At-risk students                                  | ✅ Готово (B.5)                                     |
| Course health                                     | ✅ Готово (B.6)                                     |
| Activity feed / audit                             | ✅ Готово (B.7)                                     |
| Nudge at-risk mutation                            | ✅ Готово (D.1)                                     |
| BFF composite `GET /api/schools/[id]/dashboard`   | ✅ Готово (C.1, web)                                |
| Publish-approval queue                            | ⚠️ Нужно решение (отдельный workstream)             |
| Scheduling / Today's classes                      | ❌ Отдельный сервис (см. ниже «Scheduling-service») |
| Trial/billing                                     | ❌ Отдельный сервис                                 |
| Group Management — расширение когорты             | ❌ Нужно (см. ниже)                                 |
| Scheduling-service (slots/lessons/conflicts)      | ❌ Новый сервис (см. ниже)                          |
| Student Management — доработки                    | ⏳ Частично (invite/lookup нужны)                   |

---

# ▣ Group Management & Student Management — бэкенд-план

> Frontend-спеки: [`plan/spec/Group-Management-Implementation-Spec.md`](plan/spec/Group-Management-Implementation-Spec.md),
> [`plan/spec/Student-Management-Implementation-Spec.md`](plan/spec/Student-Management-Implementation-Spec.md).
> Frontend-планы: [`plan/group-management/`](plan/group-management/), [`plan/student-management/`](plan/student-management/).
>
> **Согласованные архитектурные решения (2026-06-04):**
>
> 1. **Расписание (slots → lessons → конфликты → нагрузка → бронь комнат) выносится в новый
>    `scheduling-service`.** До его готовности фронт **мокает весь schedule-слой** детерминированно.
> 2. **Группа связана ровно с одним курсом** (`course_id`). Пока группа активна, курс **авто-доступен**
>    всем её участникам (entitlement выдаётся при вступлении, отзывается при выходе/архивации).
> 3. Атрибуты нагрузки учителя (`max_weekly_hours`, `availability`) живут в **org-service** рядом с
>    членством (школа-специфичны). Языки преподавания берём из tutor-профиля (profile-service).
> 4. **term-даты** (`start_date`/`end_date`) живут на группе в **org-service**; scheduling-service
>    читает их как окно генерации уроков.

---

## 1. Group Management — расширение когорты (`organization-service`)

### 1.1 Расширить сущность `Group`

К существующей таблице группы добавить поля:

| Поле           | Тип                                               | Назначение                               |
| -------------- | ------------------------------------------------- | ---------------------------------------- |
| `course_id`    | UUID FK → `content.container`, **nullable**       | курс когорты (в `draft` может быть пуст) |
| `lang`         | CHAR(2), ISO 639-1                                | язык обучения                            |
| `level`        | VARCHAR                                           | CEFR `A1..C2`                            |
| `status`       | ENUM(`draft`,`active`,`archived`) DEFAULT `draft` | новые группы рождаются `draft`           |
| `mode`         | ENUM(`online`,`in_person`) DEFAULT `online`       | для HYBRID-школ добавляет комнату в слот |
| `capacity_min` | INT                                               | минимум для алерта `under`               |
| `capacity_max` | INT                                               | максимум для алерта `over`               |
| `start_date`   | DATE                                              | начало term                              |
| `end_date`     | DATE                                              | конец term                               |

`memberCount` уже есть; `studentCount` = denormalized по `group_member`.

`PATCH /groups/{id}` должен принимать все новые поля (частично). `POST /groups` — принимать их при
создании (status фиксируется `draft`).

**Переход draft → active (публикация):** отдельное действие — отдельный эндпоинт или `PATCH {status}`.
Сервер при публикации обязан проверить инвариант **«не может быть рождена сломанной»**: есть
`primary` учитель, есть `course_id`, есть ≥1 слот (слот проверяется в scheduling-service —
см. §3.6 кросс-сервисную проверку). Без primary → `409 { error: 'no-primary' }`.

```
POST /api/v1/schools/{schoolId}/groups/{groupId}/publish   → 200 | 409 { blockers:[...] }
POST /api/v1/schools/{schoolId}/groups/{groupId}/archive   → 204
```

`DELETE` (hard) — только если группа `draft`/`archived` и пуста и не имела уроков; иначе только
`archive` (мягко). Фронт это отражает (спека §7: «hard-delete only when empty + never run»).

### 1.2 `group_teacher` — junction-таблица ролей учителей (NEW)

Одна таблица на все три роли (primary / co-primary / substitute):

```
group_teacher
├─ id            UUID
├─ group_id      FK → group
├─ user_id       FK → school_member.user_id   (должен быть TEACHER в этой школе)
├─ role          ENUM(primary | co_primary | substitute)
├─ from_date     DATE NULL    -- только substitute (окно замены)
├─ to_date       DATE NULL    -- только substitute
├─ reason        TEXT NULL    -- ОБЯЗАТЕЛЕН для substitute (спека §5)
└─ created_at

constraints:
  UNIQUE (group_id) WHERE role='primary'       -- ровно один primary
  UNIQUE (group_id) WHERE role='co_primary'    -- максимум один co-primary
  -- substitute: 0..N, окна могут пересекаться
```

Эндпоинты (спека §6):

```
POST   /api/v1/schools/{schoolId}/groups/{groupId}/teachers
       { role:'primary'|'co_primary'|'substitute', userId, from?, to?, reason?, override?:bool }
DELETE /api/v1/schools/{schoolId}/groups/{groupId}/teachers/{userId}?role=...
```

**Серверная валидация (авторитетная, спека §6 «validation twice, truth once»):**

1. **Language fit** (hard block): учитель должен преподавать `group.lang` (langs из tutor-профиля).
   Нет языка → `409`, не overridable.
2. **Time conflict** (danger, overridable): слот группы пересекается с другой активной группой
   этого учителя → требует кросс-вызов в scheduling-service (§3). Принять при `?override=true`.
3. **Workload** (warn, overridable): назначение перебивает `max_weekly_hours`.

Ответ при наличии проблем: `200 { ok:true, warnings:[{type,with,day,time}] }` (если override)
или `409 { conflicts:[...], warnings:[...] }`.

Удаление primary, оставляющее группу без primary → разрешено, но группа немедленно получает
алерт `no-primary` (и не может быть `active`).

> **Substitutes layer, never swap.** Primary — teacher-of-record для отчётности. Замена накладывается
> окном `[from,to]`; внутри окна урок рендерит substitute, вне — primary. Это логика scheduling-service.

### 1.3 `school_teacher` — атрибуты нагрузки (NEW)

```
school_teacher
├─ school_id, user_id   (PK, FK → school_member)
├─ max_weekly_hours  INT
└─ availability      JSONB   -- [{ weekday, start, end }]  окна доступности
```

Нужен read-эндпоинт для timetable/assign-модалок и для аналитики:

```
GET  /api/v1/schools/{schoolId}/teachers
     → [{ userId, name, avatarUrl, langs[], maxWeeklyHours, availability[] }]
PATCH /api/v1/schools/{schoolId}/teachers/{userId}   { maxWeeklyHours?, availability? }
```

`langs` денормализуем из profile-service (tutor languages) при ответе.

### 1.4 Авто-доступ к курсу по членству в группе (оркестрация)

> Решение №2: пока группа активна, её `course_id` доступен всем участникам.

При событиях:

- **студент добавлен в активную группу** → выдать entitlement на `group.course_id`
  (content-service `POST /containers/{course_id}/entitlements`, level `FREE_WITHIN_SCHOOL`,
  `schoolId` в контексте).
- **студент удалён из группы** → отозвать entitlement (если курс не доступен ему через другую группу).
- **группа archived** → отозвать entitlements курса у всех участников (с той же оговоркой).
- **группа publish (draft→active) с уже добавленными студентами** → выдать entitlements всем.

Реализовать через доменные события (`group.member.added`, `group.member.removed`, `group.archived`)
и подписчика в content-service, либо синхронно в org-service. Идемпотентно.

### 1.5 GET-ответы должны вернуть расширенную форму

`GET /groups` (список) и `GET /groups/{id}` (детали) дополнить полями: `courseId, courseName, lang,
level, status, mode, capacity{min,max}, startDate, endDate, studentCount, teachers:[{userId, role,
from, to, reason}]`. Слоты/конфликты/уроки — из scheduling-service (или мок).

---

## 2. Student Management — доработки

### 2.1 Список студентов школы с производным статусом

Спека §6: `GET /schools/{slug}/students` → студенты + статус + членства. Сейчас отдельного
эндпоинта нет (есть только `at-risk` из analytics и `members` из org).

```
GET /api/v1/schools/{schoolId}/students?segment=&search=&limit=&cursor=
→ { items: [{
      userId, name, email, avatarUrl, lang, level,
      status: 'active'|'at-risk'|'new'|'finished'|'clash'|'unassigned',  // ДЕРИВИРОВАН на сервере
      groups: [{ id, name, lang, level }],
      progress: 0..1, lastSeen: ISO|null, enrolledAt: ISO
    }], total, nextCursor }
```

**Статус деривируется на сервере** (спека §2, «never store a manually-set status»):

- `active` — активность ≤7 дней (есть в analytics).
- `at-risk` — нет активности 7+ дней или stalled progress (analytics уже считает at-risk).
- `new` — enrolled ≤14 дней.
- `finished` — завершил курс (enrollment complete).
- `unassigned` — 0 групп (derived из `group_member`).
- `clash` — состоит в 2+ группах с пересекающимися слотами → **зависит от scheduling-service**
  (до него — статус `clash` мокается/не выставляется).

Источники разнесены по сервисам (org: membership; analytics: activity/progress; scheduling: clash).
**Рекомендация:** агрегировать в analytics-service (у него уже есть проекции активности и членства),
либо собирать BFF-композитом на фронте. Зафиксировать при реализации.

### 2.2 `GET /schools/{schoolId}/students/{userId}` — детали

`{ userId, name, email, avatarUrl, lang, level, status, progress, lastSeen, enrolledAt,
   groups:[{ id, name, lang, level, schedule, teachers:[{userId,name,role}] }], clashes:[...] }`.
Учителя выводятся из членства в группах (read-only, спека: «teachers are read-only here»).

### 2.3 Добавление студентов в группу — 3-веточный flow (КЛЮЧЕВОЕ)

Пользовательский сценарий (требование владельца):

| Ветка                           | Условие                          | Действие бэкенда                                                                                                                                                                  |
| ------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Нет в системе**            | email не найден                  | инвайт `register` → письмо со ссылкой → студент регистрируется → онбординг → попадает в школу+группу                                                                              |
| **B. Есть, роль `student`**     | userId найден, есть роль student | прямо привязать: `POST /groups/{gid}/members` (без письма)                                                                                                                        |
| **C. Есть, БЕЗ роли `student`** | userId найден, нет роли student  | инвайт `onboard-existing` → письмо со ссылкой на **онбординг** (не регистрацию) → по клику добавить роль `student` в профиль + создать student-профиль + привязать к школе+группе |

**Чего не хватает в бэкенде:**

**(1) Резолв email → пользователь + его роли** (нужен, чтобы фронт/BFF выбрал ветку):

```
GET /api/v1/users/lookup?email=...        (auth- или profile-service, требует school admin)
→ 200 { userId, roles:['student'|'tutor'|...], displayName? }  |  404 (нет такого)
```

> Приватность: доступ только OWNER/ADMIN школы; не раскрывать лишнего, только факт наличия + роли.

**(2) Инвайт с типом и целевой группой.** Расширить существующий
`POST /schools/{schoolId}/invitations`:

```
{ email, role:'STUDENT', targetGroupId?, kind:'register'|'onboard-existing' }
→ 201 { invitationId, token, kind, expiresAt }
```

`POST /schools/invitations/{token}/accept` по токену:

- `kind='register'`: пользователь уже зарегистрировался → выдать роль `student` (если нет) →
  создать student-профиль → добавить в школу (`STUDENT`) → добавить в `targetGroupId`.
- `kind='onboard-existing'`: пользователь уже залогинен (существующий) → **выдать роль `student`**
  (`auth/roles`) → создать student-профиль → добавить в школу+группу. **Без повторной регистрации.**

**(3) Прямое добавление (ветка B)** уже есть: `POST /groups/{gid}/members { userId }` (после lookup).
Должно дополнительно убедиться, что user — `STUDENT`-член школы (если нет — добавить как члена школы
с ролью STUDENT перед вступлением в группу).

**Капасити/клэш-проверка при добавлении** (спека §6): `POST /groups/{gid}/members?override=true`
ре-валидирует ёмкость + кросс-групповой клэш (clash — из scheduling-service), `200 { ok, warnings:[...] }`
или `409`. Удаление участника — мягко, с Undo на фронте (просто повторный POST при отмене).

### 2.4 Bulk message + сегменты (спека §6) — низкий приоритет

```
POST /schools/{schoolId}/students/message   { audience:{segment|userIds[]}, subject, body }
POST /schools/{schoolId}/students/segments   { name, predicate }   → сохранённый фильтр
GET  /schools/{schoolId}/students/segments
```

Сообщения идут через notification-service. Nudge уже есть (analytics `/nudge`). Можно отложить —
фронт строит сегменты как клиентские предикаты, «Save segment» прячем за фиче-флагом до бэкенда.

---

## 3. Scheduling-service (НОВЫЙ сервис) — требования

> Владеет **всем волатильным таймтейблом**: недельный паттерн (slots) → датированные уроки (lessons)
> → конфликты → нагрузка учителей → бронь комнат → (позже) календарь/видео.
> До готовности сервиса фронт мокает весь слой детерминированно; референс-математика конфликтов/нагрузки
> уже есть в [`src/lib/dashboard/operations.ts`](../src/lib/dashboard/operations.ts) — её портировать на сервер.

### 3.1 `slot` — недельный паттерн (привязан к группе)

```
slot
├─ id, group_id (ссылка на org-service Group), school_id
├─ weekday    ENUM(mon..sun)
├─ start_time TIME      -- "18:00"
├─ end_time   TIME      -- "19:30"
└─ room       VARCHAR   -- "Online" для online-групп; имя комнаты для hybrid
```

```
GET    /api/v1/scheduling/groups/{groupId}/slots
PUT    /api/v1/scheduling/groups/{groupId}/slots     -- заменить весь набор (slot-editor сохраняет целиком)
POST   /api/v1/scheduling/groups/{groupId}/slots
DELETE /api/v1/scheduling/groups/{groupId}/slots/{slotId}
```

### 3.2 `lesson` — материализованные датированные занятия

Генерируются из `slots + group.start_date + group.end_date − holidays`:

```
lesson
├─ id, group_id, school_id
├─ date       DATE
├─ start_time TIME, end_time TIME
├─ teacher_id UUID     -- с учётом активной substitution на эту дату!
├─ room       VARCHAR
└─ status     ENUM(scheduled | moved | cancelled)
```

```
GET   /api/v1/scheduling/groups/{groupId}/lessons?from=&to=
GET   /api/v1/scheduling/groups/{groupId}/lessons/next?limit=    -- «ближайшие уроки» (спека §5 Schedule tab)
PATCH /api/v1/scheduling/lessons/{lessonId}    { date?, start?, end?, teacherId?, status }  -- override одного урока
```

### 3.3 Конфликты и нагрузка учителей (авторитетно)

Портировать математику из `operations.ts` (`slotsOverlap`, `groupAlerts`, `teacherConflicts`,
`teacherLoad`, `schoolConflictCount`):

```
GET /api/v1/scheduling/schools/{schoolId}/conflicts
    → [{ teacherId, groupA, groupB, day, time }]
GET /api/v1/scheduling/schools/{schoolId}/teachers/{userId}/load
    → { hours, max, pct, overloaded, groups, conflicts }
GET /api/v1/scheduling/schools/{schoolId}/timetable     -- для Teacher Timetable view (спека §5)
    → { teachers:[{ userId, hours, max, groups, conflicts, lessons:[{day,start,end,groupId,lang,isSub}] }] }
```

Конфликт = пересечение слотов одного учителя по разным активным группам (тот же weekday + пересечение времени).

### 3.4 Кросс-групповой клэш студента (для статуса `clash`)

```
GET /api/v1/scheduling/schools/{schoolId}/students/{userId}/clashes
    → [{ groupA, groupB, day, time }]   -- пересечение слотов групп, где состоит студент
```

Используется Student Management для статуса `clash` и pre-check при add-to-group.

### 3.5 Бронь комнат (HYBRID) — позже

`room`-доступность, чтобы слот/урок не садился в занятую комнату. Можно вторым этапом.

### 3.6 Кросс-сервисная проверка при публикации группы

org-service `POST /groups/{id}/publish` должен убедиться, что у группы ≥1 слот — синхронный вызов
`GET /scheduling/groups/{id}/slots` или scheduling-service публикует событие готовности. Зафиксировать
контракт при реализации.

### 3.7 Дашбордные агрегаты — остаются в analytics

Дашборд уже ждёт `analytics/.../dashboard/groups-health` и `/teacher-load`
([`src/lib/dashboard/queries.ts`](../src/lib/dashboard/queries.ts)). Analytics-service должен потреблять
события scheduling-service (slots/lessons changed) в свою проекцию и отдавать эти агрегаты. То есть
**source of truth — scheduling-service, дашбордная витрина — analytics**.

### 3.8 На будущее

ICS-экспорт, синхронизация с внешними календарями, видеозвонки (ссылка на урок), напоминания о занятии
через notification-service, праздники/исключения term-календаря.

---

## Сводка новых задач (Group/Student Management)

| #   | Сервис                 | Задача                                                                                 | Приоритет  | Блокирует фронт             |
| --- | ---------------------- | -------------------------------------------------------------------------------------- | ---------- | --------------------------- |
| 1.1 | org                    | Расширить `Group` (course/lang/level/status/mode/capacity/term-даты) + publish/archive | 🔴 высокий | список, детали, визард      |
| 1.2 | org                    | `group_teacher` junction + assign/remove + валидация                                   | 🔴 высокий | teacher-assign, detail      |
| 1.3 | org                    | `school_teacher` (maxWeeklyHours/availability) + GET teachers                          | 🟠 средний | timetable, нагрузка         |
| 1.4 | org+content            | Авто-entitlement курса по членству                                                     | 🟠 средний | (фоновая логика)            |
| 1.5 | org                    | Расширенные GET-ответы групп                                                           | 🔴 высокий | список, детали              |
| 2.1 | analytics/BFF          | Список студентов + производный статус                                                  | 🔴 высокий | students list               |
| 2.2 | analytics/org          | Детали студента                                                                        | 🔴 высокий | student detail              |
| 2.3 | auth/org               | email-lookup + 3-веточный invite/accept                                                | 🔴 высокий | enroll/add-student          |
| 2.4 | notif/org              | Bulk message + сегменты                                                                | 🟢 низкий  | (фиче-флаг)                 |
| 3.x | **scheduling (новый)** | slots/lessons/conflicts/load/timetable/clashes                                         | 🟠 средний | расписание, timetable (мок) |
