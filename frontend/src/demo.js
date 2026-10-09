export const DEMO_MODE = import.meta.env.DEV;
export const DEMO_EMAIL = 'demo@synkro.app';
export const DEMO_PASSWORD = 'synkro-demo';
export const DEMO_TOKEN = 'synkro-local-demo-session';
export const DEMO_USER = { id: 'demo-user', name: 'Demo Teammate', email: DEMO_EMAIL };

const ROOM_KEY = 'synkro.demo.rooms.v1';
const NOTE_KEY = 'synkro.demo.notes.v1';
const VERSION_KEY = 'synkro.demo.versions.v1';
const INVITE_KEY = 'synkro.demo.invites.v1';

const initialRoom = { id: 'room-a04-demo', name: 'BuildLab planning', ownerId: DEMO_USER.id, createdAt: '2026-10-09T10:00:00.000Z' };
const initialContent = `BuildLab '26 — planning notes\n\nToday\n• Align on the core collaboration flow\n• Keep the shared page calm and easy to scan\n• Capture decisions as the team works\n\nOpen questions\nWhat should we prototype next?`;
const initialNote = { roomId: initialRoom.id, content: initialContent, revision: 4, updatedBy: DEMO_USER.id, updatedAt: '2026-10-09T10:30:00.000Z' };
const initialVersions = [
  { roomId: initialRoom.id, revision: 0, content: '', authorId: DEMO_USER.id, authorName: DEMO_USER.name, kind: 'initial', createdAt: '2026-10-09T10:00:00.000Z' },
  { roomId: initialRoom.id, revision: 1, content: 'BuildLab planning\n\nStart with the problem we want to solve.', authorId: DEMO_USER.id, authorName: DEMO_USER.name, kind: 'edit', createdAt: '2026-10-09T10:08:00.000Z' },
  { roomId: initialRoom.id, revision: 2, content: 'BuildLab planning\n\nStart with the problem we want to solve.\n\nOpen question: what should the shared page feel like?', authorId: 'demo-alie', authorName: 'Demo 2', kind: 'edit', createdAt: '2026-10-09T10:16:00.000Z' },
  { roomId: initialRoom.id, revision: 3, content: `BuildLab '26 — planning notes\n\nToday\n• Align on the core collaboration flow\n• Keep the shared page calm and easy to scan`, authorId: DEMO_USER.id, authorName: DEMO_USER.name, kind: 'edit', createdAt: '2026-10-09T10:24:00.000Z' },
  { ...initialNote, authorId: 'demo-alie', authorName: 'Demo 2', kind: 'edit', createdAt: initialNote.updatedAt },
];

function read(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new Error('Local demo storage is unavailable in this browser.'); }
}

export function demoRooms() { return read(ROOM_KEY, [initialRoom]); }
export function demoRoom(roomId) { return demoRooms().find((room) => room.id === roomId); }
export function demoNote(roomId) {
  const notes = read(NOTE_KEY, { [initialRoom.id]: initialNote });
  return notes[roomId] || { roomId, content: '', revision: 0, updatedBy: DEMO_USER.id, updatedAt: new Date().toISOString() };
}
export function demoVersions(roomId) {
  const versions = read(VERSION_KEY, { [initialRoom.id]: initialVersions });
  return versions[roomId] || [{ roomId, revision: 0, content: '', authorId: DEMO_USER.id, authorName: DEMO_USER.name, kind: 'initial', createdAt: demoRoom(roomId)?.createdAt || new Date().toISOString() }];
}
export function demoInvite(roomId) {
  const invites = read(INVITE_KEY, { [initialRoom.id]: 'SYNKRO-A04-DEMO' });
  return invites[roomId] || 'SYNKRO-A04-DEMO';
}

export function demoCreateRoom(name) {
  const rooms = demoRooms();
  const room = { id: `demo-${crypto.randomUUID()}`, name, ownerId: DEMO_USER.id, createdAt: new Date().toISOString() };
  write(ROOM_KEY, [room, ...rooms]);
  const note = { roomId: room.id, content: '', revision: 0, updatedBy: DEMO_USER.id, updatedAt: room.createdAt };
  write(NOTE_KEY, { ...read(NOTE_KEY, { [initialRoom.id]: initialNote }), [room.id]: note });
  const versions = demoVersions(room.id);
  write(VERSION_KEY, { ...read(VERSION_KEY, { [initialRoom.id]: initialVersions }), [room.id]: versions });
  write(INVITE_KEY, { ...read(INVITE_KEY, { [initialRoom.id]: 'SYNKRO-A04-DEMO' }), [room.id]: `SYNKRO-${crypto.randomUUID().slice(0, 8).toUpperCase()}` });
  return { room, inviteCode: demoInvite(room.id) };
}

export function demoJoinRoom(code) {
  const rooms = demoRooms();
  const room = rooms.find((item) => demoInvite(item.id).toLowerCase() === code.toLowerCase());
  if (!room) throw new Error('That demo invite code was not found. Try SYNKRO-A04-DEMO.');
  return { room };
}

export function demoSave(roomId, operationId, content, kind = 'edit', restoredFromRevision = null, expectedRevision = null) {
  const notes = read(NOTE_KEY, { [initialRoom.id]: initialNote });
  const current = notes[roomId] || { roomId, content: '', revision: 0 };
  const previousVersions = demoVersions(roomId);
  const existing = previousVersions.find((version) => version.operationId === operationId);
  if (existing) return { appliedRevision: existing.revision, note: current };
  if (expectedRevision != null && Number(expectedRevision) !== Number(current.revision)) {
    const error = new Error('The shared note changed. Sync the latest version and try again.'); error.status = 409; throw error;
  }
  const now = new Date().toISOString();
  const next = { roomId, content, revision: Number(current.revision) + 1, updatedBy: DEMO_USER.id, updatedAt: now };
  const version = { ...next, authorId: DEMO_USER.id, authorName: DEMO_USER.name, operationId, kind, restoredFromRevision, createdAt: now };
  write(NOTE_KEY, { ...notes, [roomId]: next });
  write(VERSION_KEY, { ...read(VERSION_KEY, { [initialRoom.id]: initialVersions }), [roomId]: [...previousVersions, version] });
  return { appliedRevision: next.revision, note: next };
}

export function demoRestore(roomId, sourceRevision, operationId, expectedRevision) {
  const source = demoVersions(roomId).find((version) => Number(version.revision) === Number(sourceRevision));
  if (!source) throw new Error('That version could not be found.');
  return demoSave(roomId, operationId, source.content, 'restore', Number(sourceRevision), expectedRevision);
}
