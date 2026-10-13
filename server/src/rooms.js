import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { assert, isDuplicateKey } from './errors.js';
import { encodeRoomCursor, inviteCode as validateInvite, limit, object, objectId, roomCursor, string } from './validation.js';
import { transaction } from './db.js';

export const roomShape = (room) => ({ id: room._id.toString(), name: room.name, ownerId: room.ownerId.toString(), createdAt: room.createdAt.toISOString() });
export const noteShape = (note) => ({
  roomId: note.roomId.toString(), content: note.content, revision: note.revision,
  updatedBy: note.updatedBy.toString(), updatedAt: note.updatedAt.toISOString(),
});

export function createRoomService(db, client, auth, queue) {
  const rooms = db.collection('rooms');
  const memberships = db.collection('memberships');
  const notes = db.collection('notes');
  const versions = db.collection('versions');

  async function access(userId, roomId, ownerOnly = false, session) {
    const id = typeof roomId === 'string' ? objectId(roomId) : roomId;
    const userObjectId = typeof userId === 'string' ? objectId(userId) : userId;
    const options = session ? { session } : {};
    const membership = await memberships.findOne({ roomId: id, userId: userObjectId }, options);
    assert(membership, 404, 'NOT_FOUND', 'Room not found');
    const room = await rooms.findOne({ _id: id }, options);
    assert(room, 404, 'NOT_FOUND', 'Room not found');
    if (ownerOnly) assert(room.ownerId.equals(userObjectId), 403, 'FORBIDDEN', 'Only the room owner can do that');
    return room;
  }

  async function create(token, payload) {
    object(payload, ['name']);
    const name = string(payload.name, 'Room name', 1, 80);
    const actor = await auth.authenticate(token);
    const roomId = new ObjectId();
    const now = new Date();
    const code = randomBytes(16).toString('base64url');
    const room = { _id: roomId, name, ownerId: actor.user._id, inviteCode: code, createdAt: now, updatedAt: now };
    await transaction(client, async (session) => {
      await rooms.insertOne(room, { session });
      await memberships.insertOne({ roomId, userId: actor.user._id, joinedAt: now }, { session });
      await notes.insertOne({ roomId, content: '', revision: 0, updatedBy: actor.user._id, updatedAt: now }, { session });
      await versions.insertOne({
        roomId, revision: 0, content: '', authorId: actor.user._id, operationId: randomUUID(),
        requestHash: createHash('sha256').update('initial').digest('hex'), baseRevision: 0,
        kind: 'initial', restoredFromRevision: null, createdAt: now,
      }, { session });
    });
    return { room: roomShape(room), inviteCode: code };
  }

  async function join(token, payload) {
    object(payload, ['inviteCode']);
    const code = validateInvite(payload.inviteCode);
    const candidate = await rooms.findOne({ inviteCode: code });
    assert(candidate, 404, 'INVALID_INVITE', 'Invite not found');
    return queue.run(candidate._id.toString(), async () => {
      const actor = await auth.authenticate(token);
      const room = await rooms.findOne({ _id: candidate._id });
      assert(room && room.inviteCode === code, 404, 'INVALID_INVITE', 'Invite not found');
      try {
        await memberships.updateOne(
          { roomId: room._id, userId: actor.user._id },
          { $setOnInsert: { roomId: room._id, userId: actor.user._id, joinedAt: new Date() } },
          { upsert: true },
        );
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        const existing = await memberships.findOne({ roomId: room._id, userId: actor.user._id });
        if (!existing) throw err;
      }
      return { room: roomShape(room) };
    });
  }

  async function list(userId, query) {
    const max = limit(query.limit);
    const cursor = roomCursor(query.cursor);
    const filter = { userId: typeof userId === 'string' ? objectId(userId) : userId };
    if (cursor) filter.$or = [
      { joinedAt: { $lt: cursor.joinedAt } },
      { joinedAt: cursor.joinedAt, _id: { $lt: cursor.id } },
    ];
    const rows = await memberships.find(filter).sort({ joinedAt: -1, _id: -1 }).limit(max + 1).toArray();
    const page = rows.slice(0, max);
    const roomRows = await rooms.find({ _id: { $in: page.map((row) => row.roomId) } }).toArray();
    const byId = new Map(roomRows.map((room) => [room._id.toString(), room]));
    return { items: page.map((row) => byId.get(row.roomId.toString())).filter(Boolean).map(roomShape), nextCursor: rows.length > max ? encodeRoomCursor(page.at(-1)) : null };
  }

  async function get(userId, roomId) { return { room: roomShape(await access(userId, roomId)) }; }
  async function note(userId, roomId) {
    const room = await access(userId, roomId);
    const value = await notes.findOne({ roomId: room._id });
    assert(value, 503, 'SERVICE_UNAVAILABLE', 'Room note unavailable');
    return { note: noteShape(value) };
  }
  async function invite(userId, roomId) { return { inviteCode: (await access(userId, roomId, true)).inviteCode }; }
  async function rotate(token, roomId) {
    const id = objectId(roomId);
    return queue.run(id.toString(), async () => {
      const actor = await auth.authenticate(token);
      await access(actor.user._id, id, true);
      const code = randomBytes(16).toString('base64url');
      await rooms.updateOne({ _id: id }, { $set: { inviteCode: code, updatedAt: new Date() } });
      return { inviteCode: code };
    });
  }
  return { access, create, join, list, get, note, invite, rotate };
}
