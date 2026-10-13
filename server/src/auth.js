import { promisify } from 'node:util';
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { assert, error, isDuplicateKey } from './errors.js';
import { email, object, password, string } from './validation.js';
import { transaction } from './db.js';

const scrypt = promisify(scryptCallback);
const passwordParams = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 32 * 1024 * 1024 };
const dummySalt = '00000000000000000000000000000000';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function publicUser(user, includeEmail = false) {
  return { id: user._id.toString(), name: user.name, ...(includeEmail ? { email: user.emailNormalized } : {}) };
}

async function derive(secret, salt, params) {
  return scrypt(secret, Buffer.from(salt, 'hex'), params.keylen, { N: params.N, r: params.r, p: params.p, maxmem: params.maxmem });
}

export function createAuthService(db, client, config, onRevoke = () => {}) {
  const users = db.collection('users');
  const sessions = db.collection('sessions');

  async function issue(user) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.sessionTtlMs);
    const session = { userId: user._id, tokenHash: sha256(token), createdAt: new Date(), expiresAt, revokedAt: null };
    const inserted = await sessions.insertOne(session);
    return { user: publicUser(user, true), token, expiresAt: expiresAt.toISOString(), sessionId: inserted.insertedId };
  }

  async function register(payload) {
    object(payload, ['name', 'email', 'password']);
    const name = string(payload.name, 'Name', 1, 50);
    const emailNormalized = email(payload.email);
    const secret = password(payload.password);
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await derive(secret, salt, passwordParams)).toString('hex');
    const now = new Date();
    const userId = new ObjectId();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + config.sessionTtlMs);
    try {
      await transaction(client, async (session) => {
        await users.insertOne({ _id: userId, name, emailNormalized, passwordHash, passwordSalt: salt, passwordParams, createdAt: now, updatedAt: now }, { session });
        await sessions.insertOne({ userId, tokenHash: sha256(token), createdAt: now, expiresAt, revokedAt: null }, { session });
      });
    } catch (err) {
      if (isDuplicateKey(err)) throw error(422, 'REGISTRATION_FAILED', 'Registration could not be completed');
      throw err;
    }
    return { user: publicUser({ _id: userId, name, emailNormalized }, true), token, expiresAt: expiresAt.toISOString() };
  }

  async function login(payload) {
    object(payload, ['email', 'password']);
    const invalid = () => error(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    let emailNormalized;
    try { emailNormalized = email(payload.email); } catch { throw invalid(); }
    const secret = payload.password;
    if (typeof secret !== 'string' || secret.length > 128) throw invalid();
    const user = await users.findOne({ emailNormalized });
    const salt = user?.passwordSalt || dummySalt;
    const params = user?.passwordParams || passwordParams;
    const actual = await derive(secret, salt, params);
    const expected = Buffer.from(user?.passwordHash || '00'.repeat(passwordParams.keylen), 'hex');
    if (!user || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw invalid();
    }
    const result = await issue(user);
    delete result.sessionId;
    return result;
  }

  async function authenticate(token) {
    assert(typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token), 401, 'UNAUTHENTICATED', 'Sign in again');
    const session = await sessions.findOne({ tokenHash: sha256(token) });
    assert(session && !session.revokedAt && session.expiresAt > new Date(), 401, 'UNAUTHENTICATED', 'Sign in again');
    const user = await users.findOne({ _id: session.userId });
    assert(user, 401, 'UNAUTHENTICATED', 'Sign in again');
    return { session, user };
  }

  async function me(token) {
    const actor = await authenticate(token);
    return { user: publicUser(actor.user, true), expiresAt: actor.session.expiresAt.toISOString() };
  }

  async function logout(token) {
    const actor = await authenticate(token);
    await sessions.updateOne({ _id: actor.session._id }, { $set: { revokedAt: new Date() } });
    onRevoke(actor.session._id.toString());
    return { loggedOut: true };
  }

  return { register, login, authenticate, me, logout };
}
