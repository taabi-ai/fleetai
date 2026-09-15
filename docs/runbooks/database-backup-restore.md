# Runbook: Database backup / restore

| Field | Value |
|-------|-------|
| Scope | Every per-service database (identity, dashboard, fleet_metrics, ai, platform_config, notification, media, training, engineering) |
| Frequency | Nightly pg_dump; PITR on managed PG (check vendor docs) |

## Backup (managed/custom PG)

```bash
for db in identity dashboard fleet_metrics ai platform_config notification media training engineering; do
  pg_dump "postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$db" -Fc -f "backups/$db-$(date +%F).dump"
done
# push to object storage (MinIO mirror, offline copy)
mc cp -r backups/ local/fleetai-private/db-backups/
```

## Restore drill (into a scratch DB — never over production)

```bash
createdb "${db}_restore_$(date +%s)"
pg_restore -d "${db}_restore_$(date +%s)" "backups/$db-$(date +%F).dump"
# verification: compare row counts per table against a stored baseline manifest
psql -d "scratch_db" -c "select count(*) from \"$(table)\""
```

## PITR (managed PG)

Managed PostgreSQL (Abacus.AI / RDS / etc.) keeps WAL for point-in-time recovery.
Restore a timestamp with the vendor console/CLI; verify with the same row-count
comparison against the baseline manifest (`backups/baseline-rows.json`, refreshed
each backup run).

## Media objects

Objects live in MinIO/S3 — backup = bucket replication or `mc mirror` to a
second bucket/region. The `MediaAsset` table rows and the object keys must agree;
use `packages/storage` `buildKey` invariants when verifying.

## Verification

Backup success is not a backup — always run the restore drill before trusting a
backup. Keep the baseline manifest and diff after every drill.
