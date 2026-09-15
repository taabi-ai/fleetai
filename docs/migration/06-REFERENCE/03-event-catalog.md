# 03 · Event catalog (v1)

Envelope (all events): `{ eventId: uuidv7, type, schemaVersion: 1, occurredAt: ISO-8601, producer: '<service>', traceId, actor?: { userId, role }, data }`. Topic = `fleetai.<domain>.<entity>.<verb>` unless noted. Key = aggregate id. Retention 7 d (telemetry 30 d). DLQ = `<topic>.dlq`.

| Type | Topic | Key | data | Producer | Consumers |
|---|---|---|---|---|---|
| identity.user.created | fleetai.identity.user.created | userId | `{id,email,name,role}` | identity | dashboard (user_summary), ai (default quota), notification (welcome) |
| identity.user.updated | fleetai.identity.user.updated | userId | `{id,email,name,role,tokenVersion}` | identity | dashboard, gateway (deny-list if role changed) |
| identity.user.deleted | fleetai.identity.user.deleted | userId | `{id}` | identity | dashboard, ai, media, training (anonymise/cascade) |
| identity.role.updated | fleetai.identity.role.updated | roleName | `{name,label,permissions[]}` | identity | gateway (bump all tokens of role), platform-config (menu cache) |
| identity.login.succeeded / failed | fleetai.identity.login.* | userId/email | `{email,ip,ua,reason?}` | identity | platform-config (audit) |
| identity.token.revoked | fleetai.identity.token.revoked | userId | `{userId,tokenVersion}` | identity | gateway (Redis deny-list) |
| dashboard.created/updated/deleted | fleetai.dashboard.dashboard.* | dashboardId | `{id,ownerId,name}` | dashboard | platform-config (audit) |
| widget.created/updated/deleted/locked | fleetai.dashboard.widget.* | widgetId | `{id,dashboardId,type,config}` | dashboard | audit |
| dashboard.shared | fleetai.dashboard.dashboard.shared | dashboardId | `{id,ownerId,sharedWithUserId,permission}` | dashboard | notification, audit |
| telemetry.vehicle.position | telemetry.vehicle.position | vehicleCode | `{vehicleCode,time,lat,lng,speedKph,soc?,fuelPct?}` | ingest-api | fleet-metrics consumer |
| telemetry.vehicle.event | telemetry.vehicle.event | vehicleCode | `{vehicleCode,time,type(adas/fault/geofence),severity,payload}` | ingest-api | fleet-metrics |
| telemetry.charging.session | telemetry.charging.session | vehicleCode | `{vehicleCode,depot,startTime,durationMin,energyKwh}` | ingest-api | fleet-metrics |
| fleet.alert.raised | fleetai.fleet.alert.raised | alertId | `{code,vehicleCode?,type,severity,cityName?,occurredAt}` | fleet-metrics | notification, audit |
| fleet.dailystat.rolled_up | fleetai.fleet.dailystat.rolled_up | day | `{day, metrics{...16}}` | fleet-metrics | (cache invalidation in fleet-metrics api replicas via Redis pub/sub) |
| fleet.vehicle.updated | fleetai.fleet.vehicle.updated | vehicleCode | `{code,status,driverName,cityName}` | fleet-metrics | audit |
| ai.job.completed / failed | fleetai.ai.job.* | jobId | `{jobId,userId,dashboardId?,mode,tokens,durationMs,error?}` | ai | notification (optional), audit |
| ai.usage.recorded | fleetai.ai.usage.recorded | userId | `{userId,provider,model,promptTokens,completionTokens,costMicro}` | ai | audit |
| ai.quota.exhausted | fleetai.ai.quota.exhausted | userId | `{userId,limit,used}` | ai | notification (user + admins) |
| config.changed | fleetai.config.changed | key | `{key,scope(env/integration/smtp/menu),secret:boolean}` | platform-config | all services (`@fleetai/config` cache invalidation), notification (smtp) |
| audit.recorded | fleetai.audit.recorded | entityId | `{actor,entity,entityId,verb,before?,after?,ip,ua}` | **every service** via `@Audited()` | platform-config (AuditLog writer) |
| notification.sent / failed | fleetai.notification.* | notificationId | `{id,userId,channel,error?}` | notification | audit |
| media.asset.created / deleted | fleetai.media.asset.* | assetId | `{id,key,bucket,contentType,size,isPublic}` | media | training (unlink), audit |
| training.lesson.completed | fleetai.training.lesson.completed | userId | `{userId,moduleId,lessonId}` | training | notification (module complete), audit |
| training.module.published | fleetai.training.module.published | moduleId | `{id,slug,internal}` | training | notification |
| dora.event.received | fleetai.eng.dora.received | eventId | `{type,repo,env,ts,...}` | engineering | audit |

## Topic provisioning (`infra/redpanda/topics.yaml`)

```yaml
topics:
  - { name: telemetry.vehicle.position, partitions: 12, retention_ms: 2592000000 }   # 30 d
  - { name: telemetry.vehicle.event,    partitions: 6,  retention_ms: 2592000000 }
  - { name: telemetry.charging.session, partitions: 3,  retention_ms: 2592000000 }
  - { name: fleetai.audit.recorded,     partitions: 6,  retention_ms: 604800000 }    # 7 d
  - { name: fleetai.config.changed,     partitions: 1,  retention_ms: 604800000, cleanup_policy: compact }
  # one entry per remaining fleetai.* topic, partitions: 3, retention 7 d; every topic gets a `.dlq` twin
```
