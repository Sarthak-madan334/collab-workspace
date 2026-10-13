import { Server } from 'socket.io';
import { assert, publicError } from './errors.js';
import { content, object, objectId } from './validation.js';
import { publicUser } from './auth.js';

export function createSocketServer(httpServer, config, { auth, rooms, notes, queue, presence, limiter, ready = () => true }) {
  const maxSocketsPerUser = 8;
  const maxSocketsTotal = 1000;
  const maxRoomsPerSocket = 20;
  const maxPendingPerSocket = 8;
  const maxPendingTotal = 256;
  const clientAddress = (request) => {
    const forwarded = request.headers['x-forwarded-for'];
    if (config.trustProxyHops > 0 && typeof forwarded === 'string') {
      const addresses = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
      return addresses.at(-config.trustProxyHops) || request.socket.remoteAddress || 'unknown';
    }
    return request.socket.remoteAddress || 'unknown';
  };
  const io = new Server(httpServer, {
    cors: { origin: [...config.origins], methods: ['GET', 'POST'] },
    // JSON escaping can expand a valid 5 MiB UTF-8 note considerably.
    maxHttpBufferSize: 32 * 1024 * 1024,
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      if (!origin || !config.origins.has(origin)) return callback('Origin not allowed', false);
      if (!ready()) return callback('SERVICE_UNAVAILABLE', false);
      try {
        limiter.check(`socket-handshake:${clientAddress(request)}`, 30, 60 * 1000);
        assert(io.engine.clientsCount < maxSocketsTotal, 429, 'RATE_LIMITED', 'Too many connections');
        callback(null, true);
      } catch { callback('RATE_LIMITED', false); }
    },
  });
  const sessions = new Map();
  const users = new Map();
  const activeHandlers = new Set();

  function expire(socket) {
    if (socket.connected && !socket.data.expiring) {
      socket.data.expiring = true;
      socket.emit('session:expired', { code: 'UNAUTHENTICATED' });
      const timer = setTimeout(() => socket.disconnect(true), 25);
      timer.unref?.();
    }
  }
  function revoke(sessionId) {
    for (const socket of sessions.get(sessionId) || []) expire(socket);
  }
  function publish(event, payload) { io.to(payload.roomId).emit(event, payload); }
  function publishPresence(roomId) { publish('presence:updated', presence.snapshot(roomId)); }

  io.use(async (socket, next) => {
    try {
      assert(ready(), 503, 'SERVICE_UNAVAILABLE', 'Server is shutting down');
      const token = socket.handshake.auth?.token;
      const actor = await auth.authenticate(token);
      assert(ready(), 503, 'SERVICE_UNAVAILABLE', 'Server is shutting down');
      if (io.of('/').sockets.size >= maxSocketsTotal || (users.get(actor.user._id.toString())?.size || 0) >= maxSocketsPerUser) {
        return next(new Error('CONNECTION_LIMIT'));
      }
      socket.data.token = token;
      socket.data.userId = actor.user._id.toString();
      socket.data.user = publicUser(actor.user);
      socket.data.sessionId = actor.session._id.toString();
      socket.data.expiresAt = actor.session.expiresAt.getTime();
      next();
    } catch (err) { next(new Error(publicError(err).code)); }
  });

  io.on('connection', (socket) => {
    const { sessionId, user, userId, token, expiresAt } = socket.data;
    if ((users.get(userId)?.size || 0) >= maxSocketsPerUser || io.of('/').sockets.size > maxSocketsTotal) {
      socket.disconnect(true);
      return;
    }
    let group = sessions.get(sessionId);
    if (!group) { group = new Set(); sessions.set(sessionId, group); }
    group.add(socket);
    let userSockets = users.get(userId);
    if (!userSockets) { userSockets = new Set(); users.set(userId, userSockets); }
    userSockets.add(socket);
    const timer = setTimeout(() => expire(socket), Math.max(0, expiresAt - Date.now()));
    timer.unref?.();
    let pendingEvents = 0;

    const event = (name, handler) => socket.on(name, (payload, ack) => {
      if (pendingEvents >= maxPendingPerSocket || activeHandlers.size >= maxPendingTotal) {
        if (typeof ack === 'function') ack({ ok: false, error: { code: 'RATE_LIMITED', message: 'Server is busy. Try again shortly' } });
        return;
      }
      pendingEvents += 1;
      const pending = (async () => {
        try {
          assert(ready(), 503, 'SERVICE_UNAVAILABLE', 'Server is shutting down');
          await auth.authenticate(token);
          assert(ready(), 503, 'SERVICE_UNAVAILABLE', 'Server is shutting down');
          const data = await handler(payload);
          if (typeof ack === 'function') ack({ ok: true, data });
        } catch (err) {
          const publicFailure = publicError(err);
          if (!(err instanceof Error && err.name === 'AppError')) console.error('Socket event failed', name, err?.name || 'Error');
          if (typeof ack === 'function') ack({ ok: false, error: { code: publicFailure.code, message: publicFailure.message } });
          if (publicFailure.code === 'UNAUTHENTICATED') expire(socket);
        }
      })();
      activeHandlers.add(pending);
      const finished = () => { pendingEvents -= 1; activeHandlers.delete(pending); };
      pending.then(finished, finished);
    });
    const roomPayload = (payload) => { object(payload, ['roomId']); return objectId(payload.roomId).toString(); };
    const requireJoined = (roomId) => assert(presence.has(roomId, socket.id), 403, 'ROOM_NOT_JOINED', 'Join this room first');

    event('room:join', async (payload) => {
      const roomId = roomPayload(payload);
      limiter.check(`room-join:${userId}`, 30, 60 * 1000);
      return queue.run(roomId, async () => {
        await auth.authenticate(token);
        const { note } = await rooms.note(userId, roomId);
        assert(socket.connected, 503, 'SERVICE_UNAVAILABLE', 'Connection closed');
        assert(presence.has(roomId, socket.id) || presence.roomsFor(socket.id).length < maxRoomsPerSocket, 429, 'RATE_LIMITED', 'Too many joined rooms');
        await socket.join(roomId);
        assert(socket.connected, 503, 'SERVICE_UNAVAILABLE', 'Connection closed');
        const changed = presence.add(roomId, socket.id, user);
        if (changed) publishPresence(roomId);
        const { users, presenceSequence } = presence.snapshot(roomId);
        return { note, presence: users, presenceSequence };
      });
    });
    event('room:leave', async (payload) => {
      const roomId = roomPayload(payload);
      return queue.run(roomId, async () => {
        await socket.leave(roomId);
        if (presence.remove(roomId, socket.id, userId)) publishPresence(roomId);
        return { roomId };
      });
    });
    event('note:update', async (payload) => {
      const roomId = objectId(payload?.roomId).toString();
      requireJoined(roomId);
      limiter.check(`edit:${userId}:${roomId}`, 5, 1000);
      const noteContent = content(payload?.content);
      limiter.check(`edit-bytes:${userId}:${roomId}`, 60 * 1024 * 1024, 60 * 1000, Buffer.byteLength(noteContent, 'utf8'));
      return notes.apply(token, payload);
    });
    event('note:sync', async (payload) => {
      const roomId = roomPayload(payload);
      requireJoined(roomId);
      limiter.check(`sync:${userId}:${roomId}`, 30, 60 * 1000);
      return queue.run(roomId, async () => {
        await auth.authenticate(token);
        const { note } = await rooms.note(userId, roomId);
        const { users, presenceSequence } = presence.snapshot(roomId);
        return { note, presence: users, presenceSequence };
      });
    });
    event('note:status', async (payload) => {
      const roomId = objectId(payload?.roomId).toString();
      requireJoined(roomId);
      limiter.check(`status:${userId}:${roomId}`, 30, 60 * 1000);
      return notes.status(userId, payload);
    });
    socket.on('disconnect', () => {
      clearTimeout(timer);
      group.delete(socket);
      if (!group.size) sessions.delete(sessionId);
      userSockets.delete(socket);
      if (!userSockets.size) users.delete(userId);
      for (const roomId of presence.roomsFor(socket.id)) {
        if (presence.remove(roomId, socket.id, userId)) publishPresence(roomId);
      }
    });
  });
  async function drain() {
    while (activeHandlers.size) await Promise.all([...activeHandlers]);
  }
  return { io, revoke, publish, drain };
}
