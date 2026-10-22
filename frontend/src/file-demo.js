import { DEMO_USER, demoRoom } from './demo.js';

const STORAGE_KEY = 'synkro.demo.files.v1';
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
    .filter((file) => demoRoom(file.roomId)?.kind === 'file')
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
            : { cells: {}, styles: {} },
    createdAt: now,
    updatedAt: now,
    updatedBy: DEMO_USER.id,
  };
  if (
    !['document', 'slides', 'sheet', 'notebook'].includes(type) ||
    !file.title ||
    file.title.length > 80
  )
    throw new Error('Choose a type and a name up to 80 characters.');
  const files = read();
  if (Object.values(files).filter((item) => item.roomId === roomId).length >= 50)
    throw new Error('This room already has 50 files.');
  write({ ...files, [file.id]: file });
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
  const { fieldRevisions: _fields, ...publicFile } = next;
  return { file: publicFile };
}
