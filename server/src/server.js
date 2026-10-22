import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { connectDatabase } from './db.js';
import { createAuthService } from './auth.js';
import { createRoomService } from './rooms.js';
import { createNoteService } from './notes.js';
import { createFileService } from './files.js';
import { createCodeRunner } from './code-runner.js';
import { createAiService } from './ai.js';
import { RoomQueue } from './queue.js';
import { RateLimiter } from './rate-limit.js';
import { Presence } from './presence.js';
import { createSocketServer } from './socket.js';
import { createApp } from './app.js';

const config = loadConfig();
const { client, db } = await connectDatabase(config);
const queue = new RoomQueue();
const limiter = new RateLimiter();
const presence = new Presence();
let socketServer;
let ready = true;
const auth = createAuthService(db, client, config, (sessionId) => socketServer?.revoke(sessionId));
const rooms = createRoomService(db, client, auth, queue);
const notes = createNoteService(db, client, auth, rooms, queue, (event, payload) => socketServer?.publish(event, payload));
const files = createFileService(db, client, auth, rooms, queue, (event, payload) => socketServer?.publish(event, payload));
const codeRunner = createCodeRunner(config);
const ai = createAiService({ config, rooms, files, limiter });
const app = createApp(config, { db, auth, rooms, notes, files, codeRunner, ai, limiter, ready: () => ready });
const httpServer = createServer(app);
socketServer = createSocketServer(httpServer, config, { auth, rooms, notes, queue, presence, limiter, ready: () => ready });
httpServer.listen(config.port, '0.0.0.0', () => console.log(`Synkro server listening on ${config.port}`));

async function shutdown() {
  if (!ready) return;
  ready = false;
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  await new Promise((resolve) => socketServer.io.close(resolve));
  await socketServer.drain();
  await queue.drain();
  await client.close();
  clearTimeout(force);
}
process.on('SIGTERM', () => shutdown().catch((err) => { console.error(err); process.exitCode = 1; }));
process.on('SIGINT', () => shutdown().catch((err) => { console.error(err); process.exitCode = 1; }));
