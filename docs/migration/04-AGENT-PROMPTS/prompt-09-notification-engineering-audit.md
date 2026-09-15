# Prompt 09 — `notification` + `engineering` services, audit consumer, topic provisioning

**Branch:** `feat/09-notification-engineering-audit`  
**Depends on:** 00, 01 merged (10 recommended). Parallel-safe with 04.  
**Phase:** 3 (audit consumer + topics) and 7 (notification/engineering endpoints)  
**Ports:** notification 4006, engineering 4009 · **DBs:** `notification`, `engineering` · **Packages:** `@fleetai/notification`, `@fleetai/engineering`

## Role

Three smaller pieces that make the event backbone useful:
1. The **audit consumer** — the first Kafka consumer in production; it proves the outbox→Redpanda→consumer path and gives compliance a single audit store.
2. **notification** — in-app notification bell + e-mail (SMTP) driven by events instead of inline calls.
3. **engineering** — DORA metrics (webhook ingest + computation) and the Plane.so proxy; also the sales/CRM overview endpoint until a CRM integration exists.

## Read first

1. `AGENTS.md`
2. `docs/migration/01-TARGET-ARCHITECTURE/02-service-catalog.md` § notification, § engineering, § audit
3. `docs/migration/01-TARGET-ARCHITECTURE/04-adr-messaging.md` (topics, partitions, retention)
4. `docs/migration/06-REFERENCE/03-event-catalog.md` (complete list — you provision all topics)
5. `docs/migration/06-REFERENCE/01-route-to-service-map.md` rows **notification**, **engineering**, **sales**
6. Legacy:
   * `legacy/fleetai_dash/nextjs_space/lib/audit.ts` (record shape), `app/api/admin/audit/route.ts` (read filters — read API is built in 06; here you build the *store*)
   * `legacy/fleetai_dash/nextjs_space/lib/notify.ts`, `lib/mailer.ts`, `app/api/notifications/route.ts`, `components/notification-bell.tsx` (payload the UI expects)
   * `legacy/fleetai_dash/nextjs_space/lib/dora.ts` (`computeDoraMetrics`), `app/api/dora/events/route.ts` (`x-dora-token` header; 503 when integration disabled), `app/api/engineering/plane/route.ts`, `app/api/sales/overview/route.ts` (deterministic sample scorecards with `sample:true`)

## Deliverables

### A. Topics & audit consumer (Phase 3)
1. `infra/redpanda/topics.yaml` fully populated from the event catalog (partitions: `telemetry.*` 12, `fleet.*` 6, others 3; retention 7 d except `audit.entry.recorded` 30 d; cleanup `delete`; `*.dlq` topics for every consumer group). `create-topics.sh` idempotent (`rpk topic create --if-not-exists`).
2. Audit consumer: implemented **inside `platform-config`** (prompt 06) if that service exists; if 06 has not run yet, create `services/platform-config` from `_template` now with only the audit consumer + `AuditEntry` table + `GET /v1/admin/audit`, and leave a `TODO(prompt-06)` marker. Idempotent, DLQ on poison messages, retention job 400 d.
3. Contract test in `tests/contract/audit-flow.spec.ts`: start `_template` (which uses `@Audited()` on a demo mutation) → call it → assert `AuditEntry` row appears within 5 s.

### B. notification service
4. Prisma: `Notification` (userId, type, title, body, link, readAt), `NotificationPreference`, `EmailOutbox`. Endpoints: `GET /v1/notifications` (unread first, same payload as legacy bell), `POST /v1/notifications/:id/read`, `POST /v1/notifications/read-all`, `GET/PUT /v1/notifications/preferences`, `POST /internal/notify` (internal header; used by services that need a direct in-app message).
5. Consumers → notifications/e-mails: `fleet.alert.raised` (severity ≥ high → notify users with `dora.view`? **No** — notify dashboard owners who have an alerts widget: subscribe `dashboard.widget.created/deleted` to keep a local `alert_subscribers` read model), `identity.quota.exhausted` → notify user + admins, `identity.user.created` → welcome mail (if SMTP enabled), `training.progress.completed`, `ai.widget.generated` (optional, off by default).
6. E-mail: SMTP settings fetched from `platform-config` `GET /internal/integrations/smtp` (cache 60 s); sending via pgmq job queue `email-send` with retry/backoff; never send from a consumer directly.
7. Producers: `notification.sent`, `notification.email.failed`, `audit.entry.recorded`.

### C. engineering service
8. Prisma: `DoraEvent`, `PlaneCache` (optional). Endpoints: `POST /v1/dora/events` (header `x-dora-token` validated against `platform-config` internal integrations `dora_webhook`; 503 when disabled — preserve), `GET /v1/dora/metrics?range=` (`dora.view`; port `computeDoraMetrics` exactly), `GET /v1/engineering/plane/*` (proxy with token from integrations; cache 60 s), `GET /v1/sales/overview` (`crm.view`; port deterministic sample response with `sample:true` until CRM integration; when CRM integration enabled, call it).
9. Events: `engineering.dora.event.received`, `audit.entry.recorded`.

### D. Common
10. Contracts, OpenAPI, READMEs, `.env.example`s, Helm stubs, compose entries, backfill scripts (`AuditLog`→`AuditEntry`, `DoraEvent`, `Notification` if legacy persisted any).
11. Gateway flags: `/api/notifications` → `shadow`; `/api/dora/*`, `/api/engineering/*`, `/api/sales/*` → `shadow`.

## Steps

1. Topics + create script; run against compose; `rpk topic list` shows all.
2. Audit consumer + contract test.
3. notification service (schema, API, consumers, email job).
4. engineering service.
5. Backfill + flags.

## Acceptance

```bash
pnpm infra:topics && docker exec redpanda rpk topic list | wc -l     # >= number of topics in catalog
pnpm turbo run test --filter=@fleetai/notification --filter=@fleetai/engineering --filter=@fleetai/platform-config
pnpm test:contract -- audit-flow
pnpm --filter @fleetai/notification start & pnpm --filter @fleetai/engineering start & sleep 5
curl -sf localhost:4006/health/ready && curl -sf localhost:4009/health/ready
curl -s -o /dev/null -w '%{http_code}\n' -XPOST localhost:4009/v1/dora/events -d '{}' -H 'content-type: application/json'   # 401 (bad token) or 503 (disabled)
```

## Do not

* Do not send e-mail synchronously from consumers or request handlers.
* Do not compute DORA metrics differently from legacy `lib/dora.ts`.
* Do not create a separate `audit` microservice — audit store lives in `platform-config`.

## Suggested split

* Session A: topics + audit consumer + contract test.
* Session B: notification.
* Session C: engineering.

## Completion report

```
## Prompt 09 report
Topics created: <n> ; DLQ topics: <n>
Audit flow contract test: pass/fail + latency
notification: endpoints/consumers/jobs ; engineering: endpoints/events
Acceptance output
Deviations / open questions
```
