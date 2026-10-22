import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { RateLimiter } from '../src/rate-limit.js';

test('HTTP pipeline enforces origins, auth, readiness, and bounded JSON', async (t) => {
  let ready = true;
  const config = { origins: new Set(['http://localhost:5173', 'https://localhost']), trustProxyHops: 0, logLevel: 'silent' };
  const auth = { authenticate: async () => ({ user: { _id: 'user' } }), me: async () => ({ user: { id: 'user' } }), loginGoogle: async ({ credential }) => ({ token: credential }), loginGitHub: async ({ code }, origin) => ({ token: code, origin }) };
  const files = {
    listMine: async () => ({ items: [] }),
    list: async (userId, roomId) => ({ items: [{ userId, roomId }] }),
    create: async (_token, roomId, payload) => ({ file: { roomId, ...payload } }),
    get: async (_userId, roomId, fileId) => ({ file: { roomId, fileId } }),
    update: async (_token, roomId, fileId, payload) => ({ file: { roomId, fileId, ...payload } }),
    history: async (_userId, roomId, fileId) => ({ items: [{ roomId, fileId, revision: 0 }] }),
    version: async (_userId, roomId, fileId, revision) => ({ version: { roomId, fileId, revision } }),
    restore: async (_token, roomId, fileId, revision, payload) => ({ file: { roomId, fileId, revision, ...payload } }),
    contributions: async (_userId, roomId, fileId) => ({ areas: [{ roomId, fileId }] }),
    assign: async (_token, roomId, fileId, payload) => ({ areas: [{ roomId, fileId, ...payload }] }),
  };
  const codeRunner = { run: async (payload) => ({ status: 'Accepted', stdout: `${payload.language} output`, stderr: '', compileOutput: '', time: '0.001', memory: 1000 }) };
  let runFileType = 'code';
  files.get = async (_userId, roomId, fileId) => ({ file: { roomId, fileId, type: runFileType } });
  const app = createApp(config, { db: { command: async () => ({ ok: 1 }) }, auth, rooms: {}, notes: {}, files, codeRunner, limiter: new RateLimiter(), ready: () => ready });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const fetchJson = async (path, options) => { const response = await fetch(`${url}${path}`, options); return { response, body: await response.json() }; };
  const blocked = await fetchJson('/api/v1/auth/me', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.body.error.code, 'ORIGIN_FORBIDDEN');
  assert.ok(blocked.body.error.requestId);
  const unauthed = await fetchJson('/api/v1/auth/me', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(unauthed.response.status, 401);
  assert.equal(unauthed.response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal(unauthed.response.headers.get('Cache-Control'), 'no-store');
  assert.equal(unauthed.response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal((await fetchJson('/api/v1/rooms/room/files')).response.status, 401);
  const filesList = await fetchJson('/api/v1/rooms/room/files', { headers: { Authorization: 'Bearer test', Origin: 'http://localhost:5173' } });
  assert.equal(filesList.response.status, 200);
  assert.equal(filesList.body.data.items[0].roomId, 'room');
  const newFile = await fetchJson('/api/v1/rooms/room/files', { method: 'POST', headers: { Authorization: 'Bearer test', Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'document', title: 'Brief' }) });
  assert.equal(newFile.response.status, 201);
  assert.equal(newFile.body.data.file.title, 'Brief');
  const fileHistory = await fetchJson('/api/v1/rooms/room/files/file/history?limit=5', { headers: { Authorization: 'Bearer test', Origin: 'http://localhost:5173' } });
  assert.equal(fileHistory.body.data.items[0].revision, 0);
  const fileVersion = await fetchJson('/api/v1/rooms/room/files/file/history/2', { headers: { Authorization: 'Bearer test', Origin: 'http://localhost:5173' } });
  assert.equal(fileVersion.body.data.version.revision, 2);
  const restoreFile = await fetchJson('/api/v1/rooms/room/files/file/history/1/restore', { method: 'POST', headers: { Authorization: 'Bearer test', Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: 'd894aeb7-003b-433d-9346-b79183104df6', expectedRevision: 2 }) });
  assert.equal(restoreFile.body.data.file.expectedRevision, 2);
  const contributionMap = await fetchJson('/api/v1/rooms/room/files/file/contributions', { headers: { Authorization: 'Bearer test', Origin: 'http://localhost:5173' } });
  assert.equal(contributionMap.body.data.areas.length, 1);
  const run = await fetchJson('/api/v1/rooms/room/files/file/run', { method: 'POST', headers: { Authorization: 'Bearer test', Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ language: 'python', source: 'print(1 + 1)', stdin: '' }) });
  assert.equal(run.response.status, 200);
  assert.equal(run.body.data.stdout, 'python output');
  runFileType = 'document';
  const wrongFileType = await fetchJson('/api/v1/rooms/room/files/file/run', { method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ language: 'python', source: 'print(1)' }) });
  assert.equal(wrongFileType.response.status, 422);
  const assignedArea = await fetchJson('/api/v1/rooms/room/files/file/assignments', { method: 'POST', headers: { Authorization: 'Bearer test', Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ areaId: 'document', assigneeId: null }) });
  assert.equal(assignedArea.body.data.areas[0].areaId, 'document');
  const google = await fetchJson('/api/v1/auth/google', { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: 'test' }) });
  assert.equal(google.response.status, 200);
  assert.equal(google.body.data.token, 'test');
  const github = await fetchJson('/api/v1/auth/github', { method: 'POST', headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'test' }) });
  assert.equal(github.response.status, 200);
  assert.equal(github.body.data.origin, 'http://localhost:5173');
  const android = await fetchJson('/health/ready', { headers: { Origin: 'https://localhost' } });
  assert.equal(android.response.status, 200);
  assert.equal(android.response.headers.get('Access-Control-Allow-Origin'), 'https://localhost');
  assert.equal((await fetchJson('/health/ready')).body.status, 'ok');
  const huge = await fetchJson('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ padding: 'x'.repeat(300_000) }) });
  assert.equal(huge.response.status, 413);
  ready = false;
  assert.equal((await fetchJson('/health/ready')).response.status, 503);
  assert.equal((await fetchJson('/api/v1/auth/me')).response.status, 503);
});
