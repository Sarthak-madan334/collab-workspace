import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ObjectId } from 'mongodb';
import { createAiService, AI_MAX_CONTEXT_BYTES, buildFileRepresentation, buildWorkspaceContext } from '../src/ai.js';
import { createApp } from '../src/app.js';
import { error } from '../src/errors.js';
import { RateLimiter } from '../src/rate-limit.js';

const userId = new ObjectId();
const roomId = new ObjectId();
const fileId = new ObjectId();

const insight = {
  overallScore: 83,
  overallLabel: 'At risk',
  collaborationScore: 68,
  collaborationLabel: 'Strong',
  completenessScore: 72,
  organizationScore: 88,
  summary: 'The workspace has a clear structure with some open areas.',
  strengths: ['The project plan is organized.'],
  risks: ['Some sections are still empty.'],
  suggestions: [
    { priority: 'high', title: 'Fill open sections', detail: 'Add the missing project details.' },
    { priority: 'medium', title: 'Review ownership', detail: 'Confirm who is responsible for each area.' },
    { priority: 'low', title: 'Check terminology', detail: 'Use consistent labels across files.' },
  ],
  confidenceNote: 'This estimate is based on the supplied workspace content.' ,
};

function createHarness({ roomAccess, groqApiKey = 'test-key', client, contents = [] } = {}) {
  const filesById = new Map(contents.map((file) => [file._id.toString(), file]));
  const rooms = {
    access: roomAccess || (async () => ({ _id: roomId, name: 'Project room' })),
    note: async () => ({ note: { content: 'Project notes', revision: 2 } }),
  };
  const files = {
    list: async () => ({ items: [...filesById.values()].map((file) => ({
      id: file._id.toString(), type: file.type, title: file.title, revision: file.revision, updatedAt: file.updatedAt,
    })) }),
    get: async (_user, _room, id) => {
      const file = filesById.get(id);
      if (!file) throw error(404, 'NOT_FOUND', 'File not found');
      return { file };
    },
  };
  const config = { groqApiKey, groqModel: 'test-model', origins: new Set(), trustProxyHops: 0, logLevel: 'silent' };
  const limiter = new RateLimiter();
  const ai = createAiService({ config, rooms, files, limiter, client });
  const app = createApp({ origins: new Set(), trustProxyHops: 0, logLevel: 'silent' }, {
    db: { command: async () => ({ ok: 1 }) },
    auth: { authenticate: async () => ({ user: { _id: userId } }) },
    rooms, files, notes: {}, limiter, ai,
  });
  return { ai, app, rooms, files, limiter };
}

