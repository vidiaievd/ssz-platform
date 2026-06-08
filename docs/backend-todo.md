# Backend TODO

> Задачи для бэкенда, которые нужны для реализации фич на фронте.
> Последнее обновление: 2026-06-08

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

## Школьные группы/когорты (`organization-service`) — ✅ Полностью реализовано

> Группа является полноценной когортой: курс, учителя, ёмкость, статус, term-даты.
> Расписание выносится в **scheduling-service** (новый, фронт мокает).

```
POST   /api/v1/schools/{schoolId}/groups               { name, description?, mode?, courseId?, lang?, level?, capacityMin?, capacityMax?, startDate?, endDate? }
GET    /api/v1/schools/{schoolId}/groups               → SchoolGroupSummaryResponseDto[] (все поля когорты + teachers[])
GET    /api/v1/schools/{schoolId}/groups/{groupId}     → SchoolGroupResponseDto (все поля + members[] + teachers[])
PATCH  /api/v1/schools/{schoolId}/groups/{groupId}     { все поля опциональны }
POST   /api/v1/schools/{schoolId}/groups/{groupId}/publish   → 200 | 409 { blockers: ['no-course'|'no-primary'] }
POST   /api/v1/schools/{schoolId}/groups/{groupId}/archive   → 204
DELETE /api/v1/schools/{schoolId}/groups/{groupId}     Hard-delete только для пустых draft/archived групп
POST   /api/v1/schools/{schoolId}/groups/{groupId}/members   { userId }
DELETE /api/v1/schools/{schoolId}/groups/{groupId}/members/{userId}
POST   /api/v1/schools/{schoolId}/groups/{groupId}/teachers  { userId, role, fromDate?, toDate?, reason?, override? }
DELETE /api/v1/schools/{schoolId}/groups/{groupId}/teachers/{userId}?role=...
```

Учительские роли: `primary` | `co_primary` | `substitute`. Валидация: language fit (hard, от profile-service), workload (warn, overridable).
Teacher attrs школы: `GET /api/v1/schools/{schoolId}/teachers`, `PATCH /api/v1/schools/{schoolId}/teachers/{userId}`.

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

### ✅ 6. Today's classes — `GET /scheduling/schools/{id}/...` — реализовано в scheduling-service

`School.type: ONLINE|HYBRID` добавлен (D.2). Scheduling-service реализован (2026-06-08).

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
| 6   | Scheduling + тип школы          | `type` ✅; scheduling ✅ (2026-06-08)    |
| 7   | Onboarding status               | ✅ Frontend-композит                      |
| 8   | Trial/billing                   | ❌ Отдельный billing-сервис               |
| 9   | Nudge at-risk mutation          | ✅ Готово                                 |

---

## Флоу без бэкенда — продуктовые решения

### Scheduling / live-уроки / календарь

Нет API бронирования. `School.type: HYBRID` добавлен. Нужен новый сервис (слоты, бронь, видеозвонок,
absence/подмены/forecast). Полный план — §3 + §4 «Teacher Management».

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
| Scheduling / Today's classes                      | ✅ Готово (scheduling-service, 2026-06-08)          |
| Trial/billing                                     | ❌ Отдельный сервис                                 |
| Group Management — расширение когорты (1.1–1.5)  | ✅ Готово (2026-06-04)                              |
| Student Management — доработки (2.1–2.3)          | ✅ Готово (2026-06-04)                              |
| Scheduling-service (slots/lessons/conflicts/absences/substitutions/curriculum/alerts) | ✅ Готово (2026-06-08) |
| Teacher Management (absence/подмены/forecast/roles) | ✅ Готово (2026-06-08) |

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

## 1. Group Management — расширение когорты (`organization-service`) — ✅ Готово

### 1.1 Расширить сущность `Group` ✅

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

### 1.2 `group_teacher` — junction-таблица ролей учителей ✅

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

### 1.3 `school_teacher` — атрибуты нагрузки ✅

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

### 1.4 Авто-доступ к курсу по членству в группе (оркестрация) ✅

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

### 1.5 GET-ответы должны вернуть расширенную форму ✅

`GET /groups` (список) и `GET /groups/{id}` (детали) дополнить полями: `courseId, courseName, lang,
level, status, mode, capacity{min,max}, startDate, endDate, studentCount, teachers:[{userId, role,
from, to, reason}]`. Слоты/конфликты/уроки — из scheduling-service (или мок).

