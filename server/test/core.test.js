import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Presence } from '../src/presence.js';
import { RoomQueue } from '../src/queue.js';
import { content, operationId, roomCursor, encodeRoomCursor } from '../src/validation.js';
import { loadConfig } from '../src/config.js';
import { RateLimiter } from '../src/rate-limit.js';

test('presence deduplicates tabs and removes a user only after the last tab leaves', () => {
  const presence = new Presence();
  const user = { id: 'u1', name: 'Alex' };
  assert.equal(presence.add('r1', 'socket1', user), true);
  assert.equal(presence.add('r1', 'socket2', user), false);
  assert.deepEqual(presence.snapshot('r1').users, [user]);
  assert.equal(presence.remove('r1', 'socket1', 'u1'), false);
  assert.deepEqual(presence.snapshot('r1').users, [user]);
  assert.equal(presence.remove('r1', 'socket2', 'u1'), true);
  assert.deepEqual(presence.snapshot('r1').users, []);
  assert.equal(presence.snapshot('r1').presenceSequence, 2);
});

test('room queue serializes overlapping edits and bounds pending work', async () => {
  const queue = new RoomQueue(2);
  const order = [];
  let release;
  const first = queue.run('room', async () => { order.push('first'); await new Promise((resolve) => { release = resolve; }); });
  const second = queue.run('room', async () => { order.push('second'); });
  await Promise.resolve();
  assert.deepEqual(order, ['first']);
  assert.throws(() => queue.run('room', async () => {}), { code: 'RATE_LIMITED' });
  release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first', 'second']);
  assert.equal(queue.depth, 0);
});

test('payload boundaries reject oversized UTF-8 notes and malformed operations', () => {
  assert.equal(content('a'.repeat(5 * 1024 * 1024)).length, 5 * 1024 * 1024);
  assert.equal(content('é'.repeat(5 * 1024 * 1024 / 2)).length, 5 * 1024 * 1024 / 2);
  assert.throws(() => content('a'.repeat(5 * 1024 * 1024 + 1)), { code: 'PAYLOAD_TOO_LARGE' });
  assert.throws(() => content('é'.repeat(5 * 1024 * 1024 / 2 + 1)), { code: 'PAYLOAD_TOO_LARGE' });
  assert.equal(operationId(randomUUID()).length, 36);
  assert.throws(() => operationId('bad'), { code: 'INVALID_REQUEST' });
});

test('room pagination cursor round-trips its stable sort keys', () => {
  const row = { joinedAt: new Date('2026-01-02T03:04:05.000Z'), _id: { toString: () => '0123456789abcdef01234567' } };
  const cursor = roomCursor(encodeRoomCursor(row));
  assert.equal(cursor.joinedAt.toISOString(), row.joinedAt.toISOString());
  assert.equal(cursor.id.toString(), row._id.toString());
});

test('production config requires an exact HTTPS frontend origin', () => {
  const base = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://localhost', MONGODB_DB_NAME: 'synkro_test' };
  assert.throws(() => loadConfig({ ...base, CLIENT_ORIGINS: 'http://example.com' }), /HTTPS/);
  assert.equal(loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com' }).origins.has('https://example.com'), true);
  assert.equal(loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com' }).origins.has('https://localhost'), true);
  assert.equal(loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com' }).origins.has('http://localhost'), false);
  assert.equal(loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com' }).googleClientId, null);
  assert.equal(loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com', GOOGLE_CLIENT_ID: '123-test.apps.googleusercontent.com' }).googleClientId, '123-test.apps.googleusercontent.com');
  assert.throws(() => loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com', GOOGLE_CLIENT_ID: 'not-a-google-client' }), /GOOGLE_CLIENT_ID/);
  assert.equal(loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com' }).githubClientId, null);
  assert.equal(loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com' }).groqApiKey, null);
  const groq = loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com', GROQ_API_KEY: 'gsk-test-placeholder', GROQ_MODEL: 'openai/gpt-oss-20b' });
  assert.equal(groq.groqApiKey, 'gsk-test-placeholder');
  assert.equal(groq.groqModel, 'openai/gpt-oss-20b');
  assert.throws(() => loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com', GROQ_MODEL: 'invalid model' }), /GROQ_MODEL/);
  assert.equal(loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com', GITHUB_CLIENT_ID: 'Ov23liExample', GITHUB_CLIENT_SECRET: 'secret-that-stays-on-the-server' }).githubClientId, 'Ov23liExample');
  assert.throws(() => loadConfig({ ...base, CLIENT_ORIGINS: 'https://example.com', GITHUB_CLIENT_ID: 'Ov23liExample' }), /GITHUB_CLIENT_ID/);
});

test('rate-limit storage stays bounded under distinct keys', () => {
  const limiter = new RateLimiter(2);
  limiter.check('first', 1, 60_000);
  limiter.check('second', 1, 60_000);
  assert.throws(() => limiter.check('third', 1, 60_000), { code: 'RATE_LIMITED' });
  assert.equal(limiter.buckets.size, 2);
});

test('rate limiter accounts for note bytes, not just edit count', () => {
  const limiter = new RateLimiter();
  limiter.check('edit-bytes', 10, 60_000, 6);
  limiter.check('edit-bytes', 10, 60_000, 4);
  assert.throws(() => limiter.check('edit-bytes', 10, 60_000, 1), { code: 'RATE_LIMITED' });
});
