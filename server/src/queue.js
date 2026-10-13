import { error } from './errors.js';

export class RoomQueue {
  constructor(maxDepth = 64) { this.maxDepth = maxDepth; this.rooms = new Map(); }
  run(roomId, task) {
    let state = this.rooms.get(roomId);
    if (!state) { state = { tail: Promise.resolve(), pending: 0 }; this.rooms.set(roomId, state); }
    if (state.pending >= this.maxDepth) throw error(429, 'RATE_LIMITED', 'The room is busy. Try again shortly');
    state.pending += 1;
    const result = state.tail.then(task, task);
    state.tail = result.catch(() => {});
    return result.finally(() => {
      state.pending -= 1;
      if (state.pending === 0 && this.rooms.get(roomId) === state) this.rooms.delete(roomId);
    });
  }
  async drain() { await Promise.all([...this.rooms.values()].map((state) => state.tail)); }
  get depth() { return [...this.rooms.values()].reduce((sum, state) => sum + state.pending, 0); }
}
