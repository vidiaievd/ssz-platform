-- Create separate databases for each service.
-- Each service connects only to its own database and user.
-- Principle of least privilege: one service cannot touch another service's data.

-- ============================================================================
-- Auth Service
-- ============================================================================
CREATE USER auth_service WITH PASSWORD 'auth_service_password';
CREATE DATABASE auth_db OWNER auth_service;

-- ============================================================================
-- User Profile Service
-- ============================================================================
CREATE USER profile_service WITH PASSWORD 'profile_service_password';
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
CREATE USER org_service WITH PASSWORD 'org_service_password';
CREATE DATABASE organizations_db OWNER org_service;

\c organizations_db
GRANT ALL ON SCHEMA public TO org_service;

-- ============================================================================
-- Content Service
-- ============================================================================
CREATE USER content_service WITH PASSWORD 'content_service_password';
CREATE DATABASE content_db OWNER content_service;

\c content_db
GRANT ALL ON SCHEMA public TO content_service;

-- ============================================================================
-- Media Service
-- ============================================================================
CREATE USER media_service WITH PASSWORD 'media_service_password';
CREATE DATABASE media_db OWNER media_service;

\c media_db
GRANT ALL ON SCHEMA public TO media_service;

-- ============================================================================
-- Notification Service
-- ============================================================================
CREATE USER notifications_service WITH PASSWORD 'notifications_service_password';
CREATE DATABASE notifications_db OWNER notifications_service;

\c notifications_db
GRANT ALL ON SCHEMA public TO notifications_service;

-- ============================================================================
-- Learning Service
-- ============================================================================
CREATE USER learning_service WITH PASSWORD 'learning_service_password';
CREATE DATABASE learning_db OWNER learning_service;

\c learning_db
GRANT ALL ON SCHEMA public TO learning_service;