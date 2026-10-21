import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../src/auth.js';
import { verifyGitHubCode } from '../src/github-auth.js';

const config = {
  githubClientId: 'Ov23liExample', githubClientSecret: 'secret-that-stays-on-the-server',
  origins: new Set(['https://synkro.example']), sessionTtlMs: 3_600_000,
};
const payload = { code: 'abcdef123456', codeVerifier: 'a'.repeat(43), redirectUri: 'https://synkro.example/auth/github/callback' };

function fixture(existingUsers = []) {
  const users = [...existingUsers];
  const sessions = [];
  const db = { collection: (name) => name === 'users' ? {
    findOne: async (query) => users.find((user) => Object.entries(query).every(([key, value]) => user[key] === value)) || null,
    insertOne: async (user) => {
      if (users.some((stored) => stored.emailNormalized === user.emailNormalized || stored.githubId && stored.githubId === user.githubId)) {
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

test('GitHub exchange requests only identity and verified email, keeping its token off the database', async () => {
  const requests = [];
  const fakeFetch = async (url, options) => {
    requests.push({ url, options });
    if (url.includes('access_token')) return { ok: true, json: async () => ({ access_token: 'github-access-token' }) };
    if (url.endsWith('/user')) return { ok: true, json: async () => ({ id: 12345, login: 'alex', name: 'Alex' }) };
    return { ok: true, json: async () => [
      { email: 'unverified@example.com', primary: true, verified: false },
      { email: 'Alex@Example.com', primary: false, verified: true },
    ] };
  };
  const identity = await verifyGitHubCode(payload, config, fakeFetch);
  assert.deepEqual(identity, { id: '12345', email: 'Alex@Example.com', name: 'Alex' });
  assert.equal(requests[0].options.body.get('client_secret'), config.githubClientSecret);
  assert.equal(requests[0].options.body.get('code_verifier'), payload.codeVerifier);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer github-access-token');
  assert.equal(requests[2].options.headers.Authorization, 'Bearer github-access-token');

  const { users, sessions, db, client } = fixture();
  const auth = createAuthService(db, client, config, () => {}, undefined, async () => identity);
  const first = await auth.loginGitHub(payload, 'https://synkro.example');
  const second = await auth.loginGitHub(payload, 'https://synkro.example');
  assert.equal(users.length, 1);
  assert.equal(users[0].githubId, '12345');
  assert.equal(users[0].emailNormalized, 'alex@example.com');
  assert.equal(users[0].githubAccessToken, undefined);
  assert.equal(sessions.length, 2);
  assert.notEqual(first.token, second.token);
});

test('GitHub sign-in rejects email collision, wrong origin, and missing setup', async () => {
  const { users, sessions, db, client } = fixture([{ emailNormalized: 'alex@example.com', name: 'Alex' }]);
  const auth = createAuthService(db, client, config, () => {}, undefined,
    async () => ({ id: '12345', email: 'alex@example.com', name: 'Alex' }));
  await assert.rejects(auth.loginGitHub(payload, 'https://synkro.example'), { status: 409, code: 'ACCOUNT_LINK_REQUIRED' });
  await assert.rejects(auth.loginGitHub(payload, 'https://evil.example'), { status: 401, code: 'INVALID_GITHUB_CREDENTIAL' });
  assert.equal(users.length, 1);
  assert.equal(sessions.length, 0);
  const disabled = createAuthService(db, client, { ...config, githubClientId: null, githubClientSecret: null });
  await assert.rejects(disabled.loginGitHub(payload, 'https://synkro.example'), { status: 503, code: 'GITHUB_AUTH_UNAVAILABLE' });
});

test('GitHub identity is rejected if no verified email is available', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('access_token')) return { ok: true, json: async () => ({ access_token: 'github-access-token' }) };
    if (url.endsWith('/user')) return { ok: true, json: async () => ({ id: 12345, login: 'alex' }) };
    return { ok: true, json: async () => [{ email: 'alex@example.com', primary: true, verified: false }] };
  };
  await assert.rejects(verifyGitHubCode(payload, config, fakeFetch), { status: 401, code: 'INVALID_GITHUB_CREDENTIAL' });
});
