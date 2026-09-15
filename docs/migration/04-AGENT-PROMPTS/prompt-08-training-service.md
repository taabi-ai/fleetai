# Prompt 08 — `training` service (modules, lessons, progress)

**Branch:** `feat/08-training-service`  
**Depends on:** 00, 01, 10 merged; 07 (media) merged because lessons reference media assets by id.  
**Phase:** 8  
**Port:** 4008 · **DB:** `training` · **Package:** `@fleetai/training`

## Role

You extract the training centre (video walkthrough modules with lessons and per-user progress).
Small, well-bounded domain — a good prompt for a less capable model or a junior agent.

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/02-service-catalog.md` § training
3. `docs/migration/06-REFERENCE/01-route-to-service-map.md` rows **training**
4. `docs/migration/06-REFERENCE/02-model-to-service-map.md` — `TrainingModule`, `TrainingLesson`, `TrainingProgress`
5. Legacy:
   * `legacy/fleetai_dash/nextjs_space/lib/training.ts` (visibility rules: public vs `training.internal`; progress computation; slug rules)
   * `legacy/fleetai_dash/nextjs_space/app/api/training/route.ts`, `training/[slug]/route.ts`, `training/progress/route.ts`, `app/api/admin/training/**` (modules CRUD, lessons CRUD, reorder)
   * `legacy/fleetai_dash/nextjs_space/components/video-player.tsx` — only to learn the lesson payload the player expects (chapters JSON, media asset id/URL)

## Deliverables

1. `services/training`: Prisma schema (`TrainingModule`, `TrainingLesson` with `mediaAssetId` string (no FK), `TrainingProgress` keyed by `userId+lessonId`), migrations, seed (the two published modules from legacy seed; media ids resolved at backfill time).
2. Endpoints: `GET /v1/training` (visibility filter by `perms` claim: internal modules only with `training.internal`), `GET /v1/training/:slug` (lessons + the caller's progress; lesson media URL obtained from `media` service `GET /internal/media/:id/url`), `POST /v1/training/progress` (upsert; idempotent), admin CRUD under `/v1/admin/training` guarded by `training.manage` incl. lesson reorder and publish/unpublish.
3. Events: `training.module.published`, `training.lesson.deleted`, `training.progress.completed` (when a user completes all lessons), `audit.entry.recorded`. Consumers: `identity.user.deleted` → delete progress; `media.asset.deleted` → null out `mediaAssetId` and flag lesson `needsMedia`.
4. Tests: visibility matrix (anonymous/user/internal/manage), progress idempotency, media URL resolution with a stubbed media service.
5. Contracts, OpenAPI, README, `.env.example`, Helm stub, compose entry, backfill (3 tables).
6. Gateway flags `/api/training*`, `/api/admin/training*` → `shadow`.

## Steps

1. Copy `_template`; config (DB, Kafka, `MEDIA_URL`, internal HMAC).
2. Schema/migrations/seed.
3. Public modules + progress.
4. Admin CRUD.
5. Events/consumers/backfill/flags.

## Acceptance

```bash
pnpm --filter @fleetai/training prisma migrate deploy && pnpm --filter @fleetai/training seed
pnpm --filter @fleetai/training test
pnpm --filter @fleetai/training start & sleep 4 && curl -sf localhost:4008/health/ready
curl -sf -H "authorization: Bearer $TOKEN" localhost:4008/v1/training | jq 'length'
```

## Do not

* Do not store media URLs — store asset ids and resolve at read time.
* Do not change permission strings `training.internal` / `training.manage`.

## Completion report

```
## Prompt 08 report
Endpoints / events / consumers
Visibility matrix test evidence
Acceptance output
Deviations / open questions
```
