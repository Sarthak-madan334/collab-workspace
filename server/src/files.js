import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { assert } from './errors.js';
import { transaction } from './db.js';
import { beforeRevision, limit, object, objectId, operationId, revision, string } from './validation.js';

const TYPES = new Set(['document', 'slides', 'sheet', 'notebook', 'code']);
const MAX_FILE_BYTES = 256 * 1024;
const MAX_CODE_BYTES = 64 * 1024;
const cellPattern = /^[A-Z](?:[1-9]|[1-9]\d|100)$/;

const starterCode = {
  python: 'print("Hello from Synkro!")\n',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello from Synkro!" << std::endl;\n    return 0;\n}\n',
};

export const fileShape = (file) => ({
  id: file._id.toString(),
  roomId: file.roomId.toString(),
  type: file.type,
  title: file.title,
  content: file.content,
  revision: file.revision,
  createdAt: file.createdAt.toISOString(),
  updatedAt: file.updatedAt.toISOString(),
  updatedBy: file.updatedBy.toString(),
});

export const fileSummary = (file) => ({
  id: file._id.toString(),
  roomId: file.roomId.toString(),
  type: file.type,
  title: file.title,
  revision: file.revision,
  createdAt: file.createdAt.toISOString(),
  updatedAt: file.updatedAt.toISOString(),
});

export function initialFileContent(type) {
  if (type === 'document') return { body: '', format: { font: 'Aptos', size: 16, align: 'left' } };
  if (type === 'slides')
    return {
      slides: [{ id: randomUUID(), title: 'Untitled slide', body: '', theme: 'paper', notes: '' }],
    };
  if (type === 'notebook')
    return {
      pages: [{ id: randomUUID(), title: 'Untitled page', body: '', font: 'Aptos', size: 17 }],
    };
  if (type === 'code') return { language: 'python', sources: { ...starterCode }, stdin: '' };
  return { cells: {}, styles: {} };
}

