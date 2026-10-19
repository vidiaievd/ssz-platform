#!/bin/sh
# Production only: replaces the development passwords init.sql gives each service role
# with the ones from the environment, so DATABASE_URL in docker-compose.prod.yml and the
# role agree. Mounted after init.sql (entrypoint scripts run in name order) and, like it,
# runs once — on the first start against an empty data volume.
set -eu

set_password() {
  role="$1"
  password="$2"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -v role="$role" -v password="$password" <<'SQL'
ALTER ROLE :"role" WITH PASSWORD :'password';
SQL
}

set_password auth_service "$AUTH_SERVICE_DB_PASSWORD"
set_password profile_service "$PROFILE_SERVICE_DB_PASSWORD"
set_password org_service "$ORG_SERVICE_DB_PASSWORD"
set_password content_service "$CONTENT_SERVICE_DB_PASSWORD"
set_password media_service "$MEDIA_SERVICE_DB_PASSWORD"
set_password notifications_service "$NOTIFICATIONS_SERVICE_DB_PASSWORD"
set_password learning_service "$LEARNING_SERVICE_DB_PASSWORD"
set_password exercise_engine_service "$EXERCISE_ENGINE_SERVICE_DB_PASSWORD"
set_password analytics_service "$ANALYTICS_SERVICE_DB_PASSWORD"
set_password scheduling_service "$SCHEDULING_SERVICE_DB_PASSWORD"
