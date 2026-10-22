import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { createRoomService } from '../src/rooms.js';
import { error } from '../src/errors.js';
import { RoomQueue } from '../src/queue.js';

const selectedRoomId = new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const otherRoomId = new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const ownerId = new ObjectId('111111111111111111111111');
const memberId = new ObjectId('222222222222222222222222');

const matches = (document, query) => Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some((condition) => matches(document, condition));
  const actual = document[key];
  if (actual instanceof ObjectId && value instanceof ObjectId) return actual.equals(value);
  if (value && typeof value === 'object' && Array.isArray(value.$in)) return value.$in.some((candidate) => actual instanceof ObjectId && candidate instanceof ObjectId ? actual.equals(candidate) : actual === candidate);
  return actual === value;
});

function makeHarness({ authenticatedUserId = ownerId, authenticationError, onDeleted = () => {} } = {}) {
  const selectedRoom = { _id: selectedRoomId, ownerId, name: 'Selected room', kind: 'room', createdAt: new Date(), inviteCode: 'selected-code' };
  const otherRoom = { _id: otherRoomId, ownerId, name: 'Other room', kind: 'room', createdAt: new Date(), inviteCode: 'other-code' };
  const row = (roomId, id) => ({ _id: new ObjectId(), roomId, id });
  const selectedFileId = new ObjectId();
  const otherFileId = new ObjectId();
  const collections = new Map([
    ['rooms', [selectedRoom, otherRoom]],
    ['memberships', [row(selectedRoomId, 'owner'), row(selectedRoomId, 'member'), row(otherRoomId, 'other-owner')].map((item, index) => ({ ...item, userId: index === 1 ? memberId : ownerId }))],
    ['notes', [row(selectedRoomId, 'selected-note'), row(otherRoomId, 'other-note')]],
    ['versions', [row(selectedRoomId, 'selected-note-version'), row(otherRoomId, 'other-note-version')]],
    ['files', [{ _id: selectedFileId, roomId: selectedRoomId, id: 'selected-file' }, { _id: otherFileId, roomId: otherRoomId, id: 'other-file' }]],
    ['fileOperations', [row(selectedRoomId, 'selected-operation'), row(otherRoomId, 'other-operation')]],
    ['fileVersions', [row(selectedRoomId, 'selected-file-version'), row(otherRoomId, 'other-file-version')]],
    ['fileAssignments', [
      { _id: new ObjectId(), fileId: selectedFileId, roomId: selectedRoomId, areaId: 'selected-assignment' },
      { _id: new ObjectId(), fileId: selectedFileId, areaId: 'legacy-selected-assignment' },
      { _id: new ObjectId(), fileId: otherFileId, areaId: 'legacy-other-assignment' },
    ]],
  ]);
  const db = {
    collection(name) {
      const documents = collections.get(name);
      return {
        findOne: async (query) => documents.find((document) => matches(document, query)) || null,
        find: (query) => ({ toArray: async () => documents.filter((document) => matches(document, query)) }),
        deleteMany: async (query) => {
          const remaining = documents.filter((document) => !matches(document, query));
          const deletedCount = documents.length - remaining.length;
          collections.set(name, remaining);
          return { deletedCount };
        },
        deleteOne: async (query) => {
          const index = documents.findIndex((document) => matches(document, query));
          if (index < 0) return { deletedCount: 0 };
          documents.splice(index, 1);
          return { deletedCount: 1 };
        },
      };
    },
  };
  const client = {
    startSession: () => {
      let active = false;
      return {
        startTransaction: () => { active = true; },
        commitTransaction: async () => { active = false; },
        abortTransaction: async () => { active = false; },
        endSession: async () => {},
        inTransaction: () => active,
      };
    },
  };
  const auth = {
    authenticate: async () => {
      if (authenticationError) throw authenticationError;
      return { user: { _id: authenticatedUserId } };
    },
  };
  const service = createRoomService(db, client, auth, new RoomQueue(), onDeleted);
  return { service, collections, otherFileId };
}

test('room deletion rejects unauthenticated callers before touching room data', async () => {
  const { service, collections } = makeHarness({ authenticationError: error(401, 'UNAUTHENTICATED', 'Sign in again') });
  await assert.rejects(service.deleteRoom('invalid', selectedRoomId.toString()), { status: 401, code: 'UNAUTHENTICATED' });
  assert.equal(collections.get('rooms').length, 2);
});

test('room deletion rejects a member who is not the owner', async () => {
  const { service, collections } = makeHarness({ authenticatedUserId: memberId });
  await assert.rejects(service.deleteRoom('member-token', selectedRoomId.toString()), { status: 403, code: 'FORBIDDEN' });
  assert.equal(collections.get('rooms').length, 2);
  assert.equal(collections.get('files').length, 2);
});

test('room deletion validates IDs before deleting data', async () => {
  const { service, collections } = makeHarness();
  await assert.rejects(service.deleteRoom('owner-token', 'not-an-id'), { code: 'INVALID_ID' });
  assert.equal(collections.get('rooms').length, 2);
});

test('owner deletion atomically removes only the selected room and its associated data', async () => {
  const deletedEvents = [];
  const { service, collections, otherFileId } = makeHarness({ onDeleted: async (roomId) => deletedEvents.push(roomId) });
  const result = await service.deleteRoom('owner-token', selectedRoomId.toString());
  assert.deepEqual(result, { deleted: true, roomId: selectedRoomId.toString() });
  for (const name of ['rooms', 'memberships', 'notes', 'versions', 'files', 'fileOperations', 'fileVersions', 'fileAssignments']) {
    assert.equal(collections.get(name).length, 1, `${name} should retain the other room's record`);
  }
  assert.equal(collections.get('fileAssignments')[0].fileId.equals(otherFileId), true);
  for (const name of ['memberships', 'notes', 'versions', 'files', 'fileOperations', 'fileVersions']) {
    assert.ok(collections.get(name).every((document) => document.roomId?.equals(otherRoomId) || document._id?.equals(otherRoomId)));
  }
  assert.deepEqual(deletedEvents, [selectedRoomId.toString()]);
});