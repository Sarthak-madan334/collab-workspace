const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
import {
  DEMO_EMAIL, DEMO_MODE, DEMO_PASSWORD, DEMO_TOKEN, DEMO_USER,
  demoCreateRoom, demoInvite, demoJoinRoom, demoNote, demoRestore, demoRoom, demoRooms, demoVersions,
} from './demo.js';
import { IS_ANDROID } from './native-session.js';
import { demoFileAssign, demoFileContributions, demoFileCreate, demoFileGet, demoFileHistory, demoFileList, demoFileListMine, demoFileRestore, demoFileSetAreaStatus, demoFileUpdate, demoFileVersion } from './file-demo.js';

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export async function request(path, { token, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    if (IS_ANDROID) window.dispatchEvent(new Event('synkro:api-network-error'));
    throw new ApiError('The workspace server could not be reached. Check your connection and try again.', 'NETWORK_ERROR', 0);
  }

  if (IS_ANDROID) window.dispatchEvent(new Event('synkro:api-success'));

  let payload;
  try { payload = await response.json(); } catch { payload = {}; }
  if (!response.ok) {
    const error = payload.error || {};
    throw new ApiError(error.message || 'Something went wrong. Please try again.', error.code || 'REQUEST_FAILED', response.status);
  }
  return payload.data ?? payload;
}

