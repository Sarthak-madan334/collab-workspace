import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFileInviteUrl, buildWhatsAppShareUrl, getInviteDestination } from '../src/invite-links.js';

test('builds a WhatsApp URL with an encoded invite join link', () => {
  const origin = 'https://synkro.example';
  const inviteCode = 'SYNKRO/A B?&';
  const joinUrl = `${origin}/join/${encodeURIComponent(inviteCode)}`;
  const message = `Join my Synkro workspace: ${joinUrl}`;

  assert.equal(buildWhatsAppShareUrl(origin, inviteCode), `https://wa.me/?text=${encodeURIComponent(message)}`);
});

test('builds a file invite link that preserves the room and file destination', () => {
  const link = new URL(buildFileInviteUrl('https://synkro.example', 'SYNKRO/AB 12', 'room-a04-demo', 'file/one'));
  assert.equal(link.pathname, '/join/SYNKRO%2FAB%2012');
  assert.equal(link.searchParams.get('roomId'), 'room-a04-demo');
  assert.equal(link.searchParams.get('fileId'), 'file/one');
});

test('opens the invited file only after joining its matching room', () => {
  assert.equal(getInviteDestination('room-a04-demo', 'room-a04-demo', 'file-123'), '/studio/room-a04-demo/file-123');
  assert.equal(getInviteDestination('room-a04-demo', 'another-room', 'file-123'), '/rooms/room-a04-demo');
  assert.equal(getInviteDestination('room-a04-demo', 'room-a04-demo', ''), '/rooms/room-a04-demo');
});
