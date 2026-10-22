import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWhatsAppShareUrl } from '../src/invite-links.js';

test('builds a WhatsApp URL with an encoded invite join link', () => {
  const origin = 'https://synkro.example';
  const inviteCode = 'SYNKRO/A B?&';
  const joinUrl = `${origin}/join/${encodeURIComponent(inviteCode)}`;
  const message = `Join my Synkro workspace: ${joinUrl}`;

  assert.equal(buildWhatsAppShareUrl(origin, inviteCode), `https://wa.me/?text=${encodeURIComponent(message)}`);
});