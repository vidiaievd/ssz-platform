-- Create separate databases for each service
-- Each service connects only to its own database

CREATE DATABASE auth_db;
CREATE DATABASE learning_db;
CREATE DATABASE profiles_db;

-- Create dedicated users per service
-- Principle of least privilege — auth_service cannot touch learning_db

CREATE USER auth_service WITH PASSWORD 'auth_service_password';
GRANT ALL PRIVILEGES ON DATABASE auth_db TO auth_service;

CREATE USER learning_service WITH PASSWORD 'learning_service_password';
GRANT ALL PRIVILEGES ON DATABASE learning_db TO learning_service;

CREATE USER profile_service WITH PASSWORD 'profile_service_password';
GRANT ALL PRIVILEGES ON DATABASE profiles_db TO profile_service;

-- Required for PostgreSQL 15+ — grant schema usage
\c auth_db
GRANT ALL ON SCHEMA public TO auth_service;

\c learning_db
GRANT ALL ON SCHEMA public TO learning_service;

\c profiles_db
GRANT ALL ON SCHEMA public TO profile_service;