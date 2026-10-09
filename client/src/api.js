const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

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
    throw new ApiError('The workspace server could not be reached. Check your connection and try again.', 'NETWORK_ERROR', 0);
  }

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
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: (token) => request('/auth/me', { token }),
  logout: (token) => request('/auth/logout', { token, method: 'POST' }),
};

export const roomApi = {
  list: (token) => request('/rooms?limit=100', { token }),
  create: (token, name) => request('/rooms', { token, method: 'POST', body: JSON.stringify({ name }) }),
  join: (token, inviteCode) => request('/rooms/join', { token, method: 'POST', body: JSON.stringify({ inviteCode }) }),
  get: (token, roomId) => request(`/rooms/${encodeURIComponent(roomId)}`, { token }),
  note: (token, roomId) => request(`/rooms/${encodeURIComponent(roomId)}/note`, { token }),
  invite: (token, roomId) => request(`/rooms/${encodeURIComponent(roomId)}/invite`, { token }),
  rotateInvite: (token, roomId) => request(`/rooms/${encodeURIComponent(roomId)}/invite/rotate`, { token, method: 'POST' }),
  versions: (token, roomId, beforeRevision) => {
    const query = new URLSearchParams({ limit: '30' });
    if (beforeRevision != null) query.set('beforeRevision', String(beforeRevision));
    return request(`/rooms/${encodeURIComponent(roomId)}/versions?${query}`, { token });
  },
  version: (token, roomId, revision) => request(`/rooms/${encodeURIComponent(roomId)}/versions/${revision}`, { token }),
  restore: (token, roomId, revision, operationId, expectedRevision) => request(`/rooms/${encodeURIComponent(roomId)}/versions/${revision}/restore`, {
    token, method: 'POST', body: JSON.stringify({ operationId, expectedRevision }),
  }),
};
