import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { applyFilePatch, initialFileContent, validatePatch } from '../src/files.js';

const makeFile = (type) => ({
  _id: new ObjectId(),
  roomId: new ObjectId(),
  title: 'Untitled',
  type,
  content: initialFileContent(type),
  fieldRevisions: {},
  revision: 0,
});

test('edits to different sheet cells merge across stale base revisions', () => {
  const file = makeFile('sheet');
  const first = applyFilePatch(file, { action: 'setCell', cell: 'A1', value: '2' }, 0);
  const second = applyFilePatch(first, { action: 'setCell', cell: 'B1', value: '=A1*3' }, 0);
  assert.deepEqual(second.content.cells, { A1: '2', B1: '=A1*3' });
  assert.equal(second.revision, 2);
  assert.throws(() => applyFilePatch(second, { action: 'setCell', cell: 'A1', value: 'lost' }, 0), {
    code: 'REVISION_CONFLICT',
  });
});

test('edits to different slides merge but deleting a changed slide conflicts', () => {
  const file = makeFile('slides');
  const slideId = file.content.slides[0].id;
  const changed = applyFilePatch(
    file,
    { action: 'setSlide', slideId, field: 'title', value: 'Team plan' },
    0,
  );
  const body = applyFilePatch(
    changed,
    { action: 'setSlide', slideId, field: 'body', value: 'Next steps' },
    0,
  );
  assert.equal(body.content.slides[0].title, 'Team plan');
  assert.equal(body.content.slides[0].body, 'Next steps');
  assert.throws(
    () =>
      applyFilePatch(body, { action: 'setSlide', slideId, field: 'title', value: 'Old plan' }, 0),
    { code: 'REVISION_CONFLICT' },
  );
});

test('presentation themes and speaker notes persist with independent revisions', () => {
  const file = makeFile('slides');
  const slideId = file.content.slides[0].id;
  const themed = applyFilePatch(
    file,
    { action: 'setSlide', slideId, field: 'theme', value: 'ocean' },
    0,
  );
  const noted = applyFilePatch(
    themed,
    { action: 'setSlide', slideId, field: 'notes', value: 'Pause for questions.' },
    0,
  );
  assert.equal(noted.content.slides[0].theme, 'ocean');
  assert.equal(noted.content.slides[0].notes, 'Pause for questions.');
  assert.throws(
    () => applyFilePatch(noted, { action: 'setSlide', slideId, field: 'theme', value: 'warm' }, 0),
    { code: 'REVISION_CONFLICT' },
  );
});

test('presentation slides can be duplicated and reordered without changing the source', () => {
  const file = makeFile('slides');
  const sourceId = file.content.slides[0].id;
  const titled = applyFilePatch(
    file,
    { action: 'setSlide', slideId: sourceId, field: 'title', value: 'Overview' },
    0,
  );
  const duplicateId = '2ec371aa-383c-4d41-ab22-d65a3027cbe9';
  const duplicated = applyFilePatch(
    titled,
    { action: 'duplicateSlide', sourceId, slideId: duplicateId },
    1,
  );
  assert.deepEqual(
    duplicated.content.slides.map((slide) => slide.title),
    ['Overview', 'Overview'],
  );
  assert.notEqual(duplicated.content.slides[0].id, duplicated.content.slides[1].id);
  const moved = applyFilePatch(
    duplicated,
    { action: 'moveSlide', slideId: duplicateId, toIndex: 0 },
    2,
  );
  assert.equal(moved.content.slides[0].id, duplicateId);
  assert.equal(file.content.slides.length, 1);
  assert.throws(
    () => applyFilePatch(moved, { action: 'moveSlide', slideId: sourceId, toIndex: 0 }, 1),
    { code: 'REVISION_CONFLICT' },
  );
});

test('document edits preserve the original object and reject stale changes', () => {
  const file = makeFile('document');
  const changed = applyFilePatch(file, { action: 'setBody', value: 'A shared draft' }, 0);
  assert.equal(file.content.body, '');
  assert.equal(changed.content.body, 'A shared draft');
  assert.throws(() => applyFilePatch(changed, { action: 'setBody', value: 'Old draft' }, 0), {
    code: 'REVISION_CONFLICT',
  });
});