export function validatePatch(type, patch) {
  assert(
    patch && typeof patch === 'object' && !Array.isArray(patch),
    400,
    'INVALID_REQUEST',
    'A file change is required',
  );
  if (patch.action === 'rename') {
    object(patch, ['action', 'value']);
    return { action: 'rename', value: string(patch.value, 'File name', 1, 80) };
  }
  if (type === 'document' && patch.action === 'setBody') {
    object(patch, ['action', 'value']);
    assert(
      typeof patch.value === 'string' && patch.value.length <= 100_000,
      422,
      'VALIDATION_FAILED',
      'Document is too long',
    );
    return { action: 'setBody', value: patch.value };
  }
  if (type === 'document' && patch.action === 'setFormat') {
    object(patch, ['action', 'field', 'value']);
    const allowed = {
      font: ['Aptos', 'Arial', 'Georgia', 'Times New Roman', 'Courier New'],
      size: [12, 14, 16, 18, 24, 32],
      align: ['left', 'center', 'right'],
    };
    assert(
      Object.hasOwn(allowed, patch.field) && allowed[patch.field].includes(patch.value),
      422,
      'VALIDATION_FAILED',
      'Invalid document formatting',
    );
    return { action: 'setFormat', field: patch.field, value: patch.value };
  }
  if (type === 'code' && patch.action === 'setCode') {
    object(patch, ['action', 'language', 'value']);
    assert(['python', 'cpp'].includes(patch.language), 422, 'VALIDATION_FAILED', 'Choose Python or C++');
    assert(typeof patch.value === 'string' && Buffer.byteLength(patch.value, 'utf8') <= MAX_CODE_BYTES, 413, 'PAYLOAD_TOO_LARGE', 'Code exceeds 64 KiB');
    return { action: 'setCode', language: patch.language, value: patch.value };
  }
  if (type === 'code' && patch.action === 'setCodeLanguage') {
    object(patch, ['action', 'language']);
    assert(['python', 'cpp'].includes(patch.language), 422, 'VALIDATION_FAILED', 'Choose Python or C++');
    return { action: 'setCodeLanguage', language: patch.language };
  }
  if (type === 'code' && patch.action === 'setCodeStdin') {
    object(patch, ['action', 'value']);
    assert(typeof patch.value === 'string' && Buffer.byteLength(patch.value, 'utf8') <= 16 * 1024, 413, 'PAYLOAD_TOO_LARGE', 'Program input exceeds 16 KiB');
    return { action: 'setCodeStdin', value: patch.value };
  }
  if (type === 'slides' && patch.action === 'addSlide') {
    object(patch, ['action', 'slideId']);
    return { action: 'addSlide', slideId: operationId(patch.slideId) };
  }
  if (type === 'slides' && patch.action === 'deleteSlide') {
    object(patch, ['action', 'slideId']);
    return { action: 'deleteSlide', slideId: operationId(patch.slideId) };
  }
  if (type === 'slides' && patch.action === 'duplicateSlide') {
    object(patch, ['action', 'sourceId', 'slideId']);
    return {
      action: 'duplicateSlide',
      sourceId: operationId(patch.sourceId),
      slideId: operationId(patch.slideId),
    };
  }
  if (type === 'slides' && patch.action === 'moveSlide') {
    object(patch, ['action', 'slideId', 'toIndex']);
    assert(
      Number.isInteger(patch.toIndex) && patch.toIndex >= 0 && patch.toIndex < 30,
      422,
      'VALIDATION_FAILED',
      'Invalid slide position',
    );
    return { action: 'moveSlide', slideId: operationId(patch.slideId), toIndex: patch.toIndex };
  }
  if (type === 'slides' && patch.action === 'setSlide') {
    object(patch, ['action', 'slideId', 'field', 'value']);
    assert(
      ['title', 'body', 'theme', 'notes'].includes(patch.field),
      422,
      'VALIDATION_FAILED',
      'Invalid slide field',
    );
    if (patch.field === 'theme')
      assert(
        ['paper', 'midnight', 'ocean', 'warm'].includes(patch.value),
        422,
        'VALIDATION_FAILED',
        'Invalid slide theme',
      );
    else
      assert(
        typeof patch.value === 'string' &&
          patch.value.length <=
            (patch.field === 'title' ? 120 : patch.field === 'notes' ? 10_000 : 5_000),
        422,
        'VALIDATION_FAILED',
        'Slide text is too long',
      );
    return {
      action: 'setSlide',
      slideId: operationId(patch.slideId),
      field: patch.field,
      value: patch.value,
    };
  }
  if (type === 'notebook' && ['addPage', 'deletePage'].includes(patch.action)) {
    object(patch, ['action', 'pageId']);
    return { action: patch.action, pageId: operationId(patch.pageId) };
  }
  if (type === 'notebook' && patch.action === 'setPage') {
    object(patch, ['action', 'pageId', 'field', 'value']);
    assert(
      ['title', 'body', 'font', 'size'].includes(patch.field),
      422,
      'VALIDATION_FAILED',
      'Invalid page field',
    );
    if (patch.field === 'font')
      assert(
        ['Aptos', 'Arial', 'Georgia', 'Courier New'].includes(patch.value),
        422,
        'VALIDATION_FAILED',
        'Invalid notebook font',
      );
    else if (patch.field === 'size')
      assert(
        [14, 17, 20, 24].includes(patch.value),
        422,
        'VALIDATION_FAILED',
        'Invalid notebook font size',
      );
    else
      assert(
        typeof patch.value === 'string' &&
          patch.value.length <= (patch.field === 'title' ? 120 : 100_000),
        422,
        'VALIDATION_FAILED',
        'Page text is too long',
      );
    return {
      action: 'setPage',
      pageId: operationId(patch.pageId),
      field: patch.field,
      value: patch.value,
    };
  }
  if (type === 'sheet' && patch.action === 'setCell') {
    object(patch, ['action', 'cell', 'value']);
    assert(
      typeof patch.cell === 'string' && cellPattern.test(patch.cell),
      422,
      'VALIDATION_FAILED',
      'Invalid cell',
    );
    assert(
      typeof patch.value === 'string' && patch.value.length <= 500,
      422,
      'VALIDATION_FAILED',
      'Cell text is too long',
    );
    return { action: 'setCell', cell: patch.cell, value: patch.value };
  }
  if (type === 'sheet' && patch.action === 'setCellStyle') {
    object(patch, ['action', 'cell', 'field', 'value']);
    assert(
      typeof patch.cell === 'string' && cellPattern.test(patch.cell),
      422,
      'VALIDATION_FAILED',
      'Invalid cell',
    );
    const allowed = {
      bold: [true, false],
      italic: [true, false],
      align: ['left', 'center', 'right'],
      fill: ['none', 'yellow', 'green', 'blue'],
      format: ['general', 'number', 'currency', 'percent'],
    };
    assert(
      Object.hasOwn(allowed, patch.field) && allowed[patch.field].includes(patch.value),
      422,
      'VALIDATION_FAILED',
      'Invalid cell formatting',
    );
    return { action: 'setCellStyle', cell: patch.cell, field: patch.field, value: patch.value };
  }
  assert(false, 422, 'VALIDATION_FAILED', 'This change is not available for this file type');
}