---

## 2. Student Management — доработки — ✅ Готово (2.1–2.3)

### 2.1 Список студентов школы с производным статусом ✅

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

### 2.2 `GET /analytics/schools/{schoolId}/students/{userId}` — детали ✅

`{ userId, name, email, avatarUrl, lang, level, status, progress, lastSeen, enrolledAt,
   groups:[{ id, name, lang, level, schedule, teachers:[{userId,name,role}] }], clashes:[...] }`.
Учителя выводятся из членства в группах (read-only, спека: «teachers are read-only here»).

### 2.3 Добавление студентов в группу — 3-веточный flow ✅

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

### 2.4 Bulk message + сегменты (спека §6) — ❌ отложено (фиче-флаг)

```
POST /schools/{schoolId}/students/message   { audience:{segment|userIds[]}, subject, body }
POST /schools/{schoolId}/students/segments   { name, predicate }   → сохранённый фильтр
GET  /schools/{schoolId}/students/segments
```

Сообщения идут через notification-service. Nudge уже есть (analytics `/nudge`). Можно отложить —
фронт строит сегменты как клиентские предикаты, «Save segment» прячем за фиче-флагом до бэкенда.

---

## 3. Scheduling-service (НОВЫЙ сервис) — ✅ Реализован (2026-06-08)

> Владеет **всем волатильным таймтейблом**: недельный паттерн (slots) → датированные уроки (lessons)
> → конфликты → нагрузка учителей → **отпуска (absence) → подмены (substitution engine)** → бронь комнат
> → прогноз нагрузки → (позже) календарь/видео.
> До готовности сервиса фронт мокает весь слой детерминированно; референс-математика конфликтов/нагрузки/
> ранжирования/прогноза уже есть в [`src/lib/groups/operations.ts`](../src/lib/groups/operations.ts)
> (расширяется формулами спеки) — её портировать на сервер.
>
> **Обновлено 2026-06-08 под спеку Teacher Management**
> ([`plan/spec/teacher-workload-and-resourcing/`](plan/spec/teacher-workload-and-resourcing/),
> frontend-план [`plan/teacher-management/`](plan/teacher-management/)). Согласованные решения:
>
> 1. **Объём** — полная спека (5 поверхностей): Workload Command Center, Teacher Schedule View, Substitute
>    Console, Curriculum Planner, Forecast.
> 2. **Absence + substitution-движок живут в scheduling-service** (он владеет уроками/нагрузкой).
>    `group_teacher role=substitute` (org-service) — **teacher-of-record-проекция** результата:
>    scheduling-service материализует per-lesson `lesson.teacher_id` override и публикует событие назад.
> 3. **Модель — REST + server-derived проекции** (не event-sourcing). Имена событий из спеки §3
>    (`TEACHER_ABSENCE_REPORTED`, `SUBSTITUTE_ASSIGNED`, `SCHEDULE_RECALCULATED`, …) — доменные события
>    для notification/analytics-консьюмеров.
> 4. **Новая роль `SCHEDULER`** в org-service (см. §4 ниже).

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

> **Расширение под Teacher Management (спека §5, §6):** базовый `load` = contact-часы недостаточен.
> Добавить **prep-часы** (`contact·0.30 + 1.0·distinctCourses`), `effectiveLoad`, `dayPeak`, `consecPeak`,
> `softCost` и **`healthState` (`ok|warn|danger`)** по классификации §5. Константы политики (`PREP_FACTOR`,
> `DAILY_CONTACT_CAP`, `MAX_CONSECUTIVE`, `NEAR_CAP_RATIO`, …) — **редактируемы admin/principal** (Appendix B),
> хранить per-school с дефолтами. `validateAssignment` (§6.1) hard-constraints: `overlap | room_double_book |
> availability | language | cap_exceeded`. Math зеркалит фронтовый `src/lib/groups/operations.ts`.

```
GET   /api/v1/scheduling/schools/{schoolId}/command-center   -- composite для §4.1
      → { kpis:{utilization,spareCap,overloaded,clashes,vacancies}, teachers:[loadRow+health], violations:[...], vacancies:[...], roomLoad:[...] }
GET   /api/v1/scheduling/schools/{schoolId}/workload-policy
PATCH /api/v1/scheduling/schools/{schoolId}/workload-policy   { prepFactor?, dailyCap?, maxConsecutive?, nearCapRatio?, ... }  -- admin/principal
```

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

