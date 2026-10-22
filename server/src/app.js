import express from 'express';
import { randomUUID } from 'node:crypto';
import { assert, error, publicError } from './errors.js';
import { object, revisionParam } from './validation.js';

export function createApp(config, { db, auth, rooms, notes, files, limiter, ready = () => true }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);
  app.use((request, response, next) => {
    request.requestId = randomUUID();
    response.set('X-Request-Id', request.requestId);
    response.set('X-Content-Type-Options', 'nosniff');
    if (request.path.startsWith('/api/')) response.set('Cache-Control', 'no-store');
    const started = performance.now();
    response.on('finish', () => {
      if (config.logLevel !== 'silent') console.log(JSON.stringify({ requestId: request.requestId, method: request.method, path: request.path, status: response.statusCode, durationMs: Math.round(performance.now() - started) }));
    });
    const origin = request.get('Origin');
    if (origin) {
      if (!config.origins.has(origin)) return next(error(403, 'ORIGIN_FORBIDDEN', 'Origin is not allowed'));
      response.set('Access-Control-Allow-Origin', origin);
      response.set('Vary', 'Origin');
      response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (request.method === 'OPTIONS') return response.sendStatus(204);
    if (!ready() && !request.path.startsWith('/health/')) return next(error(503, 'SERVICE_UNAVAILABLE', 'Server is shutting down'));
    next();
  });
  app.use(express.json({ limit: '256kb', strict: true }));

  const route = (handler) => async (request, response, next) => {
    try {
      const result = await handler(request);
      response.status(result?.status || 200).json({ data: result?.data ?? result });
    } catch (err) { next(err); }
  };
  const authenticated = async (request, response, next) => {
    try {
      const header = request.get('Authorization') || '';
      assert(/^Bearer [A-Za-z0-9_-]+$/.test(header), 401, 'UNAUTHENTICATED', 'Sign in again');
      request.token = header.slice(7);
      request.actor = await auth.authenticate(request.token);
      limiter.check(`api:${request.actor.user._id}`, 120, 60 * 1000);
      next();
    } catch (err) { next(err); }
  };
  const exactQuery = (query, allowed) => object(query, allowed);

  app.get('/health/live', (_request, response) => response.json({ status: 'ok' }));
  app.get('/health/ready', async (_request, response) => {
    try {
      assert(ready(), 503, 'SERVICE_UNAVAILABLE', 'Server is shutting down');
      await db.command({ ping: 1 });
      response.json({ status: 'ok' });
    } catch { response.status(503).json({ status: 'unavailable' }); }
  });

  app.post('/api/v1/auth/register', route(async (request) => {
    limiter.check(`auth:${request.ip}`, 10, 15 * 60 * 1000);
    return { status: 201, data: await auth.register(request.body) };
  }));
  app.post('/api/v1/auth/login', route(async (request) => {
    limiter.check(`auth:${request.ip}`, 10, 15 * 60 * 1000);
    return auth.login(request.body);
  }));
  app.post('/api/v1/auth/google', route(async (request) => {
    limiter.check(`auth:${request.ip}`, 10, 15 * 60 * 1000);
    return auth.loginGoogle(request.body);
  }));
  app.post('/api/v1/auth/github', route(async (request) => {
    limiter.check(`auth:${request.ip}`, 10, 15 * 60 * 1000);
    return auth.loginGitHub(request.body, request.get('Origin'));
  }));
  app.use('/api/v1', authenticated);
  app.get('/api/v1/auth/me', route((request) => auth.me(request.token)));
  app.post('/api/v1/auth/logout', route((request) => auth.logout(request.token)));

  app.get('/api/v1/rooms', route((request) => {
    exactQuery(request.query, ['limit', 'cursor']);
    return rooms.list(request.actor.user._id, request.query);
  }));
  app.post('/api/v1/rooms', route(async (request) => {
    limiter.check(`room-create:${request.actor.user._id}`, 10, 60 * 1000);
    return { status: 201, data: await rooms.create(request.token, request.body) };
  }));
  app.post('/api/v1/rooms/join', route((request) => {
    limiter.check(`invite:${request.actor.user._id}`, 10, 60 * 1000);
    return rooms.join(request.token, request.body);
  }));
  app.get('/api/v1/files', route((request) => {
    exactQuery(request.query, []);
    return files.listMine(request.actor.user._id);
  }));
  app.get('/api/v1/rooms/:roomId', route((request) => rooms.get(request.actor.user._id, request.params.roomId)));
  app.get('/api/v1/rooms/:roomId/note', route((request) => rooms.note(request.actor.user._id, request.params.roomId)));
  app.get('/api/v1/rooms/:roomId/files', route((request) => {
    exactQuery(request.query, []);
    return files.list(request.actor.user._id, request.params.roomId);
  }));
  app.post('/api/v1/rooms/:roomId/files', route(async (request) => {
    limiter.check(`file-create:${request.actor.user._id}`, 20, 60 * 1000);
    return { status: 201, data: await files.create(request.token, request.params.roomId, request.body) };
  }));
  app.get('/api/v1/rooms/:roomId/files/:fileId', route((request) => files.get(request.actor.user._id, request.params.roomId, request.params.fileId)));
  app.post('/api/v1/rooms/:roomId/files/:fileId/ops', route((request) => {
    limiter.check(`file-edit:${request.actor.user._id}:${request.params.roomId}`, 120, 60 * 1000);
    return files.update(request.token, request.params.roomId, request.params.fileId, request.body);
  }));
  app.get('/api/v1/rooms/:roomId/invite', route((request) => rooms.invite(request.actor.user._id, request.params.roomId)));
  app.post('/api/v1/rooms/:roomId/invite/rotate', route((request) => {
    limiter.check(`invite:${request.actor.user._id}`, 10, 60 * 1000);
    return rooms.rotate(request.token, request.params.roomId);
  }));
  app.get('/api/v1/rooms/:roomId/versions', route((request) => {
    exactQuery(request.query, ['limit', 'beforeRevision']);
    return notes.history(request.actor.user._id, request.params.roomId, request.query);
  }));
  app.get('/api/v1/rooms/:roomId/versions/:revision', route((request) =>
    notes.version(request.actor.user._id, request.params.roomId, revisionParam(request.params.revision))));
  app.post('/api/v1/rooms/:roomId/versions/:revision/restore', route((request) =>
    notes.restore(request.token, request.params.roomId, revisionParam(request.params.revision), request.body)));

  app.use((request, response, next) => next(error(404, 'NOT_FOUND', 'Route not found')));
  app.use((err, request, response, _next) => {
    let failure = err;
    if (err?.type === 'entity.too.large') failure = error(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    else if (err instanceof SyntaxError && 'body' in err) failure = error(400, 'INVALID_REQUEST', 'Invalid JSON');
    const exposed = publicError(failure);
    if (exposed.status >= 500 && config.logLevel !== 'silent') console.error('Request failed', request.requestId, err?.name || 'Error');
    if (failure.retryAfter) response.set('Retry-After', String(failure.retryAfter));
    response.status(exposed.status).json({ error: { code: exposed.code, message: exposed.message, requestId: request.requestId } });
  });
  return app;
}
