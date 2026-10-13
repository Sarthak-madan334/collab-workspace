import { createHash } from 'node:crypto';
import { assert } from './errors.js';
import { transaction } from './db.js';
import { noteShape } from './rooms.js';
import { beforeRevision, content, limit, object, objectId, operationId, revision } from './validation.js';

const hashRequest = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex');

export function createNoteService(db, client, auth, rooms, queue, publish = () => {}) {
  const notes = db.collection('notes');
  const versions = db.collection('versions');
  const users = db.collection('users');

  async function apply(token, payload) {
    object(payload, ['roomId', 'operationId', 'baseRevision', 'content']);
    const id = objectId(payload.roomId);
    const op = operationId(payload.operationId);
    const base = revision(payload.baseRevision);
    const text = content(payload.content);
    const requestHash = hashRequest({ kind: 'edit', baseRevision: base, content: text });
    return queue.run(id.toString(), async () => {
      const actor = await auth.authenticate(token);
      await rooms.access(actor.user._id, id);
      const result = await transaction(client, async (session) => {
        await rooms.access(actor.user._id, id, false, session);
        const existing = await versions.findOne({ roomId: id, operationId: op }, { session });
        if (existing) {
          assert(existing.authorId.equals(actor.user._id) && existing.requestHash === requestHash, 409, 'OPERATION_ID_REUSED', 'Operation ID was already used');
          return { appliedRevision: existing.revision, current: await notes.findOne({ roomId: id }, { session }), kind: existing.kind, committedNow: false };
        }
        const current = await notes.findOne({ roomId: id }, { session });
        assert(current, 503, 'SERVICE_UNAVAILABLE', 'Room note unavailable');
        assert(base <= current.revision, 400, 'INVALID_REQUEST', 'Base revision is newer than the room note');
        const next = { ...current, content: text, revision: current.revision + 1, updatedBy: actor.user._id, updatedAt: new Date() };
        const updated = await notes.updateOne({ roomId: id, revision: current.revision }, { $set: { content: next.content, revision: next.revision, updatedBy: next.updatedBy, updatedAt: next.updatedAt } }, { session });
        assert(updated.matchedCount === 1, 409, 'REVISION_CONFLICT', 'The shared note changed');
        await versions.insertOne({
          roomId: id, revision: next.revision, content: text, authorId: actor.user._id,
          operationId: op, requestHash, baseRevision: base, kind: 'edit',
          restoredFromRevision: null, createdAt: next.updatedAt,
        }, { session });
        return { appliedRevision: next.revision, current: next, kind: 'edit', committedNow: true };
      });
      const note = noteShape(result.current);
      if (result.committedNow) publish('note:updated', { roomId: id.toString(), operationId: op, kind: result.kind, note });
      return { appliedRevision: result.appliedRevision, note };
    });
  }

  async function status(userId, payload) {
    object(payload, ['roomId', 'operationId']);
    const id = objectId(payload.roomId);
    const op = operationId(payload.operationId);
    await rooms.access(userId, id);
    const [found, note] = await Promise.all([
      versions.findOne({ roomId: id, operationId: op }), notes.findOne({ roomId: id }),
    ]);
    assert(note, 503, 'SERVICE_UNAVAILABLE', 'Room note unavailable');
    const owned = found && found.authorId.equals(typeof userId === 'string' ? objectId(userId) : userId);
    return { committed: Boolean(owned), appliedRevision: owned ? found.revision : null, note: noteShape(note) };
  }

  async function history(userId, roomId, query = {}) {
    const room = await rooms.access(userId, roomId);
    const max = limit(query.limit);
    const before = beforeRevision(query.beforeRevision);
    const filter = { roomId: room._id, ...(before === undefined ? {} : { revision: { $lt: before } }) };
    const rows = await versions.find(filter).sort({ revision: -1 }).limit(max + 1).toArray();
    const page = rows.slice(0, max);
    const authorRows = await users.find({ _id: { $in: page.map((row) => row.authorId) } }, { projection: { name: 1 } }).toArray();
    const authors = new Map(authorRows.map((author) => [author._id.toString(), author.name]));
    return {
      items: page.map((row) => ({
        revision: row.revision, authorId: row.authorId.toString(),
        authorName: authors.get(row.authorId.toString()) || 'Former member', kind: row.kind,
        createdAt: row.createdAt.toISOString(), restoredFromRevision: row.restoredFromRevision ?? null,
      })),
      nextBeforeRevision: rows.length > max ? page.at(-1).revision : null,
    };
  }

  async function version(userId, roomId, selectedRevision) {
    const room = await rooms.access(userId, roomId);
    const rev = revision(selectedRevision);
    const row = await versions.findOne({ roomId: room._id, revision: rev });
    assert(row, 404, 'NOT_FOUND', 'Version not found');
    const author = await users.findOne({ _id: row.authorId }, { projection: { name: 1 } });
    return { version: {
      roomId: room._id.toString(), revision: row.revision, content: row.content,
      authorId: row.authorId.toString(), authorName: author?.name || 'Former member',
      kind: row.kind, createdAt: row.createdAt.toISOString(), restoredFromRevision: row.restoredFromRevision ?? null,
    } };
  }

  async function restore(token, roomId, selectedRevision, payload) {
    object(payload, ['operationId', 'expectedRevision']);
    const id = objectId(roomId);
    const sourceRevision = revision(selectedRevision);
    const op = operationId(payload.operationId);
    const expectedRevision = revision(payload.expectedRevision);
    const requestHash = hashRequest({ kind: 'restore', sourceRevision, expectedRevision });
    return queue.run(id.toString(), async () => {
      const actor = await auth.authenticate(token);
      await rooms.access(actor.user._id, id, true);
      const result = await transaction(client, async (session) => {
        await rooms.access(actor.user._id, id, true, session);
        const existing = await versions.findOne({ roomId: id, operationId: op }, { session });
        if (existing) {
          assert(existing.authorId.equals(actor.user._id) && existing.requestHash === requestHash, 409, 'OPERATION_ID_REUSED', 'Operation ID was already used');
          return { appliedRevision: existing.revision, current: await notes.findOne({ roomId: id }, { session }), committedNow: false };
        }
        const current = await notes.findOne({ roomId: id }, { session });
        assert(current, 503, 'SERVICE_UNAVAILABLE', 'Room note unavailable');
        assert(current.revision === expectedRevision, 409, 'REVISION_CONFLICT', 'The shared note changed. Refresh before restoring');
        const source = await versions.findOne({ roomId: id, revision: sourceRevision }, { session });
        assert(source, 404, 'NOT_FOUND', 'Version not found');
        const now = new Date();
        const next = { ...current, content: source.content, revision: current.revision + 1, updatedBy: actor.user._id, updatedAt: now };
        const updated = await notes.updateOne({ roomId: id, revision: current.revision }, { $set: { content: next.content, revision: next.revision, updatedBy: next.updatedBy, updatedAt: now } }, { session });
        assert(updated.matchedCount === 1, 409, 'REVISION_CONFLICT', 'The shared note changed');
        await versions.insertOne({
          roomId: id, revision: next.revision, content: source.content, authorId: actor.user._id,
          operationId: op, requestHash, baseRevision: expectedRevision, kind: 'restore',
          restoredFromRevision: sourceRevision, createdAt: now,
        }, { session });
        return { appliedRevision: next.revision, current: next, committedNow: true };
      });
      const note = noteShape(result.current);
      if (result.committedNow) publish('note:updated', { roomId: id.toString(), operationId: op, kind: 'restore', note });
      return { appliedRevision: result.appliedRevision, note };
    });
  }

  return { apply, status, history, version, restore };
}
