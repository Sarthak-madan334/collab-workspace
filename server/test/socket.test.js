import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { io as client } from 'socket.io-client';
import { createSocketServer } from '../src/socket.js';
import { RoomQueue } from '../src/queue.js';
import { Presence } from '../src/presence.js';
import { RateLimiter } from '../src/rate-limit.js';
import { error } from '../src/errors.js';

test('socket origin, membership, presence, and session revocation', async (t) => {
  const roomId = '0123456789abcdef01234567';
  const userId = 'abcdef0123456789abcdef01';
  const sessionId = '111111111111111111111111';
  const user = { _id: { toString: () => userId }, name: 'Alice' };
  let revoked = false;
  const auth = { authenticate: async (token) => {
    if (token === 'db-down') throw new Error('database unavailable');
    if (token !== 'valid' || revoked) throw error(401, 'UNAUTHENTICATED', 'Sign in again');
    return { user, session: { _id: { toString: () => sessionId }, expiresAt: new Date(Date.now() + 60_000) } };
  } };
  let member = false;
  let ready = true;
  const rooms = { note: async () => {
    if (!member) throw error(404, 'NOT_FOUND', 'Room not found');
    return { note: { roomId, content: '', revision: 0, updatedBy: userId, updatedAt: new Date().toISOString() } };
  } };
  const server = createServer();
  const presence = new Presence();
  const socketServer = createSocketServer(server, { origins: new Set(['http://localhost:5173']) }, {
    auth, rooms, notes: { apply: async () => { throw new Error('Should not edit'); }, status: async () => ({ committed: false }) },
    queue: new RoomQueue(), presence, limiter: new RateLimiter(), ready: () => ready,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => socketServer.io.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const connect = (token, origin = 'http://localhost:5173') => new Promise((resolve, reject) => {
    const socket = client(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { Origin: origin } });
    const timer = setTimeout(() => { socket.disconnect(); reject(new Error('Socket connection timed out')); }, 3000);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', (err) => { clearTimeout(timer); socket.disconnect(); reject(err); });
  });
  await assert.rejects(connect('valid', 'https://evil.example'));
  assert.equal(server.listening, true);
  await assert.rejects(connect('invalid'));
  await assert.rejects(connect('db-down'), { message: 'SERVICE_UNAVAILABLE' });
  const first = await connect('valid');
  t.after(() => first.disconnect());
  const denied = await first.emitWithAck('room:join', { roomId });
  assert.equal(denied.error.code, 'NOT_FOUND');
  assert.deepEqual(presence.snapshot(roomId).users, []);
  const editDenied = await first.emitWithAck('note:update', { roomId });
  assert.equal(editDenied.error.code, 'ROOM_NOT_JOINED');
  member = true;
  const joined = await first.emitWithAck('room:join', { roomId });
  assert.equal(joined.data.presence.length, 1);
  const second = await connect('valid');
  t.after(() => second.disconnect());
  await second.emitWithAck('room:join', { roomId });
  assert.equal(presence.snapshot(roomId).users.length, 1);
  await first.emitWithAck('room:leave', { roomId });
  assert.equal(presence.snapshot(roomId).users.length, 1);
  const extraSockets = [];
  for (let index = 0; index < 6; index += 1) extraSockets.push(await connect('valid'));
  t.after(() => extraSockets.forEach((socket) => socket.disconnect()));
  await assert.rejects(connect('valid'), { message: 'CONNECTION_LIMIT' });
  ready = false;
  assert.equal((await second.emitWithAck('note:sync', { roomId })).error.code, 'SERVICE_UNAVAILABLE');
  const disconnected = new Promise((resolve) => second.once('disconnect', resolve));
  revoked = true;
  socketServer.revoke(sessionId);
  await disconnected;
  assert.deepEqual(presence.snapshot(roomId).users, []);
});
