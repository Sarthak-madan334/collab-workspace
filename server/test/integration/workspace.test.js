import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { io as createClient } from 'socket.io-client';
import { connectDatabase } from '../../src/db.js';
import { createAuthService } from '../../src/auth.js';
import { createRoomService } from '../../src/rooms.js';
import { createNoteService } from '../../src/notes.js';
import { createApp } from '../../src/app.js';
import { createSocketServer } from '../../src/socket.js';
import { RoomQueue } from '../../src/queue.js';
import { RateLimiter } from '../../src/rate-limit.js';
import { Presence } from '../../src/presence.js';

const uri = process.env.MONGODB_TEST_URI;
test('real HTTP, MongoDB transaction, and Socket.IO collaboration', { skip: !uri && 'Set MONGODB_TEST_URI to a transaction-capable isolated test cluster' }, async (t) => {
  const config = {
    mongoUri: uri, dbName: `synkro_test_${randomUUID().replaceAll('-', '')}`,
    origins: new Set(['http://localhost:5173']), sessionTtlMs: 60_000,
    trustProxyHops: 0, port: 0,
  };
  const { client, db } = await connectDatabase(config);
  const queue = new RoomQueue();
  const limiter = new RateLimiter();
  const presence = new Presence();
  let sockets;
  const auth = createAuthService(db, client, config, (id) => sockets?.revoke(id));
  const rooms = createRoomService(db, client, auth, queue);
  const notes = createNoteService(db, client, auth, rooms, queue, (event, payload) => sockets?.publish(event, payload));
  const server = createServer(createApp(config, { db, auth, rooms, notes, limiter }));
  sockets = createSocketServer(server, config, { auth, rooms, notes, queue, presence, limiter });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => sockets.io.close(resolve));
    await db.dropDatabase();
    await client.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = 'GET', token, body) => {
    const response = await fetch(`${base}/api/v1${path}`, {
      method, headers: { Origin: 'http://localhost:5173', ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const alice = (await request('/auth/register', 'POST', null, { name: 'Alice', email: 'alice@example.test', password: 'very-secure-passphrase' })).data;
  const bob = (await request('/auth/register', 'POST', null, { name: 'Bob', email: 'bob@example.test', password: 'very-secure-passphrase' })).data;
  assert.equal(await db.collection('users').countDocuments({}), 2);
  assert.equal(await db.collection('sessions').countDocuments({}), 2);
  assert.equal((await request('/auth/login', 'POST', null, { email: 'alice@example.test', password: 'wrong' })).status, 401);
  const created = await request('/rooms', 'POST', alice.token, { name: 'Project notes' });
  assert.equal(created.status, 201);
  const roomId = created.data.room.id;
  assert.equal(await db.collection('notes').countDocuments({}), 1);
  assert.equal(await db.collection('versions').countDocuments({}), 1);
  assert.equal((await request(`/rooms/${roomId}/note`, 'GET', bob.token)).status, 404);
  assert.equal((await request('/rooms/join', 'POST', bob.token, { inviteCode: created.data.inviteCode })).status, 200);
  assert.equal(await db.collection('memberships').countDocuments({}), 2);
  assert.equal((await request(`/rooms/${roomId}/invite`, 'GET', bob.token)).status, 403);
  assert.equal((await request('/rooms/join', 'POST', bob.token, { inviteCode: created.data.inviteCode })).status, 200);
  const connect = async (token) => {
    const socket = createClient(base, { auth: { token }, transports: ['websocket'], extraHeaders: { Origin: 'http://localhost:5173' } });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    t.after(() => socket.disconnect());
    return socket;
  };
  const first = await connect(alice.token);
  const second = await connect(bob.token);
  const joined1 = await first.emitWithAck('room:join', { roomId });
  const joined2 = await second.emitWithAck('room:join', { roomId });
  assert.equal(joined1.data.note.revision, 0);
  assert.equal(joined2.data.presence.length, 2);
  assert.equal(first.io.engine.transport.name, 'websocket');
  const op1 = randomUUID();
  const edit1 = await first.emitWithAck('note:update', { roomId, operationId: op1, baseRevision: 0, content: 'Alice draft' });
  assert.equal(edit1.data.appliedRevision, 1);
  const retry = await first.emitWithAck('note:update', { roomId, operationId: op1, baseRevision: 0, content: 'Alice draft' });
  assert.equal(retry.data.appliedRevision, 1);
  const changedRetry = await first.emitWithAck('note:update', { roomId, operationId: op1, baseRevision: 0, content: 'Changed draft' });
  assert.equal(changedRetry.error.code, 'OPERATION_ID_REUSED');
  const otherUserRetry = await second.emitWithAck('note:update', { roomId, operationId: op1, baseRevision: 0, content: 'Alice draft' });
  assert.equal(otherUserRetry.error.code, 'OPERATION_ID_REUSED');
  const edit2 = await second.emitWithAck('note:update', { roomId, operationId: randomUUID(), baseRevision: 0, content: 'Bob draft' });
  assert.equal(edit2.data.appliedRevision, 2);
  assert.equal((await request(`/rooms/${roomId}/note`, 'GET', alice.token)).data.note.content, 'Bob draft');
  const futureEdit = await first.emitWithAck('note:update', { roomId, operationId: randomUUID(), baseRevision: 50, content: 'Future draft' });
  assert.equal(futureEdit.error.code, 'INVALID_REQUEST');
  const parallel = await Promise.all([
    first.emitWithAck('note:update', { roomId, operationId: randomUUID(), baseRevision: 2, content: 'Alice concurrent' }),
    second.emitWithAck('note:update', { roomId, operationId: randomUUID(), baseRevision: 2, content: 'Bob concurrent' }),
  ]);
  assert.deepEqual(parallel.map((result) => result.data.appliedRevision).sort(), [3, 4]);
  assert.equal(await db.collection('versions').countDocuments({}), 5);
  const history = await request(`/rooms/${roomId}/versions?limit=2`, 'GET', alice.token);
  assert.deepEqual(history.data.items.map((row) => row.revision), [4, 3]);
  assert.equal(history.data.nextBeforeRevision, 3);
  const olderHistory = await request(`/rooms/${roomId}/versions?limit=2&beforeRevision=3`, 'GET', alice.token);
  assert.deepEqual(olderHistory.data.items.map((row) => row.revision), [2, 1]);
  assert.equal((await request(`/rooms/${roomId}/versions/1`, 'GET', bob.token)).data.version.content, 'Alice draft');
  const charlie = (await request('/auth/register', 'POST', null, { name: 'Charlie', email: 'charlie@example.test', password: 'very-secure-passphrase' })).data;
  const rotated = await request(`/rooms/${roomId}/invite/rotate`, 'POST', alice.token);
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.data.inviteCode, created.data.inviteCode);
  assert.equal((await request('/rooms/join', 'POST', charlie.token, { inviteCode: created.data.inviteCode })).status, 404);
  assert.equal((await request('/rooms/join', 'POST', charlie.token, { inviteCode: rotated.data.inviteCode })).status, 200);
  assert.equal((await db.collection('rooms').findOne({ _id: new ObjectId(roomId) })).inviteRedemptions, 3);
  const eve = (await request('/auth/register', 'POST', null, { name: 'Eve', email: 'eve@example.test', password: 'very-secure-passphrase' })).data;
  let reachedWrite;
  const atWrite = new Promise((resolve) => { reachedWrite = resolve; });
  let releaseWrite;
  const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
  const roomCollection = db.collection('rooms');
  const gatedRoomCollection = new Proxy(roomCollection, {
    get(target, property) {
      if (property === 'findOneAndUpdate') return async (...args) => {
        reachedWrite();
        await writeGate;
        return target.findOneAndUpdate(...args);
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const competingRooms = createRoomService({ collection: (name) => name === 'rooms' ? gatedRoomCollection : db.collection(name) }, client, auth, new RoomQueue());
  const staleJoin = competingRooms.join(eve.token, { inviteCode: rotated.data.inviteCode });
  await atWrite;
  assert.equal((await request(`/rooms/${roomId}/invite/rotate`, 'POST', alice.token)).status, 200);
  releaseWrite();
  await assert.rejects(staleJoin, { code: 'INVALID_INVITE' });
  assert.equal(await db.collection('memberships').countDocuments({ roomId: new ObjectId(roomId), userId: new ObjectId(eve.user.id) }), 0);
  assert.equal((await request(`/rooms/${roomId}/versions/1/restore`, 'POST', bob.token, { operationId: randomUUID(), expectedRevision: 4 })).status, 403);
  const restored = await request(`/rooms/${roomId}/versions/1/restore`, 'POST', alice.token, { operationId: randomUUID(), expectedRevision: 4 });
  assert.equal(restored.data.note.revision, 5);
  assert.equal(restored.data.note.content, 'Alice draft');
  assert.equal((await request(`/rooms/${roomId}/versions/1/restore`, 'POST', alice.token, { operationId: randomUUID(), expectedRevision: 4 })).error.code, 'REVISION_CONFLICT');
  const status = await first.emitWithAck('note:status', { roomId, operationId: op1 });
  assert.equal(status.data.committed, true);
  const hiddenStatus = await second.emitWithAck('note:status', { roomId, operationId: op1 });
  assert.equal(hiddenStatus.data.committed, false);
  const third = await connect(charlie.token);
  await third.emitWithAck('room:join', { roomId });
  const maxContent = 'x'.repeat(5 * 1024 * 1024);
  const maxEdit = await third.emitWithAck('note:update', { roomId, operationId: randomUUID(), baseRevision: 5, content: maxContent });
  assert.equal(maxEdit.data.note.revision, 6);
  assert.equal(maxEdit.data.note.content.length, maxContent.length);
  const afterLargeHistory = await request(`/rooms/${roomId}/versions?limit=1`, 'GET', alice.token);
  assert.equal(afterLargeHistory.data.items[0].revision, 6);
  assert.equal(JSON.stringify(afterLargeHistory.data).includes(maxContent), false);
  const oversized = await third.emitWithAck('note:update', { roomId, operationId: randomUUID(), baseRevision: 6, content: 'é'.repeat(5 * 1024 * 1024 / 2 + 1) });
  assert.equal(oversized.error.code, 'PAYLOAD_TOO_LARGE');
  assert.equal((await request(`/rooms/${roomId}/note`, 'GET', alice.token)).data.note.revision, 6);
  const shortSessionAuth = createAuthService(db, client, { sessionTtlMs: 800 });
  const shortSession = await shortSessionAuth.register({ name: 'Dana', email: 'dana@example.test', password: 'very-secure-passphrase' });
  const idle = await connect(shortSession.token);
  const expired = new Promise((resolve) => idle.once('session:expired', resolve));
  const idleDisconnected = new Promise((resolve) => idle.once('disconnect', resolve));
  assert.deepEqual(await expired, { code: 'UNAUTHENTICATED' });
  await idleDisconnected;
  assert.equal((await request('/auth/me', 'GET', shortSession.token)).status, 401);
  const disconnected = new Promise((resolve) => first.once('disconnect', resolve));
  await request('/auth/logout', 'POST', alice.token);
  await disconnected;
});
