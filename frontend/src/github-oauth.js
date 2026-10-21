const STORAGE_KEY = 'synkro.github.oauth.v1';
const CALLBACK_PATH = '/auth/github/callback';
const MAX_AGE_MS = 10 * 60 * 1000;

const base64url = (bytes) => btoa(String.fromCharCode(...bytes))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function createGitHubAuthorizationUrl(clientId, origin, storage, cryptoApi = globalThis.crypto) {
  if (!clientId || !cryptoApi?.getRandomValues || !cryptoApi?.subtle) throw Error('GitHub sign-in is unavailable.');
  const state = base64url(cryptoApi.getRandomValues(new Uint8Array(32)));
  const verifier = base64url(cryptoApi.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  storage.setItem(STORAGE_KEY, JSON.stringify({ state, verifier, createdAt: Date.now() }));
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${origin}${CALLBACK_PATH}`);
  url.searchParams.set('scope', 'user:email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.href;
}

export function consumeGitHubCallback(search, storage, now = Date.now()) {
  const saved = storage.getItem(STORAGE_KEY);
  storage.removeItem(STORAGE_KEY);
  const params = new URLSearchParams(search);
  if (params.get('error') === 'access_denied') throw Error('GitHub sign-in was cancelled.');
  if (params.has('error')) throw Error('GitHub sign-in did not complete. Please try again.');
  if (!saved) throw Error('GitHub sign-in expired. Please try again.');
  let pending;
  try { pending = JSON.parse(saved); } catch { throw Error('GitHub sign-in expired. Please try again.'); }
  if (!pending || !Number.isFinite(pending.createdAt) || now - pending.createdAt > MAX_AGE_MS || now < pending.createdAt ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(pending.verifier) || !/^[A-Za-z0-9_-]{43}$/.test(pending.state) ||
    params.get('state') !== pending.state || !/^[A-Za-z0-9_-]{6,255}$/.test(params.get('code') || '')) {
    throw Error('GitHub sign-in could not be verified. Please try again.');
  }
  return { code: params.get('code'), codeVerifier: pending.verifier };
}
