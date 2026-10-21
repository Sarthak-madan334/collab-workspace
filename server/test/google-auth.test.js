import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../src/auth.js';

const credential = `${'a'.repeat(40)}.${'b'.repeat(40)}.${'c'.repeat(40)}`;

function fixture(existingUsers = []) {
  const users = [...existingUsers];
  const sessions = [];
  const db = { collection: (name) => name === 'users' ? {
    findOne: async (query) => users.find((user) => Object.entries(query).every(([key, value]) => user[key] === value)) || null,
    insertOne: async (user) => {
      if (users.some((stored) => stored.emailNormalized === user.emailNormalized || stored.googleSub && stored.googleSub === user.googleSub)) {
        throw Object.assign(Error('Duplicate'), { code: 11000 });
      }
      users.push(user);
    },
  } : {
    insertOne: async (session) => { sessions.push(session); return { insertedId: session.userId }; },
  } };
  const client = { startSession: () => ({
    startTransaction() {}, inTransaction: () => false,
    commitTransaction: async () => {}, endSession: async () => {},
  }) };
  return { users, sessions, db, client };
}

test('verified Google identity creates one user and issues distinct Synkro sessions', async () => {
  const { users, sessions, db, client } = fixture();
  const verify = async (_credential, audience) => {
    assert.equal(audience, 'google-client.apps.googleusercontent.com');
    return { sub: 'google-user-123', email: 'Alex@Example.com', email_verified: true, name: 'Alex' };
  };
  const auth = createAuthService(db, client, { googleClientId: 'google-client.apps.googleusercontent.com', sessionTtlMs: 3_600_000 }, () => {}, verify);
  const first = await auth.loginGoogle({ credential });
  const second = await auth.loginGoogle({ credential });
  assert.equal(users.length, 1);
  assert.equal(users[0].googleSub, 'google-user-123');
  assert.equal(users[0].emailNormalized, 'alex@example.com');
  assert.equal(users[0].passwordHash, undefined);
  assert.equal(sessions.length, 2);
  assert.notEqual(first.token, second.token);
  assert.equal(sessions[0].tokenHash.includes(first.token), false);
  assert.equal(first.user.id, second.user.id);
});

test('Google sign-in never silently links an existing password account by email', async () => {
  const { users, sessions, db, client } = fixture([{ emailNormalized: 'alex@example.com', name: 'Alex', passwordHash: 'hash' }]);
  const auth = createAuthService(db, client, { googleClientId: 'google-client.apps.googleusercontent.com', sessionTtlMs: 3_600_000 }, () => {},
    async () => ({ sub: 'google-user-123', email: 'alex@example.com', email_verified: true }));
  await assert.rejects(auth.loginGoogle({ credential }), { status: 409, code: 'ACCOUNT_LINK_REQUIRED' });
  assert.equal(users.length, 1);
  assert.equal(sessions.length, 0);
});

test('Google sign-in fails closed for missing setup, malformed tokens, and unverified email', async () => {
  const { db, client } = fixture();
  const disabled = createAuthService(db, client, { sessionTtlMs: 3_600_000 });
  await assert.rejects(disabled.loginGoogle({ credential }), { status: 503, code: 'GOOGLE_AUTH_UNAVAILABLE' });
  let called = false;
  const auth = createAuthService(db, client, { googleClientId: 'google-client.apps.googleusercontent.com', sessionTtlMs: 3_600_000 }, () => {},
    async () => { called = true; return { sub: 'google-user-123', email: 'alex@example.com', email_verified: false }; });
  await assert.rejects(auth.loginGoogle({ credential: 'not-a-google-token' }), { status: 401, code: 'INVALID_GOOGLE_CREDENTIAL' });
  assert.equal(called, false);
  await assert.rejects(auth.loginGoogle({ credential }), { status: 401, code: 'INVALID_GOOGLE_CREDENTIAL' });
});
