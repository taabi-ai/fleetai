/**
 * @fleetai/queue — pgmq client with SKIP-LOCKED shim fallback.
 *
 * Feature-detects the `pgmq` extension and falls back to a plain-table shim
 * (`queue_<name>` + `pgmq_meta`). Application code always uses the same
 * `Queue` interface, so switching to the real extension (Track B) is a no-op.
 */

export type QueueName = string;

export interface QueueMessage<T = unknown> {
  msg_id: string | number | bigint;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: T;
}

export interface Queue<T = unknown> {
  send(message: T, delaySec?: number): Promise<string | number | bigint>;
  read(vtSec: number, qty?: number): Promise<QueueMessage<T>[]>;
  archive(msgId: string | number | bigint): Promise<boolean>;
  delete(msgId: string | number | bigint): Promise<boolean>;
  extend(msgId: string | number | bigint, vtSec: number): Promise<void>;
  purge(): Promise<void>;
}

export interface DbPoolLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
}

/** A generic pooled db client with a plain `query(sql, params)` surface (pg, postgres.js, …). */
export function createQueue<T = unknown>(pool: DbPoolLike, name: QueueName): Promise<Queue<T>> {
  return createQueueAuto(pool, name);
}

/**
 * Feature-detects `pgmq` (SELECT 1 FROM pg_extension WHERE extname='pgmq').
 * Falls back to the shim with a one-time warning log (no-op logger by default).
 */
export async function createQueueAuto<T = unknown>(
  pool: DbPoolLike,
  name: QueueName,
  logger: (msg: string) => void = () => {}
): Promise<Queue<T>> {
  let hasPgmq = false;
  try {
    const res = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'pgmq'`);
    hasPgmq = (res.rows.length ?? 0) > 0;
  } catch {
    hasPgmq = false;
  }
  if (!hasPgmq) {
    logger(`[queue:${name}] pgmq extension not found — using SKIP LOCKED shim`);
    return createSkipLockedQueue<T>(pool, name);
  }
  await pool.query(`SELECT pgmq.create($1)`, [name]);
  return createPgmqQueue<T>(pool, name);
}

/** Track B — real pgmq extension. */
export function createPgmqQueue<T = unknown>(pool: DbPoolLike, name: QueueName): Queue<T> {
  return {
    async send(message, delaySec = 0) {
      const res = await pool.query(`SELECT pgmq.send($1, $2::jsonb, $3) AS id`, [name, JSON.stringify(message), delaySec]);
      return (res.rows[0] as { id: bigint | number })!.id;
    },
    async read(vtSec, qty = 10) {
      const res = await pool.query(`SELECT * FROM pgmq.read($1, $2, $3)`, [name, vtSec, qty]);
      return res.rows as QueueMessage<T>[];
    },
    async archive(msgId) {
      const res = await pool.query(`SELECT pgmq.archive($1, $2)`, [name, msgId]);
      return (res.rows[0] as { archive: boolean }).archive;
    },
    async delete(msgId) {
      const res = await pool.query(`SELECT pgmq.delete($1, $2)`, [name, msgId]);
      return (res.rows[0] as { delete: boolean }).delete;
    },
    async extend(msgId, vtSec) {
      await pool.query(`SELECT pgmq.set_vt($1, $2, $3)`, [name, msgId, vtSec]);
    },
    async purge() {
      await pool.query(`TRUNCATE pgmq.q_${name}`);
    },
  };
}

/** Track A — SKIP LOCKED shim on plain tables (mirrors the PGMQ API). */
export function createSkipLockedQueue<T = unknown>(pool: DbPoolLike, name: QueueName): Queue<T> {
  return {
    async send(message, delaySec = 0) {
      await pool.query(`INSERT INTO pgmq_meta (queue_name) VALUES ($1) ON CONFLICT DO NOTHING`, [name]);
      await pool.query(
        `CREATE TABLE IF NOT EXISTS queue_${name} (
           msg_id bigserial PRIMARY KEY,
           read_ct int NOT NULL DEFAULT 0,
           enqueued_at timestamptz NOT NULL DEFAULT now(),
           vt timestamptz NOT NULL DEFAULT now(),
           message jsonb NOT NULL
         )`,
        []
      );
      const res = await pool.query(
        `INSERT INTO queue_${name} (vt, message) VALUES (now() + make_interval(secs => $2), $1::jsonb) RETURNING msg_id`,
        [JSON.stringify(message), delaySec]
      );
      return (res.rows[0] as { msg_id: bigint }).msg_id;
    },
    async read(vtSec, qty = 10) {
      const res = await pool.query(
        `WITH cte AS (
           SELECT msg_id FROM queue_${name}
           WHERE vt <= now() ORDER BY msg_id LIMIT $2 FOR UPDATE SKIP LOCKED
         )
         UPDATE queue_${name} t
            SET vt = now() + make_interval(secs => $3), read_ct = read_ct + 1
           FROM cte WHERE t.msg_id = cte.msg_id
         RETURNING t.msg_id, t.read_ct, t.enqueued_at, t.vt, t.message`,
        [name, qty, vtSec]
      );
      return res.rows as QueueMessage<T>[];
    },
    async archive(msgId) {
      const res = await pool.query(
        `WITH d AS (
           DELETE FROM queue_${name} WHERE msg_id = $2 RETURNING *
         )
         INSERT INTO queue_${name}_archive SELECT * FROM d RETURNING msg_id`,
        [name, msgId]
      );
      return res.rows.length > 0;
    },
    async delete(msgId) {
      const res = await pool.query(`DELETE FROM queue_${name} WHERE msg_id = $2`, [name, msgId]);
      return (res.rowCount ?? 0) > 0;
    },
    async extend(msgId, vtSec) {
      await pool.query(`UPDATE queue_${name} SET vt = now() + make_interval(secs => $3) WHERE msg_id = $2`, [name, msgId, vtSec]);
    },
    async purge() {
      await pool.query(`DELETE FROM queue_${name}`, [name]);
    },
  };
}

// ---------------------------------------------------------------------------
// Worker helper
// ---------------------------------------------------------------------------

export interface WorkerOptions {
  vtSec?: number;
  batch?: number;
  maxReads?: number;
  pollMs?: number;
  /** handler receives each message; if it throws, message is nacked (backoff). */
}

export async function runQueueWorker<T>(
  queue: Queue<T>,
  handler: (msg: QueueMessage<T>) => Promise<void>,
  opts: WorkerOptions = {},
  signal?: AbortSignal
): Promise<void> {
  const { vtSec = 60, batch = 10, maxReads = 5, pollMs = 5000 } = opts;
  while (!signal?.aborted) {
    const msgs = await queue.read(vtSec, batch);
    if (msgs.length === 0) {
      await sleep(pollMs, signal);
      continue;
    }
    await Promise.allSettled(
      msgs.map(async (m) => {
        try {
          await handler(m);
          await queue.archive(m.msg_id);
        } catch (err) {
          if (m.read_ct >= maxReads) {
            // dead-letter: send to dead_letter queue with original message + error
            await queue.send({ originalQueue: undefined, message: m.message, error: String(err) } as never);
            await queue.archive(m.msg_id);
          } else {
            await queue.extend(m.msg_id, Math.min(3600, 30 * 2 ** m.read_ct));
          }
        }
      })
    );
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => clearTimeout(t), { once: true });
  });
}
