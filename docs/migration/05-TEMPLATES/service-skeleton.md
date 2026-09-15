# Template — NestJS 11 (Fastify) service skeleton

Every service under `services/<name>` follows this layout. Prompt 00 materialises it as
`services/_template`; later prompts copy that folder.

```
services/<name>/
├── package.json              # name: @fleetai/<name>
├── tsconfig.json             # extends @fleetai/tsconfig/nest.json
├── Dockerfile                # -> ../../docs/migration/05-TEMPLATES/Dockerfile.service (copied)
├── .env.example
├── README.md                 # from service-README-template.md
├── prisma/
│   ├── schema.prisma         # ONLY this service's tables + outbox_events + processed_events
│   └── migrations/
├── scripts/
│   ├── seed.ts               # deterministic, upsert-only
│   └── backfill-from-legacy.ts
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config.ts             # Zod schema via @fleetai/config defineConfig
│   ├── prisma/prisma.service.ts
│   ├── health/health.controller.ts
│   ├── modules/<domain>/
│   │   ├── <domain>.controller.ts   # HTTP, Zod DTOs from @fleetai/contracts
│   │   ├── <domain>.service.ts      # business logic, publishes via outbox
│   │   ├── <domain>.repository.ts   # Prisma access only here
│   │   └── <domain>.module.ts
│   ├── consumers/<event>.consumer.ts  # IdempotentConsumer subclasses
│   ├── jobs/<job>.worker.ts           # pgmq workers
│   └── internal/                      # /internal/* endpoints (HMAC header guard)
└── test/
    ├── unit/**.spec.ts
    └── integration/**.spec.ts         # Testcontainers
```

## `src/main.ts`

```ts
import { bootstrapService } from '@fleetai/nest-common';
import { initTelemetry } from '@fleetai/observability';
import { AppModule } from './app.module';
import { config } from './config';

initTelemetry(config.SERVICE_NAME);            // must run before Nest imports are evaluated
bootstrapService(AppModule, { name: config.SERVICE_NAME, port: config.PORT });
```

## `src/config.ts`

```ts
import { z } from 'zod';
import { defineConfig } from '@fleetai/config';

export const config = defineConfig(z.object({
  SERVICE_NAME: z.string().default('<name>'),
  PORT: z.coerce.number().default(40xx),
  DATABASE_URL: z.string().url(),
  KAFKA_BROKERS: z.string(),                    // comma separated
  REDIS_URL: z.string().url().optional(),
  IDENTITY_JWKS_URL: z.string().url(),
  INTERNAL_HMAC_SECRET: z.string().min(32),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  LOG_LEVEL: z.enum(['debug','info','warn','error']).default('info'),
}));
```

## `src/app.module.ts`

```ts
import { Module } from '@nestjs/common';
import { ObservabilityModule } from '@fleetai/observability';
import { OutboxModule } from '@fleetai/outbox';
import { AuthModule } from '@fleetai/auth';
import { AuditModule } from '@fleetai/audit';
import { HealthModule } from '@fleetai/nest-common';
import { PrismaModule } from './prisma/prisma.module';
import { config } from './config';

@Module({
  imports: [
    ObservabilityModule.forRoot({ serviceName: config.SERVICE_NAME }),
    PrismaModule,
    OutboxModule.forRoot({ brokers: config.KAFKA_BROKERS.split(','), producer: config.SERVICE_NAME }),
    AuthModule.forRoot({ jwksUrl: config.IDENTITY_JWKS_URL, internalSecret: config.INTERNAL_HMAC_SECRET }),
    AuditModule,
    HealthModule.forRoot({ checks: ['prisma', 'kafka', ...(config.REDIS_URL ? ['redis'] : [])] }),
    // domain modules here
  ],
})
export class AppModule {}
```

## Write path pattern (mandatory)

```ts
@Post()
@RequirePermission('dashboard.manage')
@Audited({ entity: 'dashboard', verb: 'create' })
async create(@Body() dto: CreateDashboardDto, @Principal() who: PrincipalClaims) {
  return this.prisma.$transaction(async (tx) => {
    const row = await tx.dashboard.create({ data: { ...dto, ownerUserId: who.sub } });
    await publishInTx(tx, DashboardCreated.v1({ id: row.id, ownerUserId: who.sub }), { key: row.id });
    return row;
  });
}
```

## Consumer pattern (mandatory)

```ts
@Injectable()
export class UserDeletedConsumer extends IdempotentConsumer<UserDeletedV1> {
  topic = 'identity.user.deleted';
  group = '<name>.user-deleted';
  async handle(evt: EventEnvelope<UserDeletedV1>, tx: PrismaTx) {
    await tx.dashboard.updateMany({ where: { ownerUserId: evt.payload.userId }, data: { orphaned: true } });
  }
}
```

`IdempotentConsumer` (from `@fleetai/events`) opens a transaction, inserts into `processed_events`
(`event_id, consumer`) — on unique-violation it skips — then calls `handle`, commits, and only then
acks the Kafka offset. On repeated failure (`maxRetries`, default 5) it publishes to `<topic>.dlq`.

## Health

* `GET /health/live` → 200 always once the process is up.
* `GET /health/ready` → 200 only if DB `SELECT 1`, Kafka admin `describeCluster`, and Redis `PING` succeed; 503 otherwise with `{ checks: {...} }`.

## package.json scripts

```json
{
  "dev": "tsx watch src/main.ts",
  "build": "tsc -p tsconfig.build.json",
  "start": "node dist/main.js",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:integration": "vitest run test/integration",
  "prisma": "prisma",
  "seed": "tsx scripts/seed.ts",
  "backfill": "tsx scripts/backfill-from-legacy.ts"
}
```
