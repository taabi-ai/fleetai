# Runbook: Database connections / slow queries

| Field | Value |
|-------|-------|
| Alerts | `DatabaseConnectionsHigh`, `SlowQueries` |
| Severity | ticket |
| Dashboards | Postgres → Connections vs max, Slow queries |
| Service | database |

## Meaning
Postgres connections exceeded 80% of `max_connections`, or slow statements
(mean > 1s) are increasing.

## First checks
1. Which service holds the connections? `select usename, count(*) from pg_stat_activity group by 1;`
2. Connection budget: 25 on managed PG; 1 Prisma + 1 LISTEN per worker replica —
   are consumers scaled beyond budget?
3. Slow query text from `pg_stat_statements`.

## Remediation
- Add PgBouncer in front if connection count is the problem (LISTEN needs direct).
- Fix slow query: index, partition (hypertable chunks), or lower row counts.
- Scale down worker replicas if idling.

## Confirmation
Connections below 80% for 3 windows; slow query rate flat.
