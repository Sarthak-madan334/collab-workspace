import { ObjectId } from 'mongodb';
import { assert, error } from './errors.js';

export function object(value, keys) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value), 400, 'INVALID_REQUEST', 'A JSON object is required');
  assert(Object.keys(value).every((key) => keys.includes(key)), 400, 'INVALID_REQUEST', 'Unexpected field');
  return value;
}
export function string(value, field, min, max, { trim = true } = {}) {
  assert(typeof value === 'string', 422, 'VALIDATION_FAILED', `${field} must be text`);
  const result = trim ? value.trim() : value;
  assert(result.length >= min && result.length <= max, 422, 'VALIDATION_FAILED', `${field} must be ${min}–${max} characters`);
  return result;
}
export function email(value) {
  const normalized = string(value, 'Email', 3, 254).toLowerCase();
  assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized), 422, 'VALIDATION_FAILED', 'Enter a valid email address');
  return normalized;
}
export function password(value) { return string(value, 'Password', 12, 128, { trim: false }); }
export function objectId(value) {
  assert(typeof value === 'string' && /^[a-f\d]{24}$/i.test(value), 400, 'INVALID_ID', 'Invalid identifier');
  return new ObjectId(value);
}
export function revision(value) {
  assert(Number.isSafeInteger(value) && value >= 0, 400, 'INVALID_REQUEST', 'Invalid revision');
  return value;
}
export function revisionParam(value) {
  assert(typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value), 400, 'INVALID_REQUEST', 'Invalid revision');
  return revision(Number(value));
}
export function operationId(value) {
  assert(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value), 400, 'INVALID_REQUEST', 'Invalid operation ID');
  return value.toLowerCase();
}
export function content(value) {
  assert(typeof value === 'string', 422, 'VALIDATION_FAILED', 'Note content must be text');
  assert(Buffer.byteLength(value, 'utf8') <= 5 * 1024 * 1024, 413, 'PAYLOAD_TOO_LARGE', 'Note content exceeds 5 MiB');
  return value;
}
export function inviteCode(value) {
  assert(typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value), 404, 'INVALID_INVITE', 'Invite not found');
  return value;
}
export function limit(value) {
  if (value === undefined) return 20;
  assert(typeof value === 'string' && /^[1-9]\d*$/.test(value), 400, 'INVALID_REQUEST', 'Invalid limit');
  const parsed = Number(value);
  assert(parsed <= 100, 400, 'INVALID_REQUEST', 'Limit must be at most 100');
  return parsed;
}
export function beforeRevision(value) {
  if (value === undefined) return undefined;
  return revisionParam(value);
}
export function roomCursor(value) {
  if (value === undefined) return undefined;
  try {
    if (typeof value !== 'string' || value.length > 300 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(cursor) || cursor.length !== 2 || Number.isNaN(Date.parse(cursor[0]))) throw Error();
    return { joinedAt: new Date(cursor[0]), id: objectId(cursor[1]) };
  } catch { throw error(400, 'INVALID_REQUEST', 'Invalid cursor'); }
}
export function encodeRoomCursor(member) {
  return Buffer.from(JSON.stringify([member.joinedAt.toISOString(), member._id.toString()])).toString('base64url');
}
