# Prompt 07 — `media` service (object storage, presigned uploads, multipart, MediaAsset)

**Branch:** `feat/07-media-service`  
**Depends on:** 00, 01, 10 merged. Parallel-safe with 08.  
**Phase:** 8  
**Port:** 4007 · **DB:** `media` · **Package:** `@fleetai/media`

## Role

You extract upload/asset management. Storage is MinIO/S3-compatible via `@fleetai/storage`; the
service never proxies bytes — clients upload directly with presigned URLs, exactly as legacy did.

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/02-service-catalog.md` § media
3. `docs/migration/06-REFERENCE/01-route-to-service-map.md` rows **media**
4. `docs/migration/06-REFERENCE/02-model-to-service-map.md` — `MediaAsset`
5. Legacy:
   * `legacy/fleetai_dash/nextjs_space/lib/storage.ts` (key layout `<prefix>[public/]uploads/<folder>/<ts>-<name>`, custom S3 vs platform bucket resolution, `ContentDisposition` signed-header pitfall), `lib/media.ts`, `lib/upload-client.ts` (client protocol: ≤100 MB single PUT, >100 MB multipart)
   * `legacy/fleetai_dash/nextjs_space/app/api/media/**` (list/create, `[id]` get/delete, `complete`, `multipart/initiate|part|complete`)
   * `legacy/fleetai_dash/nextjs_space/components/media-picker.tsx` — only to confirm the list/filter contract the UI uses
   * `legacy/fleetai_dash/nextjs_space/.storage_usage.md` (if present in snapshot) — documented bucket layout

## Deliverables

1. `services/media`: Prisma schema (`MediaAsset` with `cloudStoragePath`, `isPublic`, `ownerUserId` string, `folder`, `contentType`, `size`, `status` pending|ready|deleted), migrations.
2. Endpoints: `GET /v1/media` (filters folder/type/owner/public, pagination), `POST /v1/media/presign` (single PUT; returns URL + required headers derived from `X-Amz-SignedHeaders`), `POST /v1/media/multipart/initiate|part|complete|abort`, `POST /v1/media/complete` (marks ready after HEAD verification), `GET /v1/media/:id` (signed GET URL for private, public URL for public, TTL from config), `DELETE /v1/media/:id` (removes object + row; 404 if missing), permission `media.manage` for admin operations, owner-or-admin otherwise.
3. Events: `media.asset.created`, `media.asset.deleted`, `audit.entry.recorded`. Consumers: `identity.user.deleted` (reassign to system owner, do not delete files), `training.lesson.deleted` (optional GC of orphaned assets).
4. Job (pgmq): `gc-pending-uploads` — delete `pending` rows and objects older than 24 h.
5. Tests: Testcontainers MinIO round-trip (presign → PUT with the exact headers → complete → signed GET), multipart 3-part test, 403/404 matrix.
6. Contracts, OpenAPI, README, `.env.example`, Helm stub, compose entry, backfill (`MediaAsset` rows; objects stay in place — provide `scripts/mirror-bucket.ts` using `@aws-sdk/client-s3` to copy from the legacy bucket to MinIO with the same keys).
7. Gateway flags `/api/media*` → `shadow`.

## Steps

1. Copy `_template`; config schema (S3 endpoint/region/bucket(s)/keys/path-style/public base URL/prefix, signed URL TTLs).
2. Schema/migrations.
3. Presign + complete + multipart modules (reuse `@fleetai/storage`).
4. List/get/delete + permissions.
5. Events/consumers/job.
6. Backfill + mirror script + flags.

## Acceptance

```bash
pnpm --filter @fleetai/media prisma migrate deploy
pnpm --filter @fleetai/media test
pnpm --filter @fleetai/media start & sleep 4 && curl -sf localhost:4007/health/ready
PRESIGN=$(curl -s -XPOST localhost:4007/v1/media/presign -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"folder":"test","name":"a.txt","contentType":"text/plain","size":5}')
echo "$PRESIGN" | jq '.uploadUrl,.headers'
```

## Do not

* Do not stream file bytes through the service.
* Do not store signed URLs in the DB.
* Do not use `@azure/storage-blob` or any vendor SDK — S3 API only (Azure via MinIO gateway or S3-compatible layer is a deployment concern, see infra doc).

## Completion report

```
## Prompt 07 report
Endpoints / events / consumers / jobs
MinIO round-trip test evidence (single + multipart)
Backfill/mirror plan executed? (rows, objects)
Acceptance output
Deviations / open questions
```
