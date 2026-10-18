import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export const IS_ANDROID = Capacitor.getPlatform() === 'android';
const SESSION_KEY = 'synkro.android.session.v1';

export function parseSavedSession(value, now = Date.now()) {
  try {
    const session = JSON.parse(value);
    if (typeof session?.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(session.token) ||
      typeof session.user?.id !== 'string' || !session.expiresAt ||
      !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= now) return null;
    return session;
  } catch { return null; }
}

export async function restoreNativeSession() {
  if (!IS_ANDROID) return null;
  const { value } = await Preferences.get({ key: SESSION_KEY });
  if (!value) return null;
  const session = parseSavedSession(value);
  if (!session) {
    await Preferences.remove({ key: SESSION_KEY });
    return null;
  }
  return session;
}

export async function persistNativeSession(session) {
  if (!IS_ANDROID) return;
  if (!session) return Preferences.remove({ key: SESSION_KEY });
  return Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
}
