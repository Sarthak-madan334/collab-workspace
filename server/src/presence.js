export class Presence {
  constructor() {
    this.rooms = new Map();
    this.sockets = new Map();
    this.sequence = 0;
  }
  snapshot(roomId) {
    const users = [...(this.rooms.get(roomId)?.values() || [])]
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return { roomId, users, presenceSequence: this.sequence };
  }
  add(roomId, socketId, user) {
    let room = this.rooms.get(roomId);
    if (!room) { room = new Map(); this.rooms.set(roomId, room); }
    let entry = room.get(user.id);
    const changed = !entry;
    if (!entry) { entry = { ...user, sockets: new Set() }; room.set(user.id, entry); }
    entry.sockets.add(socketId);
    let rooms = this.sockets.get(socketId);
    if (!rooms) { rooms = new Set(); this.sockets.set(socketId, rooms); }
    rooms.add(roomId);
    if (changed) this.sequence += 1;
    return changed;
  }
  remove(roomId, socketId, userId) {
    const room = this.rooms.get(roomId);
    const entry = room?.get(userId);
    const rooms = this.sockets.get(socketId);
    rooms?.delete(roomId);
    if (rooms && rooms.size === 0) this.sockets.delete(socketId);
    if (!entry) return false;
    entry.sockets.delete(socketId);
    if (entry.sockets.size) return false;
    room.delete(userId);
    if (!room.size) this.rooms.delete(roomId);
    this.sequence += 1;
    return true;
  }
  roomsFor(socketId) { return [...(this.sockets.get(socketId) || [])]; }
  has(roomId, socketId) { return this.sockets.get(socketId)?.has(roomId) || false; }
}
