import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Presentation,
  Table2,
  NotebookTabs,
  Plus,
  Play,
  X,
  RefreshCw,
  Users,
  Copy,
} from 'lucide-react';
import { fileApi, roomApi } from './api.js';
import { createWorkspaceSocket, socketAck } from './realtime.js';
import { evaluateCell } from './sheet-formulas.js';
import './workspace-files.css';

const kinds = {
  document: {
    label: 'Document',
    icon: FileText,
    description: 'Write reports and long-form work with your team.',
  },
  notebook: {
    label: 'Notebook',
    icon: NotebookTabs,
    description: 'Keep notes organized in separate pages.',
  },
  slides: {
    label: 'Presentation',
    icon: Presentation,
    description: 'Build and present a visual story slide by slide.',
  },
  sheet: {
    label: 'Spreadsheet',
    icon: Table2,
    description: 'Work with tables, numbers, and formulas.',
  },
};

function useFileEvents(token, roomId, onEvent) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  useEffect(() => {
    if (!token || !roomId) return undefined;
    const socket = createWorkspaceSocket(token);
    const join = () => socketAck(socket, 'room:join', { roomId }).catch(() => {});
    const created = (event) => {
      if (event.roomId === roomId) callback.current(event);
    };
    const updated = (event) => {
      if (event.roomId === roomId) callback.current(event);
    };
    socket.on('connect', join);
    socket.on('file:created', created);
    socket.on('file:updated', updated);
    socket.connect();
    return () => {
      socket.emit('room:leave', { roomId });
      socket.disconnect();
    };
  }, [token, roomId]);
}

