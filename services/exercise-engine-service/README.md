# Exercise Engine Service

The Exercise Engine is the runtime service for the SSZ Platform. It delivers exercises to students, accepts and validates submitted answers deterministically against closed-form templates (`multiple_choice`, `fill_in_blank`, `match_pairs`), scores them, and persists attempt history. On completion it publishes `exercise.attempt.completed` so the Learning Service can update student progress. Free-form submissions (translations, open writing) are routed to the Learning Service Submission review flow.

- **Port**: `3006`
- **Database**: `exercises_db` (PostgreSQL)
- **Cache**: Redis (exercise definition cache, TTL 5 min)
- **Message broker**: RabbitMQ (`ssz.events` topic exchange)
