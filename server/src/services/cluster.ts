import type { Server as IOServer } from 'socket.io';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { logger } from '../shared/logger';

/**
 * Running more than one server behind a load balancer: Redis (optional) carries
 *  - Socket.IO events between the servers (a person on server A sees what a person on server B edits), and
 *  - "forget this cached value" messages (folders, users, row totals), so a change made on one server is seen on the other at once.
 * REDIS_URL empty = a single server, nothing changes.
 */
export const NODE_ID = process.env.NODE_ID || `${process.env.COMPUTERNAME || process.env.HOSTNAME || 'node'}-${process.pid}`;
const URL = process.env.REDIS_URL ?? '';
export const clusterEnabled = !!URL;

const CHANNEL = 'dochub:broadcast';
const handlers = new Map<string, ((payload: string) => void)[]>();
let pub: Redis | null = null;

const connect = () => {
  const r = new Redis(URL, { maxRetriesPerRequest: null, enableOfflineQueue: true, retryStrategy: (n) => Math.min(2000, n * 200) });
  r.on('error', (e) => logger.warn(`Redis: ${e.message}`)); // a Redis outage must never take the site down: servers just stop hearing each other
  return r;
};

export function attachCluster(io: IOServer) {
  if (!clusterEnabled) return;
  pub = connect();
  const sub = pub.duplicate();
  sub.on('error', (e) => logger.warn(`Redis (sub): ${e.message}`));
  io.adapter(createAdapter(pub, sub));
  const bc = pub.duplicate();
  bc.on('error', (e) => logger.warn(`Redis (broadcast): ${e.message}`));
  void bc.subscribe(CHANNEL);
  bc.on('message', (_ch, raw) => {
    try {
      const m = JSON.parse(raw) as { from: string; kind: string; payload: string };
      if (m.from === NODE_ID) return;
      for (const h of handlers.get(m.kind) ?? []) h(m.payload);
    } catch { /* not ours */ }
  });
  logger.info(`Cluster on (node ${NODE_ID}, Redis ${URL.replace(/\/\/[^@]*@/, '//***@')})`);
}

/** Tell the OTHER servers something (they never get it back to themselves) */
export function broadcast(kind: string, payload = '') {
  if (!pub) return;
  void pub.publish(CHANNEL, JSON.stringify({ from: NODE_ID, kind, payload })).catch(() => undefined);
}
export function onBroadcast(kind: string, handler: (payload: string) => void) {
  handlers.set(kind, [...(handlers.get(kind) ?? []), handler]);
}
