-- Create separate databases for each service.
-- Each service connects only to its own database and user.
-- Principle of least privilege: one service cannot touch another service's data.
-- CREATEDB is granted to every service user — required for Prisma Migrate shadow
-- database (P3014). Prisma only uses this privilege during `migrate dev`; it is
-- never exercised in production containers where `migrate deploy` is used instead.

-- ============================================================================
-- Auth Service
-- ============================================================================
CREATE USER auth_service WITH PASSWORD 'auth_service_password' CREATEDB;
CREATE DATABASE auth_db OWNER auth_service;

-- ============================================================================
-- User Profile Service
-- ============================================================================
CREATE USER profile_service WITH PASSWORD 'profile_service_password' CREATEDB;
CREATE DATABASE profiles_db OWNER profile_service;

-- ============================================================================
-- Schema permissions (required for PostgreSQL 15+)
-- Even with OWNER set above, explicit schema grants make intent clear
-- and protect against edge cases when databases are restored from dumps.
-- ============================================================================

\c auth_db
GRANT ALL ON SCHEMA public TO auth_service;

\c profiles_db
GRANT ALL ON SCHEMA public TO profile_service;

-- ============================================================================
-- Organization Service
-- ============================================================================
CREATE USER org_service WITH PASSWORD 'org_service_password' CREATEDB;
CREATE DATABASE organizations_db OWNER org_service;

\c organizations_db
GRANT ALL ON SCHEMA public TO org_service;

-- ============================================================================
-- Content Service
-- ============================================================================
CREATE USER content_service WITH PASSWORD 'content_service_password' CREATEDB;
CREATE DATABASE content_db OWNER content_service;

\c content_db
GRANT ALL ON SCHEMA public TO content_service;

-- ============================================================================
-- Media Service
-- ============================================================================
CREATE USER media_service WITH PASSWORD 'media_service_password' CREATEDB;
CREATE DATABASE media_db OWNER media_service;

\c media_db
GRANT ALL ON SCHEMA public TO media_service;

-- ============================================================================
-- Notification Service
-- ============================================================================
CREATE USER notifications_service WITH PASSWORD 'notifications_service_password' CREATEDB;
CREATE DATABASE notifications_db OWNER notifications_service;

\c notifications_db
GRANT ALL ON SCHEMA public TO notifications_service;

-- ============================================================================
-- Learning Service
-- ============================================================================
CREATE USER learning_service WITH PASSWORD 'learning_service_password' CREATEDB;
CREATE DATABASE learning_db OWNER learning_service;

\c learning_db
GRANT ALL ON SCHEMA public TO learning_service;

-- ============================================================================
-- Exercise Engine Service
-- ============================================================================
CREATE USER exercise_engine_service WITH PASSWORD 'exercise_engine_service_password' CREATEDB;
CREATE DATABASE exercises_db OWNER exercise_engine_service;

\c exercises_db
GRANT ALL ON SCHEMA public TO exercise_engine_service;