test('a restored file revision conflicts with drafts based on any older part revision', () => {
  const file = makeFile('document');
  file.revision = 3;
  file.fieldRevisions = { 'document:body': 1, 'document:format:font': 2, '*': 3 };
  assert.throws(() => applyFilePatch(file, { action: 'setFormat', field: 'font', value: 'Georgia' }, 2), {
    code: 'REVISION_CONFLICT',
  });
  const currentDraft = applyFilePatch(file, { action: 'setFormat', field: 'font', value: 'Georgia' }, 3);
  assert.equal(currentDraft.revision, 4);
});

test('a sheet cannot exceed the stored-file byte limit', () => {
  const file = makeFile('sheet');
  file.content.cells = Object.fromEntries(
    Array.from({ length: 600 }, (_, index) => [
      `${String.fromCharCode(65 + (index % 26))}${Math.floor(index / 26) + 1}`,
      'x'.repeat(500),
    ]),
  );
  assert.throws(() => applyFilePatch(file, { action: 'setCell', cell: 'Z99', value: '1' }, 0), {
    code: 'PAYLOAD_TOO_LARGE',
  });
});

test('notebook pages can be edited independently and a changed page cannot be deleted by a stale request', () => {
  const file = makeFile('notebook');
  const pageId = file.content.pages[0].id;
  const title = applyFilePatch(
    file,
    { action: 'setPage', pageId, field: 'title', value: 'Meeting' },
    0,
  );
  const body = applyFilePatch(
    title,
    { action: 'setPage', pageId, field: 'body', value: 'Decisions' },
    0,
  );
  assert.equal(body.content.pages[0].title, 'Meeting');
  assert.equal(body.content.pages[0].body, 'Decisions');
  const formatted = applyFilePatch(
    body,
    { action: 'setPage', pageId, field: 'font', value: 'Georgia' },
    0,
  );
  assert.equal(formatted.content.pages[0].font, 'Georgia');
  const extra = applyFilePatch(
    formatted,
    { action: 'addPage', pageId: 'dd5e8190-936c-499e-a81d-40079dc3a639' },
    3,
  );
  assert.throws(() => applyFilePatch(extra, { action: 'deletePage', pageId }, 0), {
    code: 'REVISION_CONFLICT',
  });
});

test('document formatting and cell formatting merge with edits to other fields', () => {
  const doc = makeFile('document');
  const text = applyFilePatch(doc, { action: 'setBody', value: 'Plan' }, 0);
  const font = applyFilePatch(text, { action: 'setFormat', field: 'font', value: 'Georgia' }, 0);
  assert.equal(font.content.format.font, 'Georgia');
  const sheet = makeFile('sheet');
  const value = applyFilePatch(sheet, { action: 'setCell', cell: 'A1', value: '12' }, 0);
  const formatted = applyFilePatch(
    value,
    { action: 'setCellStyle', cell: 'A1', field: 'bold', value: true },
    0,
  );
  assert.deepEqual(formatted.content.styles.A1, { bold: true });
});

test('code files keep Python and C++ drafts independently and reject stale edits to the same language', () => {
  const file = makeFile('code');
  const python = applyFilePatch(file, { action: 'setCode', language: 'python', value: 'print(2 + 2)' }, 0);
  const cpp = applyFilePatch(python, { action: 'setCode', language: 'cpp', value: '#include <iostream>' }, 0);
  assert.equal(cpp.content.sources.python, 'print(2 + 2)');
  assert.equal(cpp.content.sources.cpp, '#include <iostream>');
  assert.throws(() => applyFilePatch(cpp, { action: 'setCode', language: 'python', value: 'print(0)' }, 0), {
    code: 'REVISION_CONFLICT',
  });
  const selected = applyFilePatch(cpp, { action: 'setCodeLanguage', language: 'cpp' }, 0);
  assert.equal(selected.content.language, 'cpp');
  const withInput = applyFilePatch(selected, { action: 'setCodeStdin', value: 'hello' }, 1);
  assert.equal(withInput.content.stdin, 'hello');
});

test('code drafts are bounded by UTF-8 size', () => {
  assert.throws(() => validatePatch('code', { action: 'setCode', language: 'python', value: 'é'.repeat(40_000) }), {
    code: 'PAYLOAD_TOO_LARGE',
  });
  assert.throws(() => validatePatch('code', { action: 'setCodeLanguage', language: 'rust' }), {
    code: 'VALIDATION_FAILED',
  });
});