async function listen(t, app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function post(base, path, body, token = 'test-token') {
  const response = await fetch(`${base}/api/v1${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

const mockClient = (outputText = JSON.stringify(insight), onRequest = () => {}) => ({
  responses: {
    create: async (request) => {
      onRequest(request);
      return { output_text: outputText };
    },
  },
});

test('AI endpoints reject unauthenticated requests before calling the provider', async (t) => {
  let providerCalls = 0;
  const { app } = createHarness({ client: mockClient(JSON.stringify(insight), () => { providerCalls += 1; }) });
  const base = await listen(t, app);
  const { response, body } = await post(base, `/rooms/${roomId}/ai/insights`, {}, null);
  assert.equal(response.status, 401);
  assert.equal(body.error.code, 'UNAUTHENTICATED');
  assert.equal(providerCalls, 0);
});

test('AI requests cannot access a room without membership', async (t) => {
  let providerCalls = 0;
  const { app } = createHarness({ roomAccess: async () => { throw error(404, 'NOT_FOUND', 'Room not found'); }, client: mockClient(JSON.stringify(insight), () => { providerCalls += 1; }) });
  const base = await listen(t, app);
  const { response, body } = await post(base, `/rooms/${roomId}/ai/chat`, { question: 'Summarize this room' });
  assert.equal(response.status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
  assert.equal(providerCalls, 0);
});

test('missing API key returns a clear configuration response without reading context', async (t) => {
  let reads = 0;
  const { app, rooms } = createHarness({ groqApiKey: null });
  rooms.note = async () => { reads += 1; return { note: { content: '' } }; };
  const base = await listen(t, app);
  const { response, body } = await post(base, `/rooms/${roomId}/ai/insights`, {});
  assert.equal(response.status, 503);
  assert.equal(body.error.code, 'AI_NOT_CONFIGURED');
  assert.match(body.error.message, /GROQ_API_KEY/);
  assert.equal(reads, 0);
});

test('insights validate and normalize structured model output before returning it', async (t) => {
  let sentRequest;
  const { app } = createHarness({ client: mockClient(JSON.stringify(insight), (request) => { sentRequest = request; }) });
  const base = await listen(t, app);
  const { response, body } = await post(base, `/rooms/${roomId}/ai/insights`, { activeFileId: fileId.toString() });
  assert.equal(response.status, 404, 'an active file must belong to the requested room');
  assert.equal(sentRequest, undefined);

  const { app: validApp } = createHarness({ client: mockClient(JSON.stringify(insight), (request) => { sentRequest = request; }), contents: [{ _id: fileId, type: 'document', title: 'Plan', revision: 1, content: { body: 'Milestones' } }] });
  const validBase = await listen(t, validApp);
  const valid = await post(validBase, `/rooms/${roomId}/ai/insights`, { activeFileId: fileId.toString() });
  assert.equal(valid.response.status, 200);
  assert.equal(valid.body.data.insights.overallLabel, 'Strong');
  assert.equal(valid.body.data.insights.collaborationLabel, 'Needs attention');
  assert.equal(valid.body.data.insights.suggestions.length, 3);
  assert.equal(sentRequest.model, 'test-model');
  assert.equal(sentRequest.text.format.type, 'json_schema');
  assert.match(sentRequest.input[0].content, /Never invent deadlines/);
});

test('malformed model insight output becomes a controlled safe error', async (t) => {
  const { app } = createHarness({ client: mockClient('{"overallScore": "great"}') });
  const base = await listen(t, app);
  const { response, body } = await post(base, `/rooms/${roomId}/ai/insights`, {});
  assert.equal(response.status, 502);
  assert.equal(body.error.code, 'AI_INVALID_RESPONSE');
  assert.doesNotMatch(body.error.message, /SyntaxError|stack/i);
});

test('chat returns separately labeled workspace facts and suggestions', async (t) => {
  let sentRequest;
  let requestOptions;
  const modelAnswer = { knownFacts: ['The room contains project notes.'], suggestions: ['Add owners to the open work areas.'] };
  const client = { responses: { create: async (request, options) => { sentRequest = request; requestOptions = options; return { output_text: JSON.stringify(modelAnswer) }; } } };
  const { app } = createHarness({ client });
  const base = await listen(t, app);
  const { response, body } = await post(base, `/rooms/${roomId}/ai/chat`, { question: 'What is missing?' });
  assert.equal(response.status, 200);
  assert.match(body.data.answer, /Known workspace facts\n- The room contains project notes\./);
  assert.match(body.data.answer, /Suggestions\n- Add owners/);
  assert.equal(sentRequest.text.format.name, 'synkro_workspace_answer');
  assert.ok(requestOptions.signal instanceof AbortSignal);
  assert.equal(Object.hasOwn(sentRequest, 'signal'), false);
});

test('malformed chat model output becomes a controlled safe error', async (t) => {
  const { app } = createHarness({ client: mockClient('not JSON') });
  const base = await listen(t, app);
  const { response, body } = await post(base, `/rooms/${roomId}/ai/chat`, { question: 'Summarize this workspace' });
  assert.equal(response.status, 502);
  assert.equal(body.error.code, 'AI_INVALID_RESPONSE');
});

test('provider timeout is returned as a retryable safe error', async (t) => {
  const timeoutClient = { responses: { create: async () => { const failure = new Error('request timeout'); failure.name = 'APIConnectionTimeoutError'; throw failure; } } };
  const { app } = createHarness({ client: timeoutClient });
  const base = await listen(t, app);
  const { response, body } = await post(base, `/rooms/${roomId}/ai/chat`, { question: 'Summarize this workspace' });
  assert.equal(response.status, 504);
  assert.equal(body.error.code, 'AI_TIMEOUT');
  assert.match(body.error.message, /retry/i);
});

test('oversized questions and caller-supplied context are rejected', async (t) => {
  const { app } = createHarness({ client: mockClient() });
  const base = await listen(t, app);
  const tooLong = await post(base, `/rooms/${roomId}/ai/chat`, { question: 'x'.repeat(1801) });
  assert.equal(tooLong.response.status, 422);
  const suppliedContext = await post(base, `/rooms/${roomId}/ai/chat`, { question: 'Summarize', context: 'x'.repeat(AI_MAX_CONTEXT_BYTES + 1) });
  assert.equal(suppliedContext.response.status, 400);
  assert.equal(suppliedContext.body.error.code, 'INVALID_REQUEST');
});

test('per-user and per-room AI limits return the established rate-limit response', async () => {
  const roomHarness = createHarness({ client: mockClient() });
  const actor = { user: { _id: userId } };
  for (let attempt = 0; attempt < 5; attempt += 1) await roomHarness.ai.insights(actor, roomId.toString(), {});
  await assert.rejects(roomHarness.ai.insights(actor, roomId.toString(), {}), { code: 'RATE_LIMITED', status: 429 });
  const userHarness = createHarness({ client: mockClient(), roomAccess: async (_user, id) => ({ _id: id, name: 'Project room' }) });
  for (let attempt = 0; attempt < 10; attempt += 1) await userHarness.ai.insights(actor, new ObjectId().toString(), {});
  await assert.rejects(userHarness.ai.insights(actor, new ObjectId().toString(), {}), { code: 'RATE_LIMITED', status: 429 });
});

test('all supported file types produce bounded, allowlisted context without private record fields', async () => {
  const examples = [
    { type: 'document', content: { body: 'Document text' } },
    { type: 'notebook', content: { pages: [{ title: 'Notes', body: 'Notebook text' }] } },
    { type: 'slides', content: { slides: [{ title: 'Overview', body: 'Slide text', notes: 'Speaker text' }] } },
    { type: 'sheet', content: { cells: { B2: '=A1*2', A1: '3' }, styles: { A1: { secret: true } } } },
    { type: 'code', content: { language: 'python', sources: { python: 'print(1)' }, stdin: 'private input' } },
  ].map((item, index) => ({ _id: new ObjectId(), title: `File ${index}`, revision: 1, ...item, passwordHash: 'must-not-appear', sessionToken: 'must-not-appear' }));
  const harness = createHarness({ contents: examples });
  const context = await buildWorkspaceContext({ rooms: harness.rooms, files: harness.files, userId, roomId: roomId.toString() });
  for (const expected of ['Document text', 'Notebook text', 'Slide text', 'Speaker text', 'A1: 3', 'B2: =A1*2', 'print(1)']) assert.ok(context.includes(expected), expected);
  assert.doesNotMatch(context, /passwordHash|sessionToken|private input|secret/);
  assert.ok(Buffer.byteLength(context, 'utf8') <= AI_MAX_CONTEXT_BYTES);
});

test('large workspace content is safely truncated with an explicit marker', async () => {
  const file = { _id: fileId, type: 'document', title: 'Large plan', revision: 1, content: { body: 'é'.repeat(20_000) } };
  const representation = buildFileRepresentation(file, 128);
  assert.match(representation, /\[content truncated\]/);
  const harness = createHarness({ contents: [file] });
  const context = await buildWorkspaceContext({ rooms: harness.rooms, files: harness.files, userId, roomId: roomId.toString() });
  assert.match(context, /\[content truncated\]/);
  assert.ok(Buffer.byteLength(context, 'utf8') <= AI_MAX_CONTEXT_BYTES);
});

test('active-file context includes sibling metadata but not sibling contents', async () => {
  const active = { _id: fileId, type: 'document', title: 'Current', revision: 3, updatedAt: '2026-10-20T10:00:00.000Z', content: { body: 'Current file body' } };
  const sibling = { _id: new ObjectId(), type: 'document', title: 'Sibling', revision: 1, content: { body: 'Sibling private content' } };
  const harness = createHarness({ contents: [active, sibling] });
  const context = await buildWorkspaceContext({ rooms: harness.rooms, files: harness.files, userId, roomId: roomId.toString(), activeFileId: fileId.toString() });
  assert.match(context, /Current file body/);
  assert.match(context, /Sibling \(document, revision 1\)/);
  assert.doesNotMatch(context, /Sibling private content/);
});