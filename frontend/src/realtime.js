import { io } from 'socket.io-client';
import { DEMO_MODE, DEMO_TOKEN, DEMO_USER, demoNote, demoSave, demoVersions } from './demo.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

export function createWorkspaceSocket(token) {
  if (DEMO_MODE && token === DEMO_TOKEN) return new LocalDemoSocket();
  return io(SOCKET_URL, {
    autoConnect: false,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 8000,
    timeout: 8000,
  });
}

class LocalDemoSocket {
  connected = false;
  listeners = new Map();
  activeRoom = null;
  on(event, listener) {
    const listeners = this.listeners.get(event) || new Set();
    listeners.add(listener); this.listeners.set(event, listeners); return this;
  }
  off(event, listener) {
    if (!listener) this.listeners.delete(event);
    else { const listeners = this.listeners.get(event); listeners?.delete(listener); if (!listeners?.size) this.listeners.delete(event); }
    return this;
  }
  dispatch(event, payload) { for (const listener of this.listeners.get(event) || []) listener(payload); }
  connect() {
    if (this.connected) return this;
    this.connected = true; queueMicrotask(() => this.dispatch('connect'));
    return this;
  }
  disconnect() {
    if (!this.connected) return this;
    this.connected = false; this.dispatch('disconnect', 'io client disconnect');
    return this;
  }
  emit(event, payload, callback) {
    if (event === 'room:leave') { if (this.activeRoom === payload?.roomId) this.activeRoom = null; return this; }
    this.respond(event, payload).then((data) => callback?.(null, { ok: true, data })).catch((error) => callback?.(null, { ok: false, error: { code: error.code || 'DEMO_ERROR', message: error.message } }));
    return this;
  }
  timeout() { return { emit: (event, payload, callback) => this.emit(event, payload, callback) }; }
  async respond(event, payload) {
    if (!this.connected) throw new Error('The local demo is reconnecting.');
    if (event === 'room:join') {
      this.activeRoom = payload.roomId;
      return {
        note: demoNote(payload.roomId),
        presence: [{ id: DEMO_USER.id, name: DEMO_USER.name }, { id: 'demo-alie', name: 'Alie Sharma' }],
        presenceSequence: 1,
      };
    }
    if (event === 'room:leave') { this.activeRoom = null; return { roomId: payload.roomId }; }
    if (event === 'note:update') {
      if (payload.roomId !== this.activeRoom) throw new Error('Join this room before editing.');
      const result = demoSave(payload.roomId, payload.operationId, payload.content);
      const update = { roomId: payload.roomId, operationId: payload.operationId, kind: 'edit', note: result.note };
      queueMicrotask(() => this.dispatch('note:updated', update));
      return result;
    }
    if (event === 'note:sync') {
      if (payload.roomId !== this.activeRoom) throw new Error('Join this room before syncing.');
      return { note: demoNote(payload.roomId), presence: [{ id: DEMO_USER.id, name: DEMO_USER.name }, { id: 'demo-alie', name: 'Alie Sharma' }], presenceSequence: 1 };
    }
    if (event === 'note:status') {
      const version = demoVersions(payload.roomId).find((item) => item.operationId === payload.operationId);
      return { committed: Boolean(version), appliedRevision: version?.revision ?? null, note: demoNote(payload.roomId) };
    }
    throw new Error(`The local demo does not support ${event}.`);
  }
}

export function socketAck(socket, event, payload, timeout = 6000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeout).emit(event, payload, (error, response) => {
      if (error) return reject(new Error('The server did not confirm this action.'));
      if (!response?.ok) return reject(new Error(response?.error?.message || 'This action could not be completed.'));
      resolve(response.data);
    });
  });
}
