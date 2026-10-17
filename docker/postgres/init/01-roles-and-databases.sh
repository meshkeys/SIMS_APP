#!/bin/bash
# Runs once, when the Postgres volume is first created.
#
# - The owner role (POSTGRES_USER) runs migrations and owns every table.
# - The app role (APP_DB_USER) is what the API connects as. It does NOT own
#   the tables and has no BYPASSRLS, so row-level security policies apply.
# - A separate test database keeps e2e tests away from development data.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE "${APP_DB_USER}" LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  CREATE DATABASE "${POSTGRES_DB}_test" OWNER "${POSTGRES_USER}";
EOSQL

for db in "$POSTGRES_DB" "${POSTGRES_DB}_test"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
    GRANT CONNECT ON DATABASE "${db}" TO "${APP_DB_USER}";
    GRANT USAGE ON SCHEMA public TO "${APP_DB_USER}";
    -- Tables and sequences created later by migrations (run as the owner)
    -- are automatically usable by the app role.
    ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_DB_USER}";
    ALTER DEFAULT PRIVILEGES FOR ROLE "${POSTGRES_USER}" IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO "${APP_DB_USER}";
EOSQL
done
