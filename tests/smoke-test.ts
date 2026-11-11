/**
 * End-to-end smoke test: starts the real server on a spare port and connects two WebSocket clients.
 * Checks host, join by code, snapshot flow, bad-code rejection, /api/info and room cleanup.
 * Run with `npm run test:smoke`; exits non-zero on failure.
 */
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import type { S2C } from '@shared/net/protocol';

const PORT = 3199;
let failed = 0;

/** Records a named check. */
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

/** Resolves after `ms` milliseconds. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A connected test client that records every message. */
interface Client {
  ws: WebSocket;
  msgs: S2C[];
}

/** Opens a socket and starts recording messages. */
function connect(): Promise<Client> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    const msgs: S2C[] = [];
    ws.on('message', (d) => msgs.push(JSON.parse(d.toString()) as S2C));
    ws.on('open', () => resolve({ ws, msgs }));
    ws.on('error', reject);
  });
}

/** Waits until a message matching the predicate has arrived. */
async function waitFor(c: Client, pred: (m: S2C) => boolean, ms = 2000): Promise<S2C | undefined> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = c.msgs.find(pred);
    if (m) return m;
    await sleep(20);
  }
  return undefined;
}

const server = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let ready = false;
server.stdout.on('data', (d: Buffer) => {
  if (d.toString().includes('listening')) ready = true;
});

try {
  for (let i = 0; i < 100 && !ready; i++) await sleep(100);
  check('server starts', ready);

  const info = (await (await fetch(`http://127.0.0.1:${PORT}/api/info`)).json()) as { name: string; lan: string[] };
  check('/api/info answers', info.name === 'IT Wars' && Array.isArray(info.lan));

  const host = await connect();
  host.ws.send(JSON.stringify({ t: 'host', name: 'Host' }));
  const joined = await waitFor(host, (m) => m.t === 'joined');
  check('host gets joined message with a code', joined?.t === 'joined' && /^[A-HJ-NP-Z2-9]{4}$/.test(joined.code));
  const code = joined?.t === 'joined' ? joined.code : '';
  check('joined message carries the door states (10 doors, some half-closed)', joined?.t === 'joined' && joined.doors.length === 20 && joined.doors.includes(50) && joined.doors.includes(100));

  const bad = await connect();
  bad.ws.send(JSON.stringify({ t: 'join', code: 'ZZZZ', name: 'X' }));
  const err = await waitFor(bad, (m) => m.t === 'error');
  check('unknown code is rejected', err?.t === 'error' && err.reason === 'bad-code');
  bad.ws.send('not json');
  check('garbage gets bad-request', (await waitFor(bad, (m) => m.t === 'error' && m.reason === 'bad-request')) !== undefined);
  bad.ws.close();

  const guest = await connect();
  guest.ws.send(JSON.stringify({ t: 'join', code: code.toLowerCase(), name: 'Guest' }));
  const gj = await waitFor(guest, (m) => m.t === 'joined');
  check('guest joins by (lower-case) code', gj?.t === 'joined' && gj.players.length === 2);
  host.ws.send(JSON.stringify({ t: 'enter' }));
  guest.ws.send(JSON.stringify({ t: 'enter' }));
  check('host sees guest in roster', (await waitFor(host, (m) => m.t === 'roster' && m.players.length === 2)) !== undefined);

  let seq = 0;
  const timer = setInterval(() => {
    host.ws.send(JSON.stringify({ t: 'input', seq: ++seq, keys: 1, yaw: 0, pitch: 0, weapon: 1 }));
  }, 16);
  await sleep(600);
  clearInterval(timer);
  const snaps = host.msgs.filter((m) => m.t === 'snap');
  check('snapshots flow at ~30 Hz', snaps.length >= 10, `got ${snaps.length}`);
  const last = snaps[snaps.length - 1];
  check('server acks inputs', last?.t === 'snap' && last.me.ack > 10, `ack=${last?.t === 'snap' ? last.me.ack : '?'}`);
  check('host sees both players', last?.t === 'snap' && last.players.length === 2);

  guest.ws.close();
  host.ws.close();
  await sleep(200);
  const again = await connect();
  again.ws.send(JSON.stringify({ t: 'join', code, name: 'Late' }));
  check('empty room is deleted', (await waitFor(again, (m) => m.t === 'error' && m.reason === 'bad-code')) !== undefined);
  again.ws.close();
} finally {
  server.kill();
}

if (failed) process.exit(1);
console.log('test:smoke OK');