### 3.9 Absence / leave (график отпусков) — НОВОЕ (спека §3.2, §7 step 1)

Сущность отсутствия учителя (sick / leave / vacancy). Владелец — scheduling-service (резолвит затронутые уроки).

```
teacher_absence
├─ id, school_id, teacher_id
├─ kind     ENUM(sick | leave | vacancy)
├─ scope    ENUM(today | window | permanent)
├─ from     DATE,  to DATE NULL    -- permanent → to=null
├─ reason   TEXT
└─ created_by, created_at
```

```
GET  /api/v1/scheduling/schools/{schoolId}/absences          -- график отпусков (лента/календарь)
GET  /api/v1/scheduling/teachers/{teacherId}/absences
POST /api/v1/scheduling/teachers/{teacherId}/absences
     { kind, scope, from, to?, reason }
     → 201 { absenceId, createdRequests:[SubstituteRequest] }   -- авто-scope уроков
DELETE /api/v1/scheduling/absences/{absenceId}
```

**Серверный эффект `POST` (= событие `TEACHER_ABSENCE_REPORTED`):** найти уроки teacher в окне →
пометить availability blocked → **авто-создать `SUBSTITUTE_REQUEST_CREATED` на каждый непокрытый урок** →
синхронно запустить генерацию кандидатов (§3.10). Права (§1.2): свой absence — сам teacher; чужой —
owner/admin/scheduler.

### 3.10 Substitution engine (план подмен) — НОВОЕ (спека §7, §12.1, §12.4)

```
substitute_request
├─ id, school_id, lesson_id, group_id, original_teacher_id
├─ cover_window {from,to}, urgency ENUM(today|upcoming|open)
├─ status ENUM(open|closed|cancelled)

substitute_assignment
├─ id, request_id, original_teacher_id, substitute_teacher_id, lesson_id
├─ cover_window {from,to}, fit_score, status ENUM(proposed|confirmed|rejected|expired)
```

```
GET  /api/v1/scheduling/schools/{schoolId}/substitutions          -- cover queue (open requests + absences)
POST /api/v1/scheduling/schools/{schoolId}/substitutions          -- ручной "Arrange cover" → request
GET  /api/v1/scheduling/substitutions/{requestId}/candidates      -- ранжированные кандидаты (§7.2)
     → [{ teacherId, eligible, fitScore, classification, factors:{canLang,free,spareRatio,familiar,wouldOverload,subLoop} }]
POST /api/v1/scheduling/substitutions/{requestId}/assign
     { substituteTeacherId, override?:bool }
     → 200 { ok } | 409 { conflictType }    -- confirm-time re-check (§7.3)
POST /api/v1/scheduling/substitutions/{requestId}/cancel
```

**Candidate ranking (§7.2, детерминировано 0–100):** HARD G1 speaks lang, G2 free → fail ⇒ eligible=false.
SOFT: `capScore(0..40)+famScore(0..25)+disrScore(0..20)+availScore(0..15)`. Кэш кандидатов с TTL,
инвалидируется `TEACHER_AVAILABILITY_UPDATED|LESSON_*|SUBSTITUTE_ASSIGNED` в окне.
**Confirm-time (§7.3):** на `assign` заново G1/G2 против текущего состояния; `contact(sub)+dur > cap` →
блок, **кроме** override owner/principal-уровнем (→ аудит + overload-алерт). Fail → `409`, request open.
**Edge:** §12.1 no-candidate → `CONFLICT_DETECTED(no_candidate)` + uncovered-alert; §12.4 sub-loop →
candidate `eligible=false` factor `sub_loop`, движок берёт следующий.

**Назад в org-service:** при `confirmed` — записать `group_teacher role=substitute` (окно+reason) как
teacher-of-record-проекцию (событие `substitute.confirmed` → org-consumer, идемпотентно).

### 3.11 Curriculum plan (операционный слой) — НОВОЕ (спека §2.5, §4.3, §12.5)

> Не редактор контента (он в content-service). Это порядок прохождения / целевые часы / прогресс доставки
> на группу. Владелец — scheduling-service (знает уроки); `requiredLevel` сверяется с content-метаданными.

