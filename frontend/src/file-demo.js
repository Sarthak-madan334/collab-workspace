import { DEMO_USER, demoRoom } from './demo.js';

const STORAGE_KEY = 'synkro.demo.files.v1';
const HISTORY_KEY = 'synkro.demo.file-history.v1';
const CODE_STARTERS = {
  python: 'print("Hello from Synkro!")\n',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello from Synkro!" << std::endl;\n    return 0;\n}\n',
};
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};
const write = (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value));

export function demoFileList(roomId) {
  return Object.values(read())
    .filter((file) => file.roomId === roomId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ content: _content, fieldRevisions: _fields, ...summary }) => summary);
}
export function demoFileListMine() {
  return Object.values(read())
    .filter((file) => Boolean(demoRoom(file.roomId)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ content: _content, fieldRevisions: _fields, ...summary }) => summary);
}

export function demoFileCreate(roomId, type, title) {
  if (!demoRoom(roomId)) throw new Error('Room not found.');
  const now = new Date().toISOString();
  const file = {
    id: crypto.randomUUID(),
    roomId,
    type,
    title: title.trim(),
    revision: 0,
    fieldRevisions: {},
    content:
      type === 'document'
        ? { body: '', format: { font: 'Aptos', size: 16, align: 'left' } }
        : type === 'slides'
          ? {
              slides: [
                {
                  id: crypto.randomUUID(),
                  title: 'Untitled slide',
                  body: '',
                  theme: 'paper',
                  notes: '',
                },
              ],
            }
          : type === 'notebook'
            ? {
                pages: [
                  {
                    id: crypto.randomUUID(),
                    title: 'Untitled page',
                    body: '',
                    font: 'Aptos',
                    size: 17,
                  },
                ],
              }
            : type === 'code'
              ? { language: 'python', sources: { ...CODE_STARTERS }, stdin: '' }
              : { cells: {}, styles: {} },
    createdAt: now,
    updatedAt: now,
    updatedBy: DEMO_USER.id,
  };
  if (
    !['document', 'slides', 'sheet', 'notebook', 'code'].includes(type) ||
    !file.title ||
    file.title.length > 80
  )
    throw new Error('Choose a type and a name up to 80 characters.');
  const files = read();
  if (Object.values(files).filter((item) => item.roomId === roomId).length >= 50)
    throw new Error('This room already has 50 files.');
  write({ ...files, [file.id]: file });
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
  localStorage.setItem(HISTORY_KEY, JSON.stringify({ ...history, [file.id]: [{ revision: 0, title: file.title, content: file.content, authorId: DEMO_USER.id, authorName: DEMO_USER.name, kind: 'initial', createdAt: now }] }));
  const { fieldRevisions: _fields, ...publicFile } = file;
  return { file: publicFile };
}

export function demoFileGet(roomId, fileId) {
  const file = read()[fileId];
  if (!file || file.roomId !== roomId) throw new Error('File not found.');
  const { fieldRevisions: _fields, ...publicFile } = file;
  return { file: publicFile };
}

