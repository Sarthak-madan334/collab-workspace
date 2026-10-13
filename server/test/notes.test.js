import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createNoteService } from '../src/notes.js';

test('history reads only metadata even when versions contain large note bodies', async () => {
  const roomId = new ObjectId();
  const authorId = new ObjectId();
  let projection;
  const versionCollection = {
    find(_filter, options) {
      projection = options.projection;
      return {
        sort() { return this; },
        limit() { return this; },
        async toArray() { return [{ revision: 1, authorId, kind: 'edit', createdAt: new Date(), restoredFromRevision: null }]; },
      };
    },
  };
  const userCollection = { find: () => ({ toArray: async () => [{ _id: authorId, name: 'Alice' }] }) };
  const db = { collection: (name) => ({ versions: versionCollection, users: userCollection }[name]) };
  const notes = createNoteService(db, null, null, { access: async () => ({ _id: roomId }) }, null);
  const result = await notes.history(authorId, roomId.toString());
  assert.deepEqual(projection, { revision: 1, authorId: 1, kind: 1, createdAt: 1, restoredFromRevision: 1 });
  assert.equal(result.items[0].authorName, 'Alice');
});
