import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { assert } from './errors.js';
import { transaction } from './db.js';
import { object, objectId, operationId, revision, string } from './validation.js';

const TYPES = new Set(['document', 'slides', 'sheet', 'notebook']);
const MAX_FILE_BYTES = 256 * 1024;
const cellPattern = /^[A-Z](?:[1-9]|[1-9]\d|100)$/;

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
  return { cells: {}, styles: {} };
}

function validatePatch(type, patch) {
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
  if (patch.action === 'setFormat') key = `document:format:${patch.field}`;
  if (patch.action === 'setSlide') key = `slide:${patch.slideId}:${patch.field}`;
  if (['addSlide', 'deleteSlide', 'duplicateSlide', 'moveSlide'].includes(patch.action))
    key = 'slides:list';
  if (patch.action === 'setCell') key = `cell:${patch.cell}`;
  if (patch.action === 'setCellStyle') key = `cellstyle:${patch.cell}:${patch.field}`;
  if (patch.action === 'setPage') key = `page:${patch.pageId}:${patch.field}`;
  if (patch.action === 'addPage' || patch.action === 'deletePage') key = 'pages:list';
  assert(
    (fields[key] || 0) <= baseRevision,
    409,
    'REVISION_CONFLICT',
    'This part of the file changed. Review the latest version.',
  );

  if (patch.action === 'rename') file.title = patch.value;
  else if (patch.action === 'setBody') content.body = patch.value;
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
  const memberships = db.collection('memberships');

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
      'Choose a document, notebook, presentation, or sheet',
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
        return { file: next, committedNow: true };
      });
      const file = fileShape(result.file);
      if (result.committedNow) publish('file:updated', { roomId: room.toString(), file });
      return { file };
    });
  }

  return { listMine, list, get, create, update };
}