export function StudioHome({ token }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [type, setType] = useState(null);
  const [title, setTitle] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(
    () =>
      fileApi
        .listMine(token)
        .then(({ items: rows }) => setItems(rows))
        .catch((failure) => setError(failure.message)),
    [token],
  );
  useEffect(() => {
    refresh();
  }, [refresh]);
  const create = async (event) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { room } = await roomApi.create(token, title.trim(), 'file');
      const { file } = await fileApi.create(token, room.id, type, title.trim());
      navigate(`/studio/${room.id}/${file.id}`);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };
  const join = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { room } = await roomApi.join(token, inviteCode.trim());
      if (room.kind !== 'file') {
        navigate(`/rooms/${room.id}`);
        return;
      }
      const { items: roomFiles } = await fileApi.list(token, room.id);
      if (!roomFiles.length) throw new Error('This file is not ready yet. Try again shortly.');
      navigate(`/studio/${room.id}/${roomFiles[0].id}`);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };
  return (
    <main className="wf-page">
      <div className="wf-heading">
        <div>
          <span className="section-kicker">CREATE · INVITE · COLLABORATE</span>
          <h1>Your files</h1>
          <p>Choose a format to start. Every file has its own space for collaborators.</p>
        </div>
        <span className="wf-count">{items.length} files</span>
      </div>
      {error && (
        <p className="wf-error" role="alert">
          {error}
        </p>
      )}
      <div className="wf-types">
        {Object.entries(kinds).map(([key, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              type="button"
              className="wf-type glass-panel"
              key={key}
              onClick={() => {
                setType(key);
                setTitle('');
                setError('');
              }}
            >
              <span className="wf-type-icon">
                <Icon size={24} />
              </span>
              <strong>New {meta.label.toLowerCase()}</strong>
              <span>{meta.description}</span>
              <Plus size={18} className="wf-type-plus" />
            </button>
          );
        })}
      </div>
      <form className="wf-join glass-panel" onSubmit={join}>
        <Users size={20} />
        <label htmlFor="wf-invite">Join someone else's file</label>
        <input
          id="wf-invite"
          value={inviteCode}
          onChange={(event) => setInviteCode(event.target.value)}
          placeholder="Paste an invite code"
          required
        />
        <button type="submit" disabled={busy}>
          Join file
        </button>
      </form>
      <div className="wf-section">
        <h2>Recent files</h2>
        <button type="button" className="wf-quiet" onClick={refresh}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>
      {items.length ? (
        <div className="wf-list">
          {items.map((item) => {
            const Icon = kinds[item.type]?.icon || FileText;
            return (
              <Link
                className="wf-row glass-panel"
                to={`/studio/${item.roomId}/${item.id}`}
                key={item.id}
              >
                <span className="wf-row-icon">
                  <Icon size={20} />
                </span>
                <span className="wf-row-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {kinds[item.type]?.label} · Edited {new Date(item.updatedAt).toLocaleString()}
                  </small>
                </span>
                <span className="wf-row-arrow">→</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="wf-empty">
          No files yet. Choose a format above to start creating with your team.
        </p>
      )}
      {type && (
        <div
          className="wf-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setType(null);
          }}
        >
          <form className="wf-modal glass-panel" onSubmit={create}>
            <button
              className="wf-close"
              type="button"
              onClick={() => setType(null)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <span className="section-kicker">NEW {kinds[type].label.toUpperCase()}</span>
            <h2>Give it a name</h2>
            <label htmlFor="wf-new-title">File name</label>
            <input
              id="wf-new-title"
              autoFocus
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={`Untitled ${kinds[type].label.toLowerCase()}`}
              required
            />
            <button className="wf-primary" type="submit" disabled={busy || !title.trim()}>
              {busy ? 'Creating…' : `Create ${kinds[type].label.toLowerCase()}`}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function formatInline(value) {
  return value
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__)/g)
    .map((part, index) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith('__') && part.endsWith('__') ? (
        <u key={index}>{part.slice(2, -2)}</u>
      ) : part.startsWith('*') && part.endsWith('*') ? (
        <em key={index}>{part.slice(1, -1)}</em>
      ) : (
        part
      ),
    );
}

function DocumentEditor({ value, format, onEdit, onCommit, onFormat }) {
  const [preview, setPreview] = useState(false);
  const input = useRef(null);
  const insert = (before, after = before) => {
    const element = input.current;
    if (!element) return;
    const start = element.selectionStart,
      end = element.selectionEnd;
    const selected = value.slice(start, end) || 'text';
    onEdit(value.slice(0, start) + before + selected + after + value.slice(end));
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };
  const styled = {
    fontFamily: `${format?.font || 'Aptos'}, Arial, sans-serif`,
    fontSize: `${format?.size || 16}px`,
    textAlign: format?.align || 'left',
  };
  return (
    <div className="wf-word glass-panel">
      <div className="wf-ribbon-tabs">
        <strong>Document</strong>
        <span>Home</span>
        <button
          type="button"
          onClick={() => {
            onCommit();
            setPreview(!preview);
          }}
        >
          {preview ? 'Edit document' : 'Reading view'}
        </button>
      </div>
      <div className="wf-ribbon" aria-label="Document formatting">
        <select
          aria-label="Font family"
          value={format?.font || 'Aptos'}
          onChange={(event) => onFormat('font', event.target.value)}
        >
          {['Aptos', 'Arial', 'Georgia', 'Times New Roman', 'Courier New'].map((font) => (
            <option key={font}>{font}</option>
          ))}
        </select>
        <select
          aria-label="Font size"
          value={format?.size || 16}
          onChange={(event) => onFormat('size', Number(event.target.value))}
        >
          {[12, 14, 16, 18, 24, 32].map((size) => (
            <option key={size}>{size}</option>
          ))}
        </select>
        <span className="wf-ribbon-divider" />
        <button type="button" title="Bold" onClick={() => insert('**')}>
          B
        </button>
        <button type="button" title="Italic" onClick={() => insert('*')}>
          <i>I</i>
        </button>
        <button type="button" title="Underline" onClick={() => insert('__')}>
          <u>U</u>
        </button>
        <span className="wf-ribbon-divider" />
        <button type="button" onClick={() => insert('# ', '')}>
          Heading
        </button>
        <button type="button" onClick={() => insert('- ', '')}>
          Bullets
        </button>
        <span className="wf-ribbon-divider" />
        <button type="button" onClick={() => onFormat('align', 'left')} aria-label="Align left">
          ☰
        </button>
        <button type="button" onClick={() => onFormat('align', 'center')} aria-label="Align center">
          ≡
        </button>
        <button type="button" onClick={() => onFormat('align', 'right')} aria-label="Align right">
          ☷
        </button>
      </div>
      <div className="wf-word-desk">
        <div className="wf-word-page" style={styled}>
          {preview ? (
            <article className="wf-document-preview">
              {value ? (
                value.split('\n').map((line, index) =>
                  line.startsWith('# ') ? (
                    <h2 key={index}>{formatInline(line.slice(2))}</h2>
                  ) : line.startsWith('- ') ? (
                    <p className="wf-bullet" key={index}>
                      • {formatInline(line.slice(2))}
                    </p>
                  ) : (
                    <p key={index}>{formatInline(line) || '\u00a0'}</p>
                  ),
                )
              ) : (
                <p>Nothing written yet.</p>
              )}
            </article>
          ) : (
            <textarea
              ref={input}
              className="wf-document-input"
              aria-label="Document text"
              value={value}
              onChange={(event) => onEdit(event.target.value)}
              onBlur={onCommit}
              placeholder="Start writing together…"
              spellCheck
              style={styled}
            />
          )}
        </div>
      </div>
      <div className="wf-word-status">
        {value.trim() ? value.trim().split(/\s+/).length : 0} words · Autosaved
      </div>
    </div>
  );
}

function NotebookEditor({ file, read, edit, commit, perform }) {
  const [active, setActive] = useState(null);
  const bodyRef = useRef(null);
  const pages = file.content.pages;
  const current = pages.find((page) => page.id === active) || pages[0];
  const field = (name) => `page:${current.id}:${name}`;
  const insertNote = (text) => {
    const area = bodyRef.current;
    if (!area) return;
    const body = read(field('body'), current.body);
    const start = area.selectionStart;
    const prefix = start > 0 && body[start - 1] !== '\n' ? '\n' : '';
    edit(field('body'), body.slice(0, start) + prefix + text + body.slice(area.selectionEnd), {
      action: 'setPage',
      pageId: current.id,
      field: 'body',
    });
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(
        start + prefix.length + text.length,
        start + prefix.length + text.length,
      );
    });
  };
  return (
    <div className="wf-notebook">
      <aside className="wf-notebook-nav">
        <div className="wf-notebook-nav-top">
          <strong>Pages</strong>
          <button
            type="button"
            onClick={() => perform({ action: 'addPage', pageId: crypto.randomUUID() })}
            disabled={pages.length >= 100}
            aria-label="Add notebook page"
          >
            <Plus size={17} />
          </button>
        </div>
        {pages.map((page) => (
          <button
            type="button"
            key={page.id}
            className={`wf-notebook-page${page.id === current.id ? ' active' : ''}`}
            onClick={() => setActive(page.id)}
          >
            {page.title || 'Untitled page'}
          </button>
        ))}
      </aside>
      <section className="wf-notebook-paper">
        <div className="wf-notebook-tools">
          <span>NOTEBOOK · PAGE {pages.indexOf(current) + 1}</span>
          <button
            type="button"
            onClick={() => {
              if (confirm('Delete this page?'))
                perform({ action: 'deletePage', pageId: current.id });
            }}
            disabled={pages.length === 1}
          >
            Delete page
          </button>
        </div>
        <input
          aria-label="Page title"
          className="wf-notebook-title"
          maxLength={120}
          value={read(field('title'), current.title)}
          onChange={(event) =>
            edit(field('title'), event.target.value, {
              action: 'setPage',
              pageId: current.id,
              field: 'title',
            })
          }
          onBlur={() => commit(field('title'))}
        />
        <div className="wf-notebook-toolbar" aria-label="Note tools">
          <select
            aria-label="Notebook font"
            value={read(field('font'), current.font || 'Aptos')}
            onChange={(event) =>
              edit(field('font'), event.target.value, {
                action: 'setPage',
                pageId: current.id,
                field: 'font',
              })
            }
          >
            {['Aptos', 'Arial', 'Georgia', 'Courier New'].map((font) => (
              <option key={font}>{font}</option>
            ))}
          </select>
          <select
            aria-label="Notebook font size"
            value={read(field('size'), current.size || 17)}
            onChange={(event) =>
              edit(field('size'), Number(event.target.value), {
                action: 'setPage',
                pageId: current.id,
                field: 'size',
              })
            }
          >
            {[14, 17, 20, 24].map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>
          <button type="button" onClick={() => insertNote('• ')}>
            Bullets
          </button>
          <button type="button" onClick={() => insertNote('☐ ')}>
            Checklist
          </button>
          <button type="button" onClick={() => insertNote(`${new Date().toLocaleDateString()} — `)}>
            Date
          </button>
        </div>
        <textarea
          ref={bodyRef}
          aria-label="Page notes"
          className="wf-notebook-body"
          style={{
            fontFamily: `${read(field('font'), current.font || 'Aptos')}, Arial, sans-serif`,
            fontSize: `${read(field('size'), current.size || 17)}px`,
          }}
          value={read(field('body'), current.body)}
          onChange={(event) =>
            edit(field('body'), event.target.value, {
              action: 'setPage',
              pageId: current.id,
              field: 'body',
            })
          }
          onBlur={() => commit(field('body'))}
          placeholder="Start taking notes…"
        />
      </section>
    </div>
  );
}

function SlidesEditor({ file, read, edit, commit, perform }) {
  const [active, setActive] = useState(null);
  const [present, setPresent] = useState(false);
  const slides = file.content.slides;
  const current = slides.find((slide) => slide.id === active) || slides[0];
  const dialog = useRef(null);
  useEffect(() => {
    if (present) dialog.current?.showModal();
    else dialog.current?.close();
  }, [present]);
  const slideField = (field) => `slide:${current.id}:${field}`;
  const theme = read(slideField('theme'), current.theme || 'paper');
  return (
    <div className="wf-slides">
      <aside className="wf-slide-sidebar">
        <div className="wf-slide-sidebar-head">
          SLIDES <span>{slides.length} / 30</span>
        </div>
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            className={`wf-slide-thumb${current.id === slide.id ? ' active' : ''}`}
            onClick={() => setActive(slide.id)}
          >
            <span>{index + 1}</span>
            <strong>{slide.title || 'Untitled slide'}</strong>
          </button>
        ))}
        <button
          type="button"
          className="wf-add-slide"
          onClick={() => perform({ action: 'addSlide', slideId: crypto.randomUUID() })}
          disabled={slides.length >= 30}
        >
          <Plus size={16} /> Add slide
        </button>
      </aside>
      <div className="wf-slide-stage">
        <div className="wf-editor-tools">
          <span>SLIDE {slides.indexOf(current) + 1}</span>
          <div>
            <button
              type="button"
              onClick={() =>
                perform({
                  action: 'moveSlide',
                  slideId: current.id,
                  toIndex: slides.indexOf(current) - 1,
                })
              }
              disabled={slides.indexOf(current) === 0}
            >
              Move up
            </button>
            <button
              type="button"
              onClick={() =>
                perform({
                  action: 'moveSlide',
                  slideId: current.id,
                  toIndex: slides.indexOf(current) + 1,
                })
              }
              disabled={slides.indexOf(current) === slides.length - 1}
            >
              Move down
            </button>
            <button
              type="button"
              onClick={() =>
                perform({
                  action: 'duplicateSlide',
                  sourceId: current.id,
                  slideId: crypto.randomUUID(),
                })
              }
              disabled={slides.length >= 30}
            >
              Duplicate
            </button>
            <button type="button" onClick={() => setPresent(true)}>
              <Play size={15} /> Present
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this slide?'))
                  perform({ action: 'deleteSlide', slideId: current.id });
              }}
              disabled={slides.length === 1}
            >
              Delete
            </button>
          </div>
        </div>
        <div className="wf-slide-design">
          <label htmlFor="wf-slide-theme">Slide theme</label>
          <select
            id="wf-slide-theme"
            value={theme}
            onChange={(event) =>
              edit(slideField('theme'), event.target.value, {
                action: 'setSlide',
                slideId: current.id,
                field: 'theme',
              })
            }
          >
            {['paper', 'midnight', 'ocean', 'warm'].map((option) => (
              <option key={option} value={option}>
                {option[0].toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className={`wf-slide-canvas wf-slide-theme-${theme}`}>
          <input
            aria-label="Slide title"
            maxLength={120}
            placeholder="Slide title"
            value={read(slideField('title'), current.title)}
            onChange={(event) =>
              edit(slideField('title'), event.target.value, {
                action: 'setSlide',
                slideId: current.id,
                field: 'title',
              })
            }
            onBlur={() => commit(slideField('title'))}
          />
          <textarea
            aria-label="Slide body"
            maxLength={5000}
            placeholder="Add the key points for this slide…"
            value={read(slideField('body'), current.body)}
            onChange={(event) =>
              edit(slideField('body'), event.target.value, {
                action: 'setSlide',
                slideId: current.id,
                field: 'body',
              })
            }
            onBlur={() => commit(slideField('body'))}
          />
        </div>
        <div className="wf-slide-notes">
          <label htmlFor="wf-speaker-notes">Speaker notes</label>
          <textarea
            id="wf-speaker-notes"
            maxLength={10000}
            value={read(slideField('notes'), current.notes || '')}
            onChange={(event) =>
              edit(slideField('notes'), event.target.value, {
                action: 'setSlide',
                slideId: current.id,
                field: 'notes',
              })
            }
            onBlur={() => commit(slideField('notes'))}
            placeholder="Add presenter notes for this slide…"
          />
        </div>
      </div>
      <dialog
        className={`wf-present wf-slide-theme-${theme}`}
        ref={dialog}
        onClose={() => setPresent(false)}
      >
        <button
          type="button"
          className="wf-close"
          onClick={() => setPresent(false)}
          aria-label="Close presentation"
        >
          <X />
        </button>
        <span>
          SLIDE {slides.indexOf(current) + 1} / {slides.length}
        </span>
        <h2>{read(slideField('title'), current.title)}</h2>
        <p>{read(slideField('body'), current.body)}</p>
        <div className="wf-present-actions">
          <button
            type="button"
            onClick={() => setActive(slides[Math.max(0, slides.indexOf(current) - 1)].id)}
            disabled={slides.indexOf(current) === 0}
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() =>
              setActive(slides[Math.min(slides.length - 1, slides.indexOf(current) + 1)].id)
            }
            disabled={slides.indexOf(current) === slides.length - 1}
          >
            Next
          </button>
        </div>
      </dialog>
    </div>
  );
}

const columns = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index));
function SheetEditor({ file, read, edit, commit }) {
  const [focused, setFocused] = useState('');
  const [selected, setSelected] = useState('A1');
  const usedAddresses = Object.keys(file.content.cells || {}).concat(
    Object.keys(file.content.styles || {}),
  );
  const [rowCount, setRowCount] = useState(() =>
    Math.max(30, ...usedAddresses.map((address) => Number(address.slice(1)) || 0)),
  );
  const [columnCount, setColumnCount] = useState(() =>
    Math.max(12, ...usedAddresses.map((address) => address.charCodeAt(0) - 64 || 0)),
  );
  const visibleColumns = columns.slice(0, columnCount);
  const cells = { ...file.content.cells };
  for (const column of visibleColumns)
    for (let row = 1; row <= rowCount; row += 1) {
      const address = `${column}${row}`;
      cells[address] = read(`cell:${address}`, cells[address] || '');
    }
  const selectedRaw = cells[selected] || '';
  const selectedStyle = Object.fromEntries(
    ['bold', 'italic', 'align', 'fill', 'format'].map((field) => [
      field,
      read(`cellstyle:${selected}:${field}`, file.content.styles?.[selected]?.[field]),
    ]),
  );
  const setStyle = (field, value) =>
    edit(`cellstyle:${selected}:${field}`, value, {
      action: 'setCellStyle',
      cell: selected,
      field,
    });
  const styleFor = (address) => {
    const base = file.content.styles?.[address] || {};
    return Object.fromEntries(
      ['bold', 'italic', 'align', 'fill', 'format'].map((field) => [
        field,
        read(`cellstyle:${address}:${field}`, base[field]),
      ]),
    );
  };
  const display = (address, raw, style) => {
    const text = typeof raw === 'string' ? raw : String(raw ?? '');
    const value = text.startsWith('=') ? evaluateCell(address, cells) : text;
    if (value === '' || !Number.isFinite(Number(value)) || value.startsWith('#')) return value;
    const number = Number(value);
    if (style.format === 'currency')
      return `₹${number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (style.format === 'percent') return `${(number * 100).toFixed(1)}%`;
    if (style.format === 'number')
      return number.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return value;
  };
  return (
    <div className="wf-sheet">
      <div className="wf-sheet-ribbon">
        <span className="wf-sheet-tab active">Home</span>
      </div>
      <div className="wf-sheet-toolbar" aria-label="Spreadsheet formatting">
        <button
          type="button"
          aria-label="Bold selected cell"
          aria-pressed={Boolean(selectedStyle.bold)}
          onClick={() => setStyle('bold', !selectedStyle.bold)}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          aria-label="Italic selected cell"
          aria-pressed={Boolean(selectedStyle.italic)}
          onClick={() => setStyle('italic', !selectedStyle.italic)}
        >
          <i>I</i>
        </button>
        <select
          aria-label="Number format"
          value={selectedStyle.format || 'general'}
          onChange={(event) => setStyle('format', event.target.value)}
        >
          {['general', 'number', 'currency', 'percent'].map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select
          aria-label="Cell fill"
          value={selectedStyle.fill || 'none'}
          onChange={(event) => setStyle('fill', event.target.value)}
        >
          {['none', 'yellow', 'green', 'blue'].map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <button type="button" aria-label="Align left" onClick={() => setStyle('align', 'left')}>
          ☰
        </button>
        <button type="button" aria-label="Align center" onClick={() => setStyle('align', 'center')}>
          ≡
        </button>
        <button type="button" aria-label="Align right" onClick={() => setStyle('align', 'right')}>
          ☷
        </button>
      </div>
      <div className="wf-formula-row">
        <strong>{selected}</strong>
        <span>ƒx</span>
        <input
          aria-label={`Formula bar for ${selected}`}
          value={selectedRaw}
          onChange={(event) =>
            edit(`cell:${selected}`, event.target.value, { action: 'setCell', cell: selected })
          }
          onBlur={() => commit(`cell:${selected}`)}
          placeholder="Enter text, number, or formula"
        />
      </div>
      <div className="wf-grid-scroll">
        <table className="wf-grid">
          <caption className="sr-only">Shared spreadsheet grid</caption>
          <thead>
            <tr>
              <th aria-label="Row numbers" />
              {visibleColumns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }, (_, index) => index + 1).map((row) => (
              <tr key={row}>
                <th scope="row">{row}</th>
                {visibleColumns.map((column) => {
                  const address = `${column}${row}`;
                  const key = `cell:${address}`;
                  const raw = cells[address];
                  const style = styleFor(address);
                  return (
                    <td
                      key={address}
                      className={`wf-fill-${style.fill || 'none'}${selected === address ? ' selected' : ''}`}
                    >
                      <input
                        aria-label={`Cell ${address}`}
                        maxLength={500}
                        style={{
                          fontWeight: style.bold ? 700 : 400,
                          fontStyle: style.italic ? 'italic' : 'normal',
                          textAlign: style.align || 'left',
                        }}
                        value={focused === address ? (raw ?? '') : display(address, raw, style)}
                        onFocus={() => {
                          setFocused(address);
                          setSelected(address);
                        }}
                        onChange={(event) =>
                          edit(key, event.target.value, { action: 'setCell', cell: address })
                        }
                        onBlur={() => {
                          setFocused('');
                          commit(key);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            event.currentTarget.blur();
                            const next = document.querySelector(
                              `[aria-label="Cell ${column}${row + 1}"]`,
                            );
                            next?.focus();
                          }
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="wf-sheet-status">
        <span>Sheet1</span>
        <span>
          {rowCount} rows · {columnCount} columns · Formula support
        </span>
        <div>
          <button
            type="button"
            onClick={() => setRowCount((count) => Math.min(100, count + 10))}
            disabled={rowCount === 100}
          >
            + Rows
          </button>
          <button
            type="button"
            onClick={() => setColumnCount((count) => Math.min(26, count + 4))}
            disabled={columnCount === 26}
          >
            + Columns
          </button>
        </div>
      </div>
    </div>
  );
}

export function FileEditor({ token }) {
  const { roomId, fileId } = useParams();
  const [file, setFile] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState('Loading…');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [invite, setInvite] = useState('');
  const draftRef = useRef({});
  const timerRef = useRef({});
  const savingRef = useRef(Promise.resolve());
  const fileRef = useRef(null);
  const conflictRef = useRef(null);
  const activeFileRef = useRef(fileId);
  activeFileRef.current = fileId;
  fileRef.current = file;
  conflictRef.current = conflict;
  const receive = useCallback((incoming) => {
    if (incoming.id === activeFileRef.current)
      setFile((previous) =>
        !previous || incoming.revision >= previous.revision ? incoming : previous,
      );
  }, []);
  useEffect(() => {
    let alive = true;
    setFile(null);
    setDrafts({});
    setConflict(null);
    setError('');
    setStatus('Loading…');
    draftRef.current = {};
    savingRef.current = Promise.resolve();
    fileApi
      .get(token, roomId, fileId)
      .then(({ file: initial }) => {
        if (alive) {
          receive(initial);
          setStatus('All changes saved');
        }
      })
      .catch((failure) => {
        if (alive) setError(failure.message);
      });
    return () => {
      alive = false;
      Object.values(timerRef.current).forEach(clearTimeout);
    };
  }, [token, roomId, fileId, receive]);
  useFileEvents(token, roomId, (event) => {
    if (event.file?.id === fileId && event.file.content) receive(event.file);
  });
  const read = (key, fallback) => drafts[key]?.value ?? fallback;
  const save = useCallback(
    (key) => {
      clearTimeout(timerRef.current[key]);
      savingRef.current = savingRef.current.then(async () => {
        const draft = draftRef.current[key];
        if (!draft || conflictRef.current?.key === key) return;
        setStatus('Saving…');
        try {
          draft.operationId ||= crypto.randomUUID();
          const { file: next } = await fileApi.update(token, roomId, fileId, {
            operationId: draft.operationId,
            baseRevision: draft.baseRevision,
            patch: { ...draft.patch, value: draft.value },
          });
          receive(next);
          setError('');
          if (draftRef.current[key] === draft) {
            delete draftRef.current[key];
            setDrafts((previous) => {
              const copy = { ...previous };
              delete copy[key];
              return copy;
            });
            setStatus('All changes saved');
          } else {
            draftRef.current[key].baseRevision = next.revision;
            timerRef.current[key] = setTimeout(() => save(key), 200);
          }
        } catch (failure) {
          if (failure.code === 'REVISION_CONFLICT' || failure.status === 409) {
            const latest = await fileApi.get(token, roomId, fileId).catch(() => null);
            if (latest?.file) receive(latest.file);
            setConflict({
              key,
              message:
                'Someone changed this part of the file while you were editing. Your text is safe.',
            });
            setStatus('Review change');
          } else {
            setError(failure.message);
            setStatus('Save failed');
          }
        }
      });
    },
    [token, roomId, fileId, receive],
  );
  const edit = (key, value, patch) => {
    const prior = draftRef.current[key];
    const next = { value, patch, baseRevision: prior?.baseRevision ?? fileRef.current.revision };
    draftRef.current[key] = next;
    setDrafts((previous) => ({ ...previous, [key]: next }));
    setStatus('Unsaved changes');
    clearTimeout(timerRef.current[key]);
    timerRef.current[key] = setTimeout(() => save(key), 800);
  };
  const perform = async (patch) => {
    setStatus('Saving…');
    setError('');
    Object.keys(draftRef.current).forEach(save);
    await savingRef.current;
    try {
      const { file: next } = await fileApi.update(token, roomId, fileId, {
        operationId: crypto.randomUUID(),
        baseRevision: fileRef.current.revision,
        patch,
      });
      receive(next);
      setStatus('All changes saved');
    } catch (failure) {
      if (failure.status === 409 || failure.code === 'REVISION_CONFLICT') {
        const latest = await fileApi.get(token, roomId, fileId).catch(() => null);
        if (latest?.file) receive(latest.file);
      }
      setError(failure.message);
      setStatus('Save failed');
    }
  };
  const useShared = () => {
    if (!conflict) return;
    delete draftRef.current[conflict.key];
    setDrafts((previous) => {
      const copy = { ...previous };
      delete copy[conflict.key];
      return copy;
    });
    setConflict(null);
    setStatus('All changes saved');
  };
  const keepDraft = () => {
    if (!conflict) return;
    const draft = draftRef.current[conflict.key];
    if (draft) {
      draft.baseRevision = fileRef.current.revision;
      draft.operationId = crypto.randomUUID();
    }
    const key = conflict.key;
    conflictRef.current = null;
    setConflict(null);
    save(key);
  };
  const showInvite = async () => {
    try {
      const result = await roomApi.invite(token, roomId);
      setInvite(result.inviteCode);
    } catch (failure) {
      setError(failure.message);
    }
  };
  if (error && !file)
    return (
      <main className="wf-page">
        <p className="wf-error" role="alert">
          {error}
        </p>
        <Link to="/studio">Back to files</Link>
      </main>
    );
  if (!file)
    return (
      <main className="wf-page">
        <p>Opening shared file…</p>
      </main>
    );
  return (
    <main className={`wf-page wf-edit-page wf-${file.type}-page`}>
      <Link className="wf-back" to="/studio">
        <ArrowLeft size={16} /> All files
      </Link>
      <div className="wf-file-header">
        <div>
          <span className="section-kicker">
            {kinds[file.type].label.toUpperCase()} · LIVE COLLABORATION
          </span>
          <h1>{file.title}</h1>
        </div>
        <div className="wf-header-actions">
          <span className="wf-status" role="status">
            {status}
          </span>
          <button className="wf-share" type="button" onClick={showInvite}>
            <Users size={16} /> Share
          </button>
        </div>
      </div>
      {invite && (
        <div className="wf-invite glass-panel">
          <span>Invite collaborators using this code</span>
          <code>{invite}</code>
          <button type="button" onClick={() => navigator.clipboard.writeText(invite)}>
            <Copy size={15} /> Copy
          </button>
          <button type="button" onClick={() => setInvite('')} aria-label="Hide invite code">
            <X size={15} />
          </button>
        </div>
      )}
      {error && (
        <p className="wf-error" role="alert">
          {error}{' '}
          <button
            type="button"
            onClick={() => {
              setError('');
              Object.keys(draftRef.current).forEach(save);
            }}
          >
            Retry
          </button>
        </p>
      )}
      {conflict && (
        <div className="wf-conflict" role="alert">
          <p>{conflict.message}</p>
          <button type="button" onClick={useShared}>
            Use shared version
          </button>
          <button type="button" onClick={keepDraft}>
            Keep my edit
          </button>
        </div>
      )}
      {file.type === 'document' && (
        <DocumentEditor
          value={read('document:body', file.content.body)}
          format={{
            font: read('document:format:font', file.content.format?.font),
            size: read('document:format:size', file.content.format?.size),
            align: read('document:format:align', file.content.format?.align),
          }}
          onFormat={(field, value) =>
            edit(`document:format:${field}`, value, { action: 'setFormat', field })
          }
          onEdit={(value) => edit('document:body', value, { action: 'setBody' })}
          onCommit={() => save('document:body')}
        />
      )}
      {file.type === 'notebook' && (
        <NotebookEditor file={file} read={read} edit={edit} commit={save} perform={perform} />
      )}
      {file.type === 'slides' && (
        <SlidesEditor file={file} read={read} edit={edit} commit={save} perform={perform} />
      )}
      {file.type === 'sheet' && <SheetEditor file={file} read={read} edit={edit} commit={save} />}
    </main>
  );
}