export const authApi = {
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  google: (credential) => request('/auth/google', { method: 'POST', body: JSON.stringify({ credential }) }),
  github: (data) => request('/auth/github', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => {
    if (DEMO_MODE && data.email.trim().toLowerCase() === DEMO_EMAIL && data.password === DEMO_PASSWORD) {
      return Promise.resolve({ user: DEMO_USER, token: DEMO_TOKEN, expiresAt: null });
    }
    return request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
  },
  logout: (token) => (DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve({ loggedOut: true }) : request('/auth/logout', { token, method: 'POST' })),
  me: (token) => (DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve({ user: DEMO_USER }) : request('/auth/me', { token })),
};

export const roomApi = {
  list: (token) => (DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve({ items: demoRooms() }) : request('/rooms?limit=100', { token })),
  create: (token, name, kind = 'room') => {
    if (DEMO_MODE && token === DEMO_TOKEN) return Promise.resolve(demoCreateRoom(name, kind));
    return request('/rooms', { token, method: 'POST', body: JSON.stringify({ name, kind }) });
  },
  join: (token, inviteCode) => {
    if (DEMO_MODE && token === DEMO_TOKEN) return Promise.resolve(demoJoinRoom(inviteCode));
    return request('/rooms/join', { token, method: 'POST', body: JSON.stringify({ inviteCode }) });
  },
  get: (token, roomId) => {
    if (DEMO_MODE && token === DEMO_TOKEN) {
      const room = demoRoom(roomId);
      return room ? Promise.resolve({ room }) : Promise.reject(new ApiError('Room not found.', 'NOT_FOUND', 404));
    }
    return request(`/rooms/${encodeURIComponent(roomId)}`, { token });
  },
  note: (token, roomId) => (DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve({ note: demoNote(roomId) }) : request(`/rooms/${encodeURIComponent(roomId)}/note`, { token })),
  invite: (token, roomId) => (DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve({ inviteCode: demoInvite(roomId) }) : request(`/rooms/${encodeURIComponent(roomId)}/invite`, { token })),
  rotateInvite: (token, roomId) => {
    if (DEMO_MODE && token === DEMO_TOKEN) {
      const inviteCode = `SYNKRO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      try {
        const stored = JSON.parse(localStorage.getItem('synkro.demo.invites.v1') || '{}');
        localStorage.setItem('synkro.demo.invites.v1', JSON.stringify({ ...stored, [roomId]: inviteCode }));
      } catch { return Promise.reject(new Error('Local demo storage is unavailable in this browser.')); }
      return Promise.resolve({ inviteCode });
    }
    return request(`/rooms/${encodeURIComponent(roomId)}/invite/rotate`, { token, method: 'POST' });
  },
  versions: (token, roomId, beforeRevision) => {
    if (DEMO_MODE && token === DEMO_TOKEN) {
      const versions = demoVersions(roomId).slice().sort((a, b) => Number(b.revision) - Number(a.revision));
      const eligible = versions.filter((item) => beforeRevision == null || Number(item.revision) < Number(beforeRevision));
      const items = eligible.slice(0, 30).map(({ content, ...metadata }) => metadata);
      return Promise.resolve({ items, nextBeforeRevision: eligible.length > items.length ? items.at(-1)?.revision ?? null : null });
    }
    const query = new URLSearchParams({ limit: '30' });
    if (beforeRevision != null) query.set('beforeRevision', String(beforeRevision));
    return request(`/rooms/${encodeURIComponent(roomId)}/versions?${query}`, { token });
  },
  version: (token, roomId, revision) => {
    if (DEMO_MODE && token === DEMO_TOKEN) {
      const version = demoVersions(roomId).find((item) => Number(item.revision) === Number(revision));
      return version ? Promise.resolve({ version }) : Promise.reject(new ApiError('Version not found.', 'NOT_FOUND', 404));
    }
    return request(`/rooms/${encodeURIComponent(roomId)}/versions/${revision}`, { token });
  },
  restore: (token, roomId, revision, operationId, expectedRevision) => {
    if (DEMO_MODE && token === DEMO_TOKEN) return Promise.resolve(demoRestore(roomId, revision, operationId, expectedRevision));
    return request(`/rooms/${encodeURIComponent(roomId)}/versions/${revision}/restore`, { token, method: 'POST', body: JSON.stringify({ operationId, expectedRevision }) });
  },
};

export const fileApi = {
  listMine: (token) => DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve({ items: demoFileListMine() }) : request('/files', { token }),
  list: (token, roomId) => DEMO_MODE && token === DEMO_TOKEN
    ? Promise.resolve({ items: demoFileList(roomId) })
    : request(`/rooms/${encodeURIComponent(roomId)}/files`, { token }),
  create: (token, roomId, type, title) => DEMO_MODE && token === DEMO_TOKEN
    ? Promise.resolve(demoFileCreate(roomId, type, title))
    : request(`/rooms/${encodeURIComponent(roomId)}/files`, { token, method: 'POST', body: JSON.stringify({ type, title }) }),
  get: (token, roomId, fileId) => DEMO_MODE && token === DEMO_TOKEN
    ? Promise.resolve(demoFileGet(roomId, fileId))
    : request(`/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}`, { token }),
  update: (token, roomId, fileId, change) => DEMO_MODE && token === DEMO_TOKEN
    ? Promise.resolve(demoFileUpdate(roomId, fileId, change))
    : request(`/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}/ops`, { token, method: 'POST', body: JSON.stringify(change) }),
  history: (token, roomId, fileId) => DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve(demoFileHistory(roomId, fileId)) : request(`/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}/history?limit=30`, { token }),
  version: (token, roomId, fileId, revision) => DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve(demoFileVersion(roomId, fileId, revision)) : request(`/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}/history/${revision}`, { token }),
  restore: (token, roomId, fileId, revision, operationId, expectedRevision) => DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve(demoFileRestore(roomId, fileId, revision, operationId, expectedRevision)) : request(`/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}/history/${revision}/restore`, { token, method: 'POST', body: JSON.stringify({ operationId, expectedRevision }) }),
  contributions: (token, roomId, fileId) => DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve(demoFileContributions(roomId, fileId)) : request(`/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}/contributions`, { token }),
  assign: (token, roomId, fileId, areaId, assigneeId) => DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve(demoFileAssign(roomId, fileId, areaId, assigneeId)) : request(`/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}/assignments`, { token, method: 'POST', body: JSON.stringify({ areaId, assigneeId }) }),
  setAreaStatus: (token, roomId, fileId, areaId, status) => DEMO_MODE && token === DEMO_TOKEN ? Promise.resolve(demoFileSetAreaStatus(roomId, fileId, areaId, status)) : request(`/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}/areas/${encodeURIComponent(areaId)}/status`, { token, method: 'POST', body: JSON.stringify({ status }) }),
};

export const compilerApi = {
  run: (token, roomId, fileId, payload) => {
    if (DEMO_MODE && token === DEMO_TOKEN) {
      return Promise.reject(new ApiError('Sign in with an account to run code. Demo files are stored in this browser.', 'DEMO_COMPILER_UNAVAILABLE', 403));
    }
    return request(`/rooms/${encodeURIComponent(roomId)}/files/${encodeURIComponent(fileId)}/run`, {
      token,
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