```
curriculum_plan (group_id) ├─ target_weekly_hours, progress_pct(DERIVED)
curriculum_unit  ├─ plan_id, title, order, planned_sessions, delivered_sessions, required_level, status(planned|active|done|overridden)
```

```
GET   /api/v1/scheduling/groups/{groupId}/curriculum
PUT   /api/v1/scheduling/groups/{groupId}/curriculum            -- units + targetWeeklyHours
PATCH /api/v1/scheduling/curriculum/units/{unitId}              -- edit/deliver/override(reason)
POST  /api/v1/scheduling/curriculum/units/reorder
POST  /api/v1/scheduling/lessons/{lessonId}/curriculum-unit     { unitId }   -- unit→lesson mapping
```

**Override (§12.5):** требует reason (аудит); если поднимает `requiredLevel` выше языков/уровня учителя
урока → `CONFLICT_DETECTED(curriculum_override)` + пометка уроков «needs reassignment» (не авто-отмена);
если меняет `targetWeeklyHours` → forecast inputs dirty.

### 3.12 Forecast (прогноз найма) — НОВОЕ (спека §10)

Чистая математика §10. **Вариант A (рекомендуется для MVP):** считается на фронте (`forecast()` в
operations) поверх текущих counts — бэкенд не нужен сразу. **Вариант B (позже):** analytics-service
отдаёт проекцию из своих агрегатов (см. §3.7) — фронт переключается без изменения UI.

```
POST /api/v1/analytics/schools/{schoolId}/forecast    { growth, terms, groupSize, hoursPerGroup, contractPerTeacher }
     → { projection:[...], perLanguage:[{lang,teachersNeeded,teachersHaving,gap,utilProjected,risk}], bottleneck, hireGap }
GET/POST/DELETE /api/v1/analytics/schools/{schoolId}/forecast/scenarios   -- сохранённые сценарии
```

### 3.13 Alerts & escalation — НОВОЕ (спека §9) → notification-service

Виды: overload(danger) · near-cap(warn) · daily/consec(warn) · conflict(danger) · vacancy(danger) ·
uncovered(danger) · sub-overload(warn) · bottleneck(warn). Модель `raised→acknowledged→resolved`.

```
GET  /api/v1/scheduling/schools/{schoolId}/alerts
POST /api/v1/scheduling/alerts/{alertId}/acknowledge      → ALERT_ACKNOWLEDGED
POST /api/v1/scheduling/alerts/{alertId}/resolve
```

**Серверная эскалация (таймеры от `occurredAt`):** overload без ack 24h → notify Principal; vacancy
unfilled 48h → notify Admin+Principal; uncovered lesson за <24h → escalate Principal override. Доставка —
через **notification-service** (новые типы in-app/email).

---

## 4. Teacher Management — org-service / profile / notification — ✅ Реализовано (2026-06-08)

> Frontend-план [`plan/teacher-management/`](plan/teacher-management/). Дополняет уже готовые
> `school_teacher` (§1.3) и `group_teacher` (§1.2).

### 4.1 Роль `SCHEDULER` (org-service + auth) — ✅

Новая роль школьного членства (прецедент — `CONTENT_ADMIN`). Управляет расписанием/подменами/прогнозом,
но **не** настройками школы. `POST /schools/{id}/members { role:'SCHEDULER' }` + инвайты `role=SCHEDULER`.
Авторизация scheduling-эндпоинтов: `OWNER|ADMIN|SCHEDULER` — полный доступ; `TEACHER` — только свой
график (RO) + свой absence/availability. (`Principal`→`OWNER`, отдельной роли не вводим.)

### 4.2 `school_teacher` — доп. атрибуты (org-service) — ✅

К существующей таблице (§1.3: `max_weekly_hours`, `availability`) добавить:

```
school_teacher  += employment_type ENUM(full|part|contract)
                += status          ENUM(active|invited|inactive)
```

`GET /schools/{id}/teachers` дополнить `employmentType`, `status`, `name`, `avatarUrl` (денорм). Языки —
по-прежнему из tutor-профиля (profile-service), не дублируем.

### 4.3 Remove-teacher guard (org-service) — ✅

