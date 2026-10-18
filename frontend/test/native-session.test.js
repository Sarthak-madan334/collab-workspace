import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSavedSession } from '../src/native-session.js';

const token = 'a'.repeat(43);
const session = { token, user: { id: 'user-id', name: 'Tester' }, expiresAt: '2026-10-18T12:00:00.000Z' };

test('restores a valid Android session before expiry', () => {
  assert.deepEqual(parseSavedSession(JSON.stringify(session), Date.parse('2026-10-18T11:00:00.000Z')), session);
});

test('rejects expired, malformed, or incomplete saved sessions', () => {
  assert.equal(parseSavedSession(JSON.stringify(session), Date.parse(session.expiresAt)), null);
  assert.equal(parseSavedSession('{', 0), null);
  assert.equal(parseSavedSession(JSON.stringify({ ...session, token: 'bad' }), 0), null);
  assert.equal(parseSavedSession(JSON.stringify({ ...session, user: {} }), 0), null);
});