export function applyFilePatch(file, patch, baseRevision) {
  const fields = { ...file.fieldRevisions };
  const content = structuredClone(file.content);
  let key;
  if (patch.action === 'rename') key = 'title';
  if (patch.action === 'setBody') key = 'document:body';
  if (patch.action === 'setCode') key = `code:source:${patch.language}`;
  if (patch.action === 'setCodeLanguage') key = 'code:language';
  if (patch.action === 'setCodeStdin') key = 'code:stdin';
  if (patch.action === 'setFormat') key = `document:format:${patch.field}`;
  if (patch.action === 'setSlide') key = `slide:${patch.slideId}:${patch.field}`;
  if (['addSlide', 'deleteSlide', 'duplicateSlide', 'moveSlide'].includes(patch.action))
    key = 'slides:list';
  if (patch.action === 'setCell') key = `cell:${patch.cell}`;
  if (patch.action === 'setCellStyle') key = `cellstyle:${patch.cell}:${patch.field}`;
  if (patch.action === 'setPage') key = `page:${patch.pageId}:${patch.field}`;
  if (patch.action === 'addPage' || patch.action === 'deletePage') key = 'pages:list';
  assert(
    Math.max(fields[key] || 0, fields['*'] || 0) <= baseRevision,
    409,
    'REVISION_CONFLICT',
    'This part of the file changed. Review the latest version.',
  );

  if (patch.action === 'rename') file.title = patch.value;
  else if (patch.action === 'setBody') content.body = patch.value;
  else if (patch.action === 'setCode') content.sources[patch.language] = patch.value;
  else if (patch.action === 'setCodeLanguage') content.language = patch.language;
  else if (patch.action === 'setCodeStdin') content.stdin = patch.value;
  else if (patch.action === 'setFormat') content.format[patch.field] = patch.value;
  else if (patch.action === 'setSlide') {
    const slide = content.slides.find((item) => item.id === patch.slideId);
    assert(slide, 409, 'REVISION_CONFLICT', 'This slide was removed. Review the latest version.');
    slide[patch.field] = patch.value;
  } else if (patch.action === 'addSlide') {
    assert(
      content.slides.length < 30,
      422,
      'VALIDATION_FAILED',
      'A presentation can have at most 30 slides',
    );
    assert(
      !content.slides.some((item) => item.id === patch.slideId),
      409,
      'REVISION_CONFLICT',
      'This slide already exists',
    );
    content.slides.push({
      id: patch.slideId,
      title: 'Untitled slide',
      body: '',
      theme: 'paper',
      notes: '',
    });
  } else if (patch.action === 'duplicateSlide') {
    assert(
      content.slides.length < 30,
      422,
      'VALIDATION_FAILED',
      'A presentation can have at most 30 slides',
    );
    assert(
      !content.slides.some((item) => item.id === patch.slideId),
      409,
      'REVISION_CONFLICT',
      'This slide already exists',
    );
    const index = content.slides.findIndex((item) => item.id === patch.sourceId);
    assert(index >= 0, 409, 'REVISION_CONFLICT', 'The source slide was removed');
    content.slides.splice(index + 1, 0, { ...content.slides[index], id: patch.slideId });
  } else if (patch.action === 'moveSlide') {
    const index = content.slides.findIndex((item) => item.id === patch.slideId);
    assert(
      index >= 0 && patch.toIndex < content.slides.length,
      409,
      'REVISION_CONFLICT',
      'The slide list changed',
    );
    content.slides.splice(patch.toIndex, 0, content.slides.splice(index, 1)[0]);
  } else if (patch.action === 'deleteSlide') {
    assert(content.slides.length > 1, 422, 'VALIDATION_FAILED', 'Keep at least one slide');
    const index = content.slides.findIndex((item) => item.id === patch.slideId);
    assert(index >= 0, 409, 'REVISION_CONFLICT', 'This slide was already removed');
    assert(
      Object.entries(fields).every(
        ([field, changed]) =>
          !field.startsWith(`slide:${patch.slideId}:`) || changed <= baseRevision,
      ),
      409,
      'REVISION_CONFLICT',
      'This slide changed. Review it before removing it.',
    );
    content.slides.splice(index, 1);
  } else if (patch.action === 'setCell') {
    if (patch.value) content.cells[patch.cell] = patch.value;
    else delete content.cells[patch.cell];
    assert(
      Object.keys(content.cells).length <= 2_000,
      422,
      'VALIDATION_FAILED',
      'The sheet is full',
    );
  } else if (patch.action === 'setCellStyle') {
    content.styles ||= {};
    content.styles[patch.cell] = {
      ...(content.styles[patch.cell] || {}),
      [patch.field]: patch.value,
    };
    assert(
      Object.keys(content.styles).length <= 2_000,
      422,
      'VALIDATION_FAILED',
      'The sheet is full',
    );
  } else if (patch.action === 'addPage') {
    assert(
      content.pages.length < 100,
      422,
      'VALIDATION_FAILED',
      'A notebook can have at most 100 pages',
    );
    assert(
      !content.pages.some((item) => item.id === patch.pageId),
      409,
      'REVISION_CONFLICT',
      'This page already exists',
    );
    content.pages.push({
      id: patch.pageId,
      title: 'Untitled page',
      body: '',
      font: 'Aptos',
      size: 17,
    });
  } else if (patch.action === 'deletePage') {
    assert(content.pages.length > 1, 422, 'VALIDATION_FAILED', 'Keep at least one page');
    const index = content.pages.findIndex((item) => item.id === patch.pageId);
    assert(index >= 0, 409, 'REVISION_CONFLICT', 'This page was already removed');
    assert(
      Object.entries(fields).every(
        ([field, changed]) => !field.startsWith(`page:${patch.pageId}:`) || changed <= baseRevision,
      ),
      409,
      'REVISION_CONFLICT',
      'This page changed. Review it before removing it.',
    );
    content.pages.splice(index, 1);
  } else if (patch.action === 'setPage') {
    const page = content.pages.find((item) => item.id === patch.pageId);
    assert(page, 409, 'REVISION_CONFLICT', 'This page was removed. Review the latest version.');
    page[patch.field] = patch.value;
  }
  assert(
    Buffer.byteLength(JSON.stringify(content), 'utf8') <= MAX_FILE_BYTES,
    413,
    'PAYLOAD_TOO_LARGE',
    'File exceeds 256 KiB',
  );
  fields[key] = file.revision + 1;
  return { ...file, content, fieldRevisions: fields, revision: file.revision + 1 };
}