`DELETE /schools/{id}/members/{userId}` для TEACHER: если учитель — `primary` хотя бы одной **активной**
группы → `409 { error:'primary-of-active-groups', groups:[{id,name}] }`. Сначала переназначить primary.

### 4.4 Add-teacher invite (org-service) — ⚠️ переиспользует существующее

3-веточный flow как у студентов (lookup → invite `register`/`onboard_existing` / direct member), но
`role=TEACHER`. `POST /schools/{id}/invitations` уже принимает `role` и `kind` — проверить, что ветка
`onboard_existing` для TEACHER выдаёт платформенную роль `tutor` (а не только `student`) и создаёт
tutor-профиль. Иначе — расширить accept-логику.

### 4.5 notification-service — ✅ Типы добавлены

Под §3.13: типы уведомлений `TEACHER_ABSENCE`, `SUBSTITUTE_REQUEST`, `SUBSTITUTE_ASSIGNED`,
`OVERLOAD_ALERT`, `VACANCY_ALERT`, `UNCOVERED_LESSON` (in-app + email) + таймеры эскалации.

---

## Сводка задач (Teacher Management)

| #    | Сервис            | Задача                                                              | Статус | Блокирует фронт            |
| ---- | ----------------- | ------------------------------------------------------------------ | ------ | -------------------------- |
| 3.3+ | scheduling        | Расширенная нагрузка (prep/effectiveLoad/healthState) + policy      | ✅     | command center, schedule   |
| 3.9  | scheduling        | Absence / leave (график отпусков) + авто sub-requests              | ✅     | schedule view, console     |
| 3.10 | scheduling        | Substitution engine (candidates §7, assign confirm-recheck)        | ✅     | substitute console         |
| 3.11 | scheduling        | Curriculum plan (units/target/override/mapping)                    | ✅     | curriculum planner         |
| 3.12 | analytics/фронт   | Forecast (§10) — фронт-компьют сейчас, analytics позже             | 🟢 фронт | forecast (swap-ready)    |
| 3.13 | scheduling+notif  | Alerts + escalation                                                | ✅     | alerts delivery            |
| 4.1  | org+auth          | Роль `SCHEDULER`                                                   | ✅     | role-gating                |
| 4.2  | org               | `school_teacher` += employmentType/status                          | ✅     | roster attrs               |
| 4.3  | org               | Remove-teacher guard (primary активной группы)                     | ✅     | roster remove              |
| 4.4  | org/profile       | Add-teacher invite (TEACHER-ветка onboard_existing)               | ✅     | roster add                 |
| 4.5  | notification      | Типы уведомлений + эскалация                                       | ✅     | alerts delivery            |

---

## Сводка задач (Group/Student Management)

| #   | Сервис                 | Задача                                                                                 | Статус     | Блокирует фронт             |
| --- | ---------------------- | -------------------------------------------------------------------------------------- | ---------- | --------------------------- |
| 1.1 | org                    | Расширить `Group` (course/lang/level/status/mode/capacity/term-даты) + publish/archive | ✅ Готово  | список, детали, визард      |
| 1.2 | org                    | `group_teacher` junction + assign/remove + валидация                                   | ✅ Готово  | teacher-assign, detail      |
| 1.3 | org                    | `school_teacher` (maxWeeklyHours/availability) + GET teachers                          | ✅ Готово  | timetable, нагрузка         |
| 1.4 | org+content            | Авто-entitlement курса по членству (события + consumer)                                | ✅ Готово  | (фоновая логика)            |
| 1.5 | org                    | Расширенные GET-ответы групп                                                           | ✅ Готово  | список, детали              |
| 2.1 | analytics              | `GET /analytics/schools/{id}/students` — список + производный статус                  | ✅ Готово  | students list               |
| 2.2 | analytics              | `GET /analytics/schools/{id}/students/{userId}` — детали студента                     | ✅ Готово  | student detail              |
| 2.3 | profile/org            | `GET /users/lookup?email=` + 3-веточный invite/accept (kind + targetGroupId)           | ✅ Готово  | enroll/add-student          |
| 2.4 | notif/org              | Bulk message + сегменты                                                                | 🟢 отложен | (фиче-флаг)                 |
| 3.x | **scheduling (новый)** | slots/lessons/conflicts/load/timetable/clashes/absences/substitutions/curriculum/alerts | ✅ Готово (2026-06-08) | расписание, timetable |