export function demoFileUpdate(roomId, fileId, { baseRevision, patch }) {
  const files = read();
  const file = files[fileId];
  if (!file || file.roomId !== roomId) throw new Error('File not found.');
  const key =
    patch.action === 'rename'
      ? 'title'
      : patch.action === 'setBody'
        ? 'document:body'
        : patch.action === 'setCode'
          ? `code:source:${patch.language}`
          : patch.action === 'setCodeLanguage'
            ? 'code:language'
            : patch.action === 'setCodeStdin'
              ? 'code:stdin'
              : patch.action === 'setFormat'
                ? `document:format:${patch.field}`
                : patch.action === 'setSlide'
                  ? `slide:${patch.slideId}:${patch.field}`
                  : patch.action === 'setPage'
                    ? `page:${patch.pageId}:${patch.field}`
                    : patch.action === 'setCell'
                      ? `cell:${patch.cell}`
                      : patch.action === 'setCellStyle'
                        ? `cellstyle:${patch.cell}:${patch.field}`
                        : patch.action === 'addPage' || patch.action === 'deletePage'
                          ? 'pages:list'
                          : 'slides:list';
  if ((file.fieldRevisions?.[key] || 0) > baseRevision) {
    const conflict = new Error('This part of the file changed. Review the latest version.');
    conflict.code = 'REVISION_CONFLICT';
    throw conflict;
  }
  const content = structuredClone(file.content);
  let title = file.title;
  if (patch.action === 'rename') title = patch.value.trim();
  else if (patch.action === 'setBody') content.body = patch.value;
  else if (patch.action === 'setCode') content.sources[patch.language] = patch.value;
  else if (patch.action === 'setCodeLanguage') content.language = patch.language;
  else if (patch.action === 'setCodeStdin') content.stdin = patch.value;
  else if (patch.action === 'setFormat') {
    content.format ||= {};
    content.format[patch.field] = patch.value;
  } else if (patch.action === 'setSlide') {
    const slide = content.slides.find((item) => item.id === patch.slideId);
    if (!slide) throw new Error('Slide not found.');
    slide[patch.field] = patch.value;
  } else if (patch.action === 'setPage') {
    const page = content.pages.find((item) => item.id === patch.pageId);
    if (!page) throw new Error('Page not found.');
    page[patch.field] = patch.value;
  } else if (patch.action === 'addPage')
    content.pages.push({
      id: patch.pageId,
      title: 'Untitled page',
      body: '',
      font: 'Aptos',
      size: 17,
    });
  else if (patch.action === 'deletePage')
    content.pages = content.pages.filter((item) => item.id !== patch.pageId);
  else if (patch.action === 'addSlide')
    content.slides.push({
      id: patch.slideId,
      title: 'Untitled slide',
      body: '',
      theme: 'paper',
      notes: '',
    });
  else if (patch.action === 'duplicateSlide') {
    const index = content.slides.findIndex((slide) => slide.id === patch.sourceId);
    if (index < 0) throw new Error('Slide not found.');
    content.slides.splice(index + 1, 0, { ...content.slides[index], id: patch.slideId });
  } else if (patch.action === 'moveSlide') {
    const index = content.slides.findIndex((slide) => slide.id === patch.slideId);
    if (index < 0 || patch.toIndex < 0 || patch.toIndex >= content.slides.length)
      throw new Error('Slide not found.');
    content.slides.splice(patch.toIndex, 0, content.slides.splice(index, 1)[0]);
  } else if (patch.action === 'deleteSlide')
    content.slides = content.slides.filter((item) => item.id !== patch.slideId);
  else if (patch.action === 'setCell') {
    if (patch.value) content.cells[patch.cell] = patch.value;
    else delete content.cells[patch.cell];
  } else if (patch.action === 'setCellStyle') {
    content.styles ||= {};
    content.styles[patch.cell] = {
      ...(content.styles[patch.cell] || {}),
      [patch.field]: patch.value,
    };
  } else throw new Error('Unsupported change.');
  const next = {
    ...file,
    title,
    content,
    fieldRevisions: { ...file.fieldRevisions, [key]: file.revision + 1 },
    revision: file.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: DEMO_USER.id,
  };
  write({ ...files, [fileId]: next });
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
  const snapshots = history[fileId] || [];
  if (!snapshots.some((item) => item.revision === next.revision)) {
    snapshots.push({ revision: next.revision, title: next.title, content: next.content, authorId: DEMO_USER.id, authorName: DEMO_USER.name, kind: 'edit', createdAt: next.updatedAt });
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ ...history, [fileId]: snapshots }));
  }
  const { fieldRevisions: _fields, ...publicFile } = next;
  return { file: publicFile };
}

export function demoFileHistory(roomId, fileId) {
  const file = read()[fileId];
  if (!file || file.roomId !== roomId) throw new Error('File not found.');
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
  let snapshots = history[fileId];
  if (!snapshots?.length) {
    snapshots = [{ revision: file.revision, title: file.title, content: file.content, authorId: DEMO_USER.id, authorName: DEMO_USER.name, kind: 'baseline', createdAt: file.updatedAt }];
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ ...history, [fileId]: snapshots }));
  }
  return { items: snapshots.slice().sort((a, b) => b.revision - a.revision).map(({ content: _content, title: _title, ...row }) => row) };
}

export function demoFileVersion(roomId, fileId, revision) {
  demoFileHistory(roomId, fileId);
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
  const version = history[fileId]?.find((item) => Number(item.revision) === Number(revision));
  if (!version) throw new Error('Version not found.');
  return { version };
}

