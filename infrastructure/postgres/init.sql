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