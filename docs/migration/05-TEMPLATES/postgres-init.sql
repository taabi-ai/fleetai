-- infra/postgres/init.sql
-- Creates one database per service and enables extensions. Runs once on first container start.
-- Managed clouds: run the CREATE DATABASE statements per server/instance, then the extension blocks
-- inside each database. Azure Flexible Server does NOT ship pgmq -> @fleetai/queue uses the shim.

\set ON_ERROR_STOP on

CREATE DATABASE identity;
CREATE DATABASE dashboard;
CREATE DATABASE fleet_metrics;
CREATE DATABASE ai;
CREATE DATABASE platform_config;
CREATE DATABASE notification;
CREATE DATABASE media;
CREATE DATABASE training;
CREATE DATABASE engineering;
CREATE DATABASE legacy;   -- optional: restore the monolith dump here for local strangler-fig work

-- Extensions that every service database gets
\connect identity
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS pgmq;
\connect dashboard
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS pgmq;
\connect fleet_metrics
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS pgmq;
CREATE EXTENSION IF NOT EXISTS timescaledb;   -- hypertables for vehicle_position / telemetry_raw
CREATE EXTENSION IF NOT EXISTS postgis;       -- optional: geofences, route geometry (comment out if unavailable)
\connect ai
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS pgmq;
\connect platform_config
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS pgmq; CREATE EXTENSION IF NOT EXISTS pg_trgm;
\connect notification
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS pgmq;
\connect media
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS pgmq;
\connect training
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS pgmq;
\connect engineering
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS pg_stat_statements; CREATE EXTENSION IF NOT EXISTS pgmq;

-- Per-service least-privilege roles (dev passwords; prod uses secrets manager)
\connect postgres
DO $$
DECLARE svc text;
BEGIN
  FOREACH svc IN ARRAY ARRAY['identity','dashboard','fleet_metrics','ai','platform_config','notification','media','training','engineering'] LOOP
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', 'svc_' || svc, 'svc_' || svc || '_dev');
    EXECUTE format('GRANT ALL PRIVILEGES ON DATABASE %I TO %I', svc, 'svc_' || svc);
  END LOOP;
END $$;

-- NOTE: Prisma migrations create the tables. The SKIP LOCKED queue shim (if pgmq is missing) and the
-- outbox_events / processed_events tables are created by each service's first migration via the SQL
-- exported from @fleetai/outbox and @fleetai/queue.
