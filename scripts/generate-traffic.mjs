#!/usr/bin/env node
/**
 * Generates realistic traffic against the API Gateway so the Grafana
 * dashboard has something to show.
 *
 *   npm run traffic                          # 2 min, ~2 orders/s
 *   npm run traffic -- --duration 60 --rate 5
 *   GATEWAY_URL=http://localhost:3010/api npm run traffic
 *
 * Mix per tick: create orders, cancel ~15% of them a few seconds later,
 * read orders/payments, and hit a few invalid/unknown ids (4xx).
 */

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((pair) => pair.trim().split(/\s+/)),
);

const BASE_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000/api';
const DURATION_S = Number(args.duration ?? 120);
const RATE = Number(args.rate ?? 2);
const USER_ID = '6f1c1f2e-8a8e-4a43-9a51-2b1e5d0b9c11';

const stats = { created: 0, cancelled: 0, reads: 0, errors: 0 };
const created = [];

async function call(method, path, body) {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status >= 500) stats.errors++;
    return res.ok ? res.json() : null;
  } catch {
    stats.errors++;
    return null;
  }
}

async function createOrder() {
  // 10.00 to 500.00, in integer cents
  const totalCents = Math.round((10 + Math.random() * 490) * 100);
  const res = await call('POST', '/orders', { userId: USER_ID, totalCents });
  if (!res?.orderId) return;

  stats.created++;
  created.push(res.orderId);

  if (Math.random() < 0.15) {
    setTimeout(
      () => {
        stats.cancelled++;
        void call('PATCH', `/orders/${res.orderId}/cancel`);
      },
      500 + Math.random() * 4000,
    );
  }
}

async function readSomething() {
  stats.reads++;
  const id = created[Math.floor(Math.random() * created.length)];
  const roll = Math.random();

  if (!id || roll < 0.2) return call('GET', '/orders?page=1&limit=10');
  if (roll < 0.5) return call('GET', `/orders/${id}`);
  if (roll < 0.8) return call('GET', `/payments/order/${id}`);
  if (roll < 0.9) return call('GET', '/payments/stats');
  if (roll < 0.95) return call('GET', '/orders/not-a-uuid'); // 400
  return call('GET', `/orders/${crypto.randomUUID()}`); // 404
}

async function main() {
  const health = await fetch(`${BASE_URL}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(
      `❌ Gateway not healthy at ${BASE_URL}/health. Is the stack up? (docker compose up -d)`,
    );
    process.exit(1);
  }

  console.log(
    `🚦 Sending ~${RATE} orders/s to ${BASE_URL} for ${DURATION_S}s (Ctrl+C to stop)`,
  );

  const end = Date.now() + DURATION_S * 1000;
  const progress = setInterval(() => {
    console.log(
      `   created=${stats.created} cancelled=${stats.cancelled} reads=${stats.reads} 5xx/network=${stats.errors}`,
    );
  }, 10_000);

  while (Date.now() < end) {
    for (let i = 0; i < RATE; i++) void createOrder();
    for (let i = 0; i < RATE * 2; i++) void readSomething();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  clearInterval(progress);
  console.log(
    `✅ Done: created=${stats.created} cancelled=${stats.cancelled} reads=${stats.reads} 5xx/network=${stats.errors}`,
  );
  console.log('📊 Grafana: http://localhost:3003 (admin / admin123)');
}

void main();
