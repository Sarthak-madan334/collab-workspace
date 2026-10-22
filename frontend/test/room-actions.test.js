import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasExactRoomConfirmation,
  initialRoomActionsState,
  isRoomOwner,
  removeRoomById,
  roomMenuFocusIndex,
  roomActionsReducer,
  shouldCloseRoomMenuOnEscape,
  shouldCloseRoomMenuOnPointerDown,
} from '../src/room-actions.js';

test('only one room actions menu is open and close actions dismiss it', () => {
  const first = roomActionsReducer(initialRoomActionsState, { type: 'toggle-menu', roomId: 'room-a' });
  assert.equal(first.openRoomId, 'room-a');
  const second = roomActionsReducer(first, { type: 'toggle-menu', roomId: 'room-b' });
  assert.equal(second.openRoomId, 'room-b');
  assert.equal(roomActionsReducer(second, { type: 'close-menu' }).openRoomId, null);
  assert.equal(roomActionsReducer(first, { type: 'toggle-menu', roomId: 'room-a' }).openRoomId, null);
});

test('owner predicate limits Delete room visibility to the room owner', () => {
  const room = { id: 'room-a', ownerId: 'owner-a' };
  assert.equal(isRoomOwner(room, 'owner-a'), true);
  assert.equal(isRoomOwner(room, 'member-b'), false);
  assert.equal(isRoomOwner(room, null), false);
});

test('delete confirmation requires an exact room-name match', () => {
  assert.equal(hasExactRoomConfirmation('Planning room', 'Planning room'), true);
  assert.equal(hasExactRoomConfirmation('Planning room', 'planning room'), false);
  assert.equal(hasExactRoomConfirmation('Planning room', ' Planning room'), false);
});

test('cancel closes confirmation without invoking deletion, while failures preserve input for retry', () => {
  let state = roomActionsReducer(initialRoomActionsState, { type: 'begin-delete', room: { id: 'room-a', name: 'Planning room' } });
  state = roomActionsReducer(state, { type: 'confirmation', value: 'Planning room' });
  const failed = roomActionsReducer(roomActionsReducer(state, { type: 'delete-start' }), { type: 'delete-failure', message: 'Could not delete room.' });
  assert.equal(failed.confirmation, 'Planning room');
  assert.equal(failed.deleteError, 'Could not delete room.');
  assert.equal(roomActionsReducer(failed, { type: 'cancel-delete' }).deletingRoom, null);
  assert.equal(roomActionsReducer(failed, { type: 'delete-start' }).deleteBusy, true);
});

test('successful deletion closes the dialog and removes only the selected dashboard room', () => {
  const rooms = [{ id: 'room-a' }, { id: 'room-b' }];
  assert.deepEqual(removeRoomById(rooms, 'room-a'), [{ id: 'room-b' }]);
  const state = roomActionsReducer({ ...initialRoomActionsState, deletingRoom: rooms[0], confirmation: 'room-a' }, { type: 'delete-success', message: 'Room deleted.' });
  assert.equal(state.deletingRoom, null);
  assert.equal(state.confirmation, '');
  assert.equal(state.toast, 'Room deleted.');
});

test('Escape and pointer events outside a menu close it without dismissing inside clicks', () => {
  assert.equal(shouldCloseRoomMenuOnEscape('Escape'), true);
  assert.equal(shouldCloseRoomMenuOnEscape('Enter'), false);
  const inside = {};
  const outside = {};
  const container = { contains: (target) => target === inside };
  assert.equal(shouldCloseRoomMenuOnPointerDown(inside, container), false);
  assert.equal(shouldCloseRoomMenuOnPointerDown(outside, container), true);
});

test('room card trigger and destructive dialog are implemented as accessible controls', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /className="room-card-more icon-button" type="button" aria-label=\{`Room actions for \$\{room\.name\}`\}/);
  assert.match(source, /role="menu" aria-label=\{`Room actions for \$\{room\.name\}`\}/);
  assert.match(source, /role="menuitem" to=\{`\/rooms\/\$\{room\.id\}`\}/);
  assert.match(source, /title="Delete room\?"/);
  assert.match(source, /hasExactRoomConfirmation\(roomActions\.deletingRoom\.name, roomActions\.confirmation\)/);
  assert.match(source, /await roomApi\.delete\(session\.token, target\.id\)/);
  assert.match(source, /onClick=\{closeDeleteDialog\}/);
});

test('room action menu supports arrow, Home, and End keyboard movement', () => {
  assert.equal(roomMenuFocusIndex('ArrowDown', 0, 3), 1);
  assert.equal(roomMenuFocusIndex('ArrowDown', 2, 3), 0);
  assert.equal(roomMenuFocusIndex('ArrowUp', 0, 3), 2);
  assert.equal(roomMenuFocusIndex('Home', 1, 3), 0);
  assert.equal(roomMenuFocusIndex('End', 1, 3), 2);
  assert.equal(roomMenuFocusIndex('Tab', 1, 3), null);
  assert.equal(roomMenuFocusIndex('ArrowDown', 0, 0), null);
});