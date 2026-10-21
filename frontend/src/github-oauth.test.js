import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { consumeGitHubCallback, createGitHubAuthorizationUrl } from './github-oauth.js';

const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

test('GitHub authorization uses state and S256 PKCE, then consumes callback only once', async () => {
  const pending = storage();
  const url = new URL(await createGitHubAuthorizationUrl('Ov23liExample', 'https://synkro.example', pending, webcrypto));
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://synkro.example/auth/github/callback');
  assert.equal(url.searchParams.get('scope'), 'user:email');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const callback = `?code=abcdef123456&state=${url.searchParams.get('state')}`;
  const result = consumeGitHubCallback(callback, pending);
  const challenge = createHash('sha256').update(result.codeVerifier).digest('base64url');
  assert.equal(url.searchParams.get('code_challenge'), challenge);
  assert.equal(result.code, 'abcdef123456');
  assert.throws(() => consumeGitHubCallback(callback, pending), /expired/);
});

test('GitHub callback rejects an incorrect state and an expired attempt', async () => {
  const pending = storage();
  await createGitHubAuthorizationUrl('Ov23liExample', 'https://synkro.example', pending, webcrypto);
  assert.throws(() => consumeGitHubCallback('?code=abcdef123456&state=wrong', pending), /could not be verified/);
  const url = new URL(await createGitHubAuthorizationUrl('Ov23liExample', 'https://synkro.example', pending, webcrypto));
  assert.throws(() => consumeGitHubCallback(`?code=abcdef123456&state=${url.searchParams.get('state')}`, pending, Date.now() + 11 * 60 * 1000), /could not be verified/);
});