export function createFileService(db, client, auth, rooms, queue, publish = () => {}) {
  const files = db.collection('files');
  const operations = db.collection('fileOperations');
  const versions = db.collection('fileVersions');
  const assignments = db.collection('fileAssignments');
  const memberships = db.collection('memberships');
  const users = db.collection('users');

  function versionShape(row, authorName = 'Former member', includeContent = false) {
    return { revision: row.revision, authorId: row.authorId.toString(), authorName, kind: row.kind,
      createdAt: row.createdAt.toISOString(), restoredFromRevision: row.restoredFromRevision ?? null,
      ...(includeContent ? { title: row.title, content: row.content } : {}) };
  }

  async function ensureCurrentSnapshot(file) {
    const exists = await versions.findOne({ fileId: file._id, revision: file.revision }, { projection: { _id: 1 } });
    if (!exists) {
      try {
        await versions.updateOne({ fileId: file._id, revision: file.revision }, { $setOnInsert: {
          fileId: file._id, roomId: file.roomId, revision: file.revision, title: file.title,
          content: file.content, authorId: file.updatedBy, operationId: randomUUID(), kind: 'baseline',
          restoredFromRevision: null, createdAt: file.updatedAt,
        } }, { upsert: true });
      } catch (failure) { if (failure?.code !== 11000) throw failure; }
    }
  }

  function workAreas(file) {
    if (file.type === 'document') return [{ id: 'document', label: 'Document' }];
    if (file.type === 'code') return [{ id: 'code', label: 'Code' }];
    if (file.type === 'sheet') return [{ id: 'spreadsheet', label: 'Spreadsheet' }];
    if (file.type === 'slides') return (file.content.slides || []).map((slide) => ({ id: `slide:${slide.id}`, label: slide.title?.trim() || 'Untitled slide' }));
    return (file.content.pages || []).map((page) => ({ id: `page:${page.id}`, label: page.title?.trim() || 'Untitled page' }));
  }

  async function listMine(userId) {
    const memberRows = await memberships
      .find({ userId: objectId(userId.toString()), kind: 'file' }, { projection: { roomId: 1 } })
      .limit(500)
      .toArray();
    const roomIds = memberRows.map((member) => member.roomId);
    if (!roomIds.length) return { items: [] };
    const rows = await files
      .find({ roomId: { $in: roomIds } }, { projection: { content: 0, fieldRevisions: 0 } })
      .sort({ updatedAt: -1 })
      .limit(500)
      .toArray();
    return { items: rows.map(fileSummary) };
  }

  async function list(userId, roomId) {
    const room = await rooms.access(userId, roomId);
    const rows = await files
      .find({ roomId: room._id }, { projection: { content: 0, fieldRevisions: 0 } })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(100)
      .toArray();
    return { items: rows.map(fileSummary) };
  }

  async function get(userId, roomId, fileId) {
    const room = await rooms.access(userId, roomId);
    const file = await files.findOne({ _id: objectId(fileId), roomId: room._id });
    assert(file, 404, 'NOT_FOUND', 'File not found');
    return { file: fileShape(file) };
  }

  async function create(token, roomId, payload) {
    object(payload, ['type', 'title']);
    assert(
      TYPES.has(payload.type),
      422,
      'VALIDATION_FAILED',
      'Choose a document, notebook, presentation, spreadsheet, or code file',
    );
    const title = string(payload.title, 'File name', 1, 80);
    const id = objectId(roomId);
    return queue.run(id.toString(), async () => {
      const actor = await auth.authenticate(token);
      const file = await transaction(client, async (session) => {
        await rooms.access(actor.user._id, id, false, session);
        const count = await files.countDocuments({ roomId: id }, { session });
        assert(count < 50, 422, 'VALIDATION_FAILED', 'A room can have at most 50 files');
        const now = new Date();
        const next = {
          _id: new ObjectId(),
          roomId: id,
          type: payload.type,
          title,
          content: initialFileContent(payload.type),
          revision: 0,
          fieldRevisions: {},
          createdBy: actor.user._id,
          updatedBy: actor.user._id,
          createdAt: now,
          updatedAt: now,
        };
        await files.insertOne(next, { session });
        await versions.insertOne({ fileId: next._id, roomId: id, revision: 0, title: next.title,
          content: next.content, authorId: actor.user._id, operationId: randomUUID(), kind: 'initial',
          restoredFromRevision: null, createdAt: now }, { session });
        return next;
      });
      publish('file:created', { roomId: id.toString(), file: fileSummary(file) });
      return { file: fileShape(file) };
    });
  }

  async function update(token, roomId, fileId, payload) {
    object(payload, ['operationId', 'baseRevision', 'patch']);
    const room = objectId(roomId);
    const fileObjectId = objectId(fileId);
    const op = operationId(payload.operationId);
    const base = revision(payload.baseRevision);
    return queue.run(room.toString(), async () => {
      const actor = await auth.authenticate(token);
      const result = await transaction(client, async (session) => {
        await rooms.access(actor.user._id, room, false, session);
        const current = await files.findOne({ _id: fileObjectId, roomId: room }, { session });
        assert(current, 404, 'NOT_FOUND', 'File not found');
        const patch = validatePatch(current.type, payload.patch);
        const hash = createHash('sha256').update(JSON.stringify({ base, patch })).digest('hex');
        const existing = await operations.findOne(
          { fileId: fileObjectId, operationId: op },
          { session },
        );
        if (existing) {
          assert(
            existing.authorId.equals(actor.user._id) && existing.requestHash === hash,
            409,
            'OPERATION_ID_REUSED',
            'This change ID was already used',
          );
          return { file: current, committedNow: false };
        }
        assert(base <= current.revision, 400, 'INVALID_REQUEST', 'Invalid base revision');
        const next = applyFilePatch(current, patch, base);
        next.updatedBy = actor.user._id;
        next.updatedAt = new Date();
        const updated = await files.updateOne(
          { _id: fileObjectId, roomId: room, revision: current.revision },
          {
            $set: {
              title: next.title,
              content: next.content,
              fieldRevisions: next.fieldRevisions,
              revision: next.revision,
              updatedBy: next.updatedBy,
              updatedAt: next.updatedAt,
            },
          },
          { session },
        );
        assert(
          updated.matchedCount === 1,
          409,
          'REVISION_CONFLICT',
          'The file changed. Review the latest version.',
        );
        await operations.insertOne(
          {
            fileId: fileObjectId,
            roomId: room,
            operationId: op,
            authorId: actor.user._id,
            requestHash: hash,
            revision: next.revision,
            patch,
            createdAt: next.updatedAt,
          },
          { session },
        );
        await versions.insertOne({ fileId: fileObjectId, roomId: room, revision: next.revision,
          title: next.title, content: next.content, authorId: actor.user._id, operationId: op,
          kind: 'edit', restoredFromRevision: null, createdAt: next.updatedAt }, { session });
        return { file: next, committedNow: true };
      });
      const file = fileShape(result.file);
      if (result.committedNow) publish('file:updated', { roomId: room.toString(), file });
      return { file };
    });
  }

  async function history(userId, roomId, fileId, query = {}) {
    const room = await rooms.access(userId, roomId);
    const id = objectId(fileId);
    const file = await files.findOne({ _id: id, roomId: room._id });
    assert(file, 404, 'NOT_FOUND', 'File not found');
    await ensureCurrentSnapshot(file);
    const max = limit(query.limit);
    const before = beforeRevision(query.beforeRevision);
    const rows = await versions.find({ fileId: id, ...(before === undefined ? {} : { revision: { $lt: before } }) },
      { projection: { revision: 1, authorId: 1, kind: 1, createdAt: 1, restoredFromRevision: 1 } })
      .sort({ revision: -1 }).limit(max + 1).toArray();
    const page = rows.slice(0, max);
    const authors = await users.find({ _id: { $in: page.map((row) => row.authorId) } }, { projection: { name: 1 } }).toArray();
    const names = new Map(authors.map((row) => [row._id.toString(), row.name]));
    return { items: page.map((row) => versionShape(row, names.get(row.authorId.toString()) || 'Former member')),
      nextBeforeRevision: rows.length > max ? page.at(-1).revision : null };
  }

  async function version(userId, roomId, fileId, selectedRevision) {
    const room = await rooms.access(userId, roomId);
    const row = await versions.findOne({ fileId: objectId(fileId), roomId: room._id, revision: revision(selectedRevision) });
    assert(row, 404, 'NOT_FOUND', 'Version not found');
    const author = await users.findOne({ _id: row.authorId }, { projection: { name: 1 } });
    return { version: versionShape(row, author?.name || 'Former member', true) };
  }

  async function restore(token, roomId, fileId, selectedRevision, payload) {
    object(payload, ['operationId', 'expectedRevision']);
    const room = objectId(roomId), fileIdValue = objectId(fileId), sourceRevision = revision(selectedRevision);
    const op = operationId(payload.operationId), expected = revision(payload.expectedRevision);
    const requestHash = createHash('sha256').update(JSON.stringify({ kind: 'restore', sourceRevision, expected })).digest('hex');
    return queue.run(room.toString(), async () => {
      const actor = await auth.authenticate(token);
      await rooms.access(actor.user._id, room, true);
      const result = await transaction(client, async (session) => {
        await rooms.access(actor.user._id, room, true, session);
        const current = await files.findOne({ _id: fileIdValue, roomId: room }, { session });
        assert(current, 404, 'NOT_FOUND', 'File not found');
        const prior = await operations.findOne({ fileId: fileIdValue, operationId: op }, { session });
        if (prior) {
          assert(prior.authorId.equals(actor.user._id) && prior.requestHash === requestHash, 409, 'OPERATION_ID_REUSED', 'This change ID was already used');
          return { file: current, committedNow: false };
        }
        assert(current.revision === expected, 409, 'REVISION_CONFLICT', 'The file changed. Refresh before restoring.');
        const source = await versions.findOne({ fileId: fileIdValue, roomId: room, revision: sourceRevision }, { session });
        assert(source, 404, 'NOT_FOUND', 'Version not found');
        const now = new Date(), nextRevision = current.revision + 1;
        const next = { ...current, title: source.title, content: source.content, revision: nextRevision,
          fieldRevisions: { ...(current.fieldRevisions || {}), '*': nextRevision }, updatedBy: actor.user._id, updatedAt: now };
        const updated = await files.updateOne({ _id: fileIdValue, roomId: room, revision: current.revision },
          { $set: { title: next.title, content: next.content, revision: next.revision,
            fieldRevisions: next.fieldRevisions, updatedBy: next.updatedBy, updatedAt: now } }, { session });
        assert(updated.matchedCount === 1, 409, 'REVISION_CONFLICT', 'The file changed. Refresh before restoring.');
        await operations.insertOne({ fileId: fileIdValue, roomId: room, operationId: op, authorId: actor.user._id,
          requestHash, revision: nextRevision, patch: { action: 'restore', sourceRevision }, createdAt: now }, { session });
        await versions.insertOne({ fileId: fileIdValue, roomId: room, revision: nextRevision, title: next.title,
          content: next.content, authorId: actor.user._id, operationId: op, kind: 'restore',
          restoredFromRevision: sourceRevision, createdAt: now }, { session });
        return { file: next, committedNow: true };
      });
      const file = fileShape(result.file);
      if (result.committedNow) publish('file:updated', { roomId: room.toString(), file });
      return { file };
    });
  }

  async function contributions(userId, roomId, fileId) {
    const room = await rooms.access(userId, roomId), id = objectId(fileId);
    const file = await files.findOne({ _id: id, roomId: room._id });
    assert(file, 404, 'NOT_FOUND', 'File not found');
    const [memberRows, activityRows, assignedRows] = await Promise.all([
      memberships.find({ roomId: room._id }, { projection: { userId: 1 } }).limit(100).toArray(),
      operations.aggregate([
        { $match: { fileId: id, 'patch.action': { $ne: 'restore' } } },
        { $project: { authorId: 1, areaId: file.type === 'document' ? 'document' : file.type === 'sheet' ? 'spreadsheet' : file.type === 'code' ? 'code' : file.type === 'slides'
          ? { $concat: ['slide:', { $ifNull: ['$patch.slideId', ''] }] }
          : { $concat: ['page:', { $ifNull: ['$patch.pageId', ''] }] } } },
        { $group: { _id: { authorId: '$authorId', areaId: '$areaId' }, edits: { $sum: 1 } } },
      ]).toArray(),
      assignments.find({ fileId: id }).toArray(),
    ]);
    const memberIds = memberRows.map((row) => row.userId);
    const memberUsers = await users.find({ _id: { $in: memberIds } }, { projection: { name: 1 } }).toArray();
    const members = memberUsers.map((member) => ({ id: member._id.toString(), name: member.name }));
    const memberSet = new Set(members.map((member) => member.id));
    const areaMap = new Map(workAreas(file).map((area) => [area.id, { ...area, assigneeId: null, edits: 0, contributors: {} }]));
    for (const row of assignedRows) if (areaMap.has(row.areaId) && memberSet.has(row.assigneeId?.toString())) areaMap.get(row.areaId).assigneeId = row.assigneeId.toString();
    const people = new Map(members.map((member) => [member.id, member.name]));
    const totals = new Map();
    for (const row of activityRows) {
      const areaId = row._id.areaId;
      const area = areaMap.get(areaId);
      if (!area) continue;
      const authorId = row._id.authorId.toString();
      area.edits += row.edits;
      area.contributors[authorId] = (area.contributors[authorId] || 0) + row.edits;
      totals.set(authorId, (totals.get(authorId) || 0) + row.edits);
    }
    return { members, areas: [...areaMap.values()].map(({ contributors, ...area }) => ({ ...area,
      contributors: Object.entries(contributors).map(([id, edits]) => ({ id, name: people.get(id) || 'Former member', edits })).sort((a, b) => b.edits - a.edits) })),
      contributors: [...totals].map(([id, edits]) => ({ id, name: people.get(id) || 'Former member', edits })).sort((a, b) => b.edits - a.edits) };
  }

  async function assign(token, roomId, fileId, payload) {
    object(payload, ['areaId', 'assigneeId']);
    const id = objectId(roomId), fileObjectId = objectId(fileId);
    const areaId = string(payload.areaId, 'Work area', 1, 100);
    assert(payload.assigneeId === null || typeof payload.assigneeId === 'string', 422, 'VALIDATION_FAILED', 'Choose a teammate');
    const actor = await auth.authenticate(token);
    const room = await rooms.access(actor.user._id, id);
    const file = await files.findOne({ _id: fileObjectId, roomId: room._id });
    assert(file, 404, 'NOT_FOUND', 'File not found');
    assert(workAreas(file).some((area) => area.id === areaId), 404, 'NOT_FOUND', 'Work area no longer exists');
    const assigneeId = payload.assigneeId === null ? null : objectId(payload.assigneeId);
    if (assigneeId) {
      const member = await memberships.findOne({ roomId: room._id, userId: assigneeId });
      assert(member, 404, 'NOT_FOUND', 'Teammate is not a member of this room');
    }
    if (assigneeId) await assignments.updateOne({ fileId: fileObjectId, areaId }, { $set: { roomId: room._id, assigneeId, assignedBy: actor.user._id, updatedAt: new Date() } }, { upsert: true });
    else await assignments.deleteOne({ fileId: fileObjectId, areaId });
    return contributions(actor.user._id, id.toString(), fileObjectId.toString());
  }

  return { listMine, list, get, create, update, history, version, restore, contributions, assign };
}