export function demoFileRestore(roomId, fileId, revision, _operationId, expectedRevision) {
  const { version } = demoFileVersion(roomId, fileId, revision);
  const files = read(), file = files[fileId];
  if (Number(file.revision) !== Number(expectedRevision)) { const failure = new Error('The file changed. Refresh before restoring.'); failure.status = 409; failure.code = 'REVISION_CONFLICT'; throw failure; }
  const now = new Date().toISOString();
  const next = { ...file, title: version.title, content: structuredClone(version.content), revision: file.revision + 1, updatedAt: now, updatedBy: DEMO_USER.id, fieldRevisions: { ...(file.fieldRevisions || {}), '*': file.revision + 1 } };
  write({ ...files, [fileId]: next });
  const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
  const snapshots = [...(history[fileId] || []), { revision: next.revision, title: next.title, content: next.content, authorId: DEMO_USER.id, authorName: DEMO_USER.name, kind: 'restore', restoredFromRevision: Number(revision), createdAt: now }];
  localStorage.setItem(HISTORY_KEY, JSON.stringify({ ...history, [fileId]: snapshots }));
  const { fieldRevisions: _fields, ...publicFile } = next;
  return { file: publicFile };
}

export function demoFileContributions(roomId, fileId) {
  const { items } = demoFileHistory(roomId, fileId);
  const file = read()[fileId];
  const areas = file.type === 'slides' ? (file.content.slides || []).map((slide) => ({ id: `slide:${slide.id}`, label: slide.title || 'Untitled slide' })) : file.type === 'notebook' ? (file.content.pages || []).map((page) => ({ id: `page:${page.id}`, label: page.title || 'Untitled page' })) : [{ id: file.type === 'document' ? 'document' : file.type === 'code' ? 'code' : 'spreadsheet', label: file.type === 'document' ? 'Document' : file.type === 'code' ? 'Code' : 'Spreadsheet' }];
  const snapshots = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}')[fileId] || [];
  const assignments = JSON.parse(localStorage.getItem('synkro.demo.file-assignments.v1') || '{}')[fileId] || {};
  const statuses = JSON.parse(localStorage.getItem('synkro.demo.file-area-status.v1') || '{}')[fileId] || {};
  const editCount = snapshots.filter((row) => row.kind !== 'initial').length;
  const areasWithEdits = areas.map((area) => ({ ...area, assigneeId: assignments[area.id] || null, status: statuses[area.id] || 'todo', edits: editCount, contributors: editCount ? [{ id: DEMO_USER.id, name: DEMO_USER.name, edits: editCount }] : [] }));
  return { members: [{ id: DEMO_USER.id, name: DEMO_USER.name }], areas: areasWithEdits, contributors: [{ id: DEMO_USER.id, name: DEMO_USER.name, edits: snapshots.filter((row) => row.kind !== 'initial').length }] };
}

export function demoFileAssign(roomId, fileId, areaId, assigneeId) {
  const data = demoFileContributions(roomId, fileId);
  const files = read(), file = files[fileId];
  if (!data.areas.some((area) => area.id === areaId)) throw new Error('Work area no longer exists.');
  const assignments = JSON.parse(localStorage.getItem('synkro.demo.file-assignments.v1') || '{}');
  assignments[fileId] ||= {};
  assignments[fileId][areaId] = assigneeId;
  localStorage.setItem('synkro.demo.file-assignments.v1', JSON.stringify(assignments));
  data.areas = data.areas.map((area) => ({ ...area, assigneeId: assignments[fileId][area.id] || null }));
  return data;
}

export function demoFileSetAreaStatus(roomId, fileId, areaId, status) {
  const data = demoFileContributions(roomId, fileId);
  if (!data.areas.some((area) => area.id === areaId)) throw new Error('Work area no longer exists.');
  if (!['todo', 'in_progress', 'done'].includes(status)) throw new Error('Choose To do, In progress, or Done.');
  const statuses = JSON.parse(localStorage.getItem('synkro.demo.file-area-status.v1') || '{}');
  statuses[fileId] ||= {};
  statuses[fileId][areaId] = status;
  localStorage.setItem('synkro.demo.file-area-status.v1', JSON.stringify(statuses));
  data.areas = data.areas.map((area) => ({ ...area, status: statuses[fileId][area.id] || 'todo' }));
  return data;
}
