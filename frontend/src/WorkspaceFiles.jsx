import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Presentation,
  Table2,
  NotebookTabs,
  Code2,
  Plus,
  Play,
  X,
  RefreshCw,
  Users,
  Copy,
  History,
  FileClock,
  ArrowRight,
} from 'lucide-react';
import { fileApi, roomApi } from './api.js';
import { DEMO_TOKEN } from './demo.js';
import { createWorkspaceSocket, socketAck } from './realtime.js';
import { evaluateCell } from './sheet-formulas.js';
import { buildFileInviteUrl } from './invite-links.js';
import { CodeEditor } from './CodeEditor.jsx';
import WorkspaceAssistant from './WorkspaceAssistant.jsx';
import './workspace-files.css';
import './code-editor.css';

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
  code: {
    label: 'Code workspace',
    icon: Code2,
    description: 'Write, run, and share Python or C++ code.',
  },
};

function useFileEvents(token, roomId, onEvent, onPresence) {
  const callback = useRef(onEvent);
  callback.current = onEvent;
  const presenceCallback = useRef(onPresence);
  presenceCallback.current = onPresence;
  useEffect(() => {
    if (!token || !roomId) return undefined;
    presenceCallback.current?.(null);
    const socket = createWorkspaceSocket(token);
    let presenceSequence = -1;
    const syncPresence = (snapshot) => {
      if (!snapshot || (snapshot.roomId && snapshot.roomId !== roomId)) return;
      const sequence = Number(snapshot.presenceSequence);
      if (!Number.isFinite(sequence) || sequence < presenceSequence) return;
      presenceSequence = sequence;
      presenceCallback.current?.(snapshot.presence || snapshot.users || []);
    };
    const join = () => socketAck(socket, 'room:join', { roomId }).then(syncPresence).catch(() => {});
    const created = (event) => {
      if (event.roomId === roomId) callback.current(event);
    };
    const updated = (event) => {
      if (event.roomId === roomId) callback.current(event);
    };
    const presenceUpdated = (event) => syncPresence(event);
    const disconnected = () => presenceCallback.current?.(null);
    socket.on('connect', join);
    socket.on('file:created', created);
    socket.on('file:updated', updated);
    socket.on('file:contributions-updated', updated);
    socket.on('presence:updated', presenceUpdated);
    socket.on('disconnect', disconnected);
    socket.connect();
    return () => {
      socket.off('connect', join);
      socket.off('file:created', created);
      socket.off('file:updated', updated);
      socket.off('file:contributions-updated', updated);
      socket.off('presence:updated', presenceUpdated);
      socket.off('disconnect', disconnected);
      socket.emit('room:leave', { roomId });
      socket.disconnect();
    };
  }, [token, roomId]);
}

function personInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';
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
      const { room } = await roomApi.create(token, title.trim(), 'room');
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
      navigate(`/rooms/${room.id}`);
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
  const [ribbonTab, setRibbonTab] = useState('Home');
  const slides = file.content.slides;
  const current = slides.find((slide) => slide.id === active) || slides[0];
  const dialog = useRef(null);
  useEffect(() => {
    if (present) dialog.current?.showModal();
    else dialog.current?.close();
  }, [present]);
  const slideField = (field) => `slide:${current.id}:${field}`;
  const theme = read(slideField('theme'), current.theme || 'paper');
  const addSlide = () => {
    const slideId = crypto.randomUUID();
    setActive(slideId);
    perform({ action: 'addSlide', slideId });
  };
  const duplicateSlide = () => {
    const slideId = crypto.randomUUID();
    setActive(slideId);
    perform({ action: 'duplicateSlide', sourceId: current.id, slideId });
  };
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
            <span className="wf-slide-thumb-number">{index + 1}</span>
            <span className={`wf-slide-thumb-preview wf-slide-theme-${slide.theme || 'paper'}`}>
              <strong>{slide.title || 'Untitled slide'}</strong>
              <small>{slide.body || 'Add slide content'}</small>
            </span>
          </button>
        ))}
        <button
          type="button"
          className="wf-add-slide"
          onClick={addSlide}
          disabled={slides.length >= 30}
        >
          <Plus size={16} /> Add slide
        </button>
      </aside>
      <div className="wf-slide-stage">
        <div className="wf-slide-ribbon-tabs" role="tablist" aria-label="Presentation tools">
          {['Home', 'Insert', 'Design'].map((tab, index, tabs) => <button key={tab} type="button" role="tab" tabIndex={ribbonTab === tab ? 0 : -1} aria-selected={ribbonTab === tab} className={ribbonTab === tab ? 'active' : ''} onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const offset = event.key === 'ArrowRight' ? 1 : -1; setRibbonTab(tabs[(index + offset + tabs.length) % tabs.length]); } }} onClick={() => setRibbonTab(tab)}>{tab}</button>)}
          <button type="button" onClick={() => setPresent(true)}><Play size={14} /> Present</button>
        </div>
        {ribbonTab === 'Home' && <div className="wf-editor-tools">
          <span className="wf-slide-counter">Slide {slides.indexOf(current) + 1} of {slides.length}</span>
          <div>
            <button
              type="button"
              aria-label="Move slide up"
              onClick={() =>
                perform({
                  action: 'moveSlide',
                  slideId: current.id,
                  toIndex: slides.indexOf(current) - 1,
                })
              }
              disabled={slides.indexOf(current) === 0}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Move slide down"
              onClick={() =>
                perform({
                  action: 'moveSlide',
                  slideId: current.id,
                  toIndex: slides.indexOf(current) + 1,
                })
              }
              disabled={slides.indexOf(current) === slides.length - 1}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={duplicateSlide}
              disabled={slides.length >= 30}
            >
              Duplicate
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
        </div>}
        {ribbonTab === 'Insert' && <div className="wf-editor-tools wf-slide-insert-tools"><span className="wf-slide-counter">Add content to your deck</span><div><button type="button" onClick={addSlide} disabled={slides.length >= 30}><Plus size={14} /> Blank slide</button><button type="button" onClick={duplicateSlide} disabled={slides.length >= 30}>Duplicate current</button></div></div>}
        {ribbonTab === 'Design' && <div className="wf-slide-design">
          <label htmlFor="wf-slide-theme">Theme</label>
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
        </div>}
        <div className="wf-slide-workspace">
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
        </div>
        <div className="wf-slide-notes">
          <label htmlFor="wf-speaker-notes"><span>Speaker notes</span><small>Notes are visible to presenters only</small></label>
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
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' && slides.indexOf(current) < slides.length - 1) setActive(slides[slides.indexOf(current) + 1].id);
          if (event.key === 'ArrowLeft' && slides.indexOf(current) > 0) setActive(slides[slides.indexOf(current) - 1].id);
        }}
      >
        <button
          type="button"
          className="wf-close"
          onClick={() => setPresent(false)}
          aria-label="Close presentation"
        >
          <X />
        </button>
        <div className="wf-present-canvas">
          <h2>{read(slideField('title'), current.title)}</h2>
          <p>{read(slideField('body'), current.body)}</p>
        </div>
        <span className="wf-present-count">{slides.indexOf(current) + 1} / {slides.length}</span>
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

function versionPreviewText(type, version) {
  const content = version.content || {};
  if (type === 'document') return content.body || 'This version has no text yet.';
  if (type === 'code') return `Python\n${content.sources?.python || ''}\n\nC++\n${content.sources?.cpp || ''}`;
  if (type === 'slides') return (content.slides || []).map((slide, index) => `${index + 1}. ${slide.title || 'Untitled slide'}\n${slide.body || 'No slide text'}`).join('\n\n') || 'No slides in this version.';
  if (type === 'notebook') return (content.pages || []).map((page) => `${page.title || 'Untitled page'}\n${page.body || 'No page text'}`).join('\n\n') || 'No pages in this version.';
  const cells = Object.entries(content.cells || {});
  return cells.length ? cells.map(([cell, value]) => `${cell}\t${value}`).join('\n') : 'This spreadsheet version has no cell values.';
}

export function FileEditor({ token, userId }) {
  const { roomId, fileId } = useParams();
  const [file, setFile] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState('Loading…');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(null);
  const [invite, setInvite] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [roomOwnerId, setRoomOwnerId] = useState(null);
  const [filePanel, setFilePanel] = useState('');
  const [fileHistory, setFileHistory] = useState([]);
  const [previewVersion, setPreviewVersion] = useState(null);
  const [contributionMap, setContributionMap] = useState(null);
  const [updatingArea, setUpdatingArea] = useState('');
  const [roomPresence, setRoomPresence] = useState(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [panelError, setPanelError] = useState('');
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
    setRoomOwnerId(null);
    setFilePanel('');
    setFileHistory([]);
    setPreviewVersion(null);
    setContributionMap(null);
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
    roomApi.get(token, roomId).then(({ room }) => { if (alive) setRoomOwnerId(room.ownerId); }).catch(() => {});
    return () => {
      alive = false;
      Object.values(timerRef.current).forEach(clearTimeout);
    };
  }, [token, roomId, fileId, receive]);
  useFileEvents(token, roomId, (event) => {
    if (event.file?.id === fileId && event.file.content) receive(event.file);
    if (event.fileId === fileId && filePanel === 'contributions') {
      fileApi.contributions(token, roomId, fileId).then(setContributionMap).catch(() => {});
    }
  }, setRoomPresence);
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
      setInviteCopied(false);
    } catch (failure) {
      setError(failure.message);
    }
  };
  const copyFileInvite = async () => {
    const link = buildFileInviteUrl(window.location.origin, invite, roomId, fileId);
    try {
      await navigator.clipboard.writeText(link);
      setInviteCopied(true);
    } catch {
      window.prompt('Copy this file invite link', link);
    }
  };
  const openFilePanel = async (panel) => {
    if (filePanel === panel) { setFilePanel(''); return; }
    setFilePanel(panel); setPanelError(''); setPreviewVersion(null); setPanelBusy(true);
    try {
      if (panel === 'history') setFileHistory((await fileApi.history(token, roomId, fileId)).items || []);
      else setContributionMap(await fileApi.contributions(token, roomId, fileId));
    } catch (failure) { setPanelError(failure.message); }
    finally { setPanelBusy(false); }
  };
  const previewFileVersion = async (item) => {
    setPanelBusy(true); setPanelError('');
    try { setPreviewVersion((await fileApi.version(token, roomId, fileId, item.revision)).version); }
    catch (failure) { setPanelError(failure.message); }
    finally { setPanelBusy(false); }
  };
  const restoreFileVersion = async () => {
    if (!previewVersion || roomOwnerId !== userId) return;
    if (!window.confirm(`Restore version ${previewVersion.revision}? This will create a new saved revision.`)) return;
    if (conflict) { setPanelError('Resolve the pending edit before restoring a version.'); return; }
    Object.keys(draftRef.current).forEach((key) => { clearTimeout(timerRef.current[key]); save(key); });
    await savingRef.current;
    if (Object.keys(draftRef.current).length) { setPanelError('Your latest edits could not be saved. Retry before restoring.'); return; }
    setPanelBusy(true); setPanelError('');
    try {
      const { file: restored } = await fileApi.restore(token, roomId, fileId, previewVersion.revision, crypto.randomUUID(), fileRef.current.revision);
      receive(restored); setStatus('Restored version'); setPreviewVersion(null);
      setFileHistory((items) => [{ revision: restored.revision, authorId: userId, authorName: 'You', kind: 'restore', restoredFromRevision: previewVersion.revision, createdAt: restored.updatedAt }, ...items]);
    } catch (failure) {
      setPanelError(failure.message);
      if (failure.status === 409) { const latest = await fileApi.get(token, roomId, fileId).catch(() => null); if (latest?.file) receive(latest.file); }
    } finally { setPanelBusy(false); }
  };
  const assignArea = async (areaId, assigneeId) => {
    setUpdatingArea(areaId); setPanelError('');
    try { setContributionMap(await fileApi.assign(token, roomId, fileId, areaId, assigneeId || null)); }
    catch (failure) { setPanelError(failure.message); }
    finally { setUpdatingArea(''); }
  };
  const setAreaStatus = async (areaId, status) => {
    setUpdatingArea(areaId); setPanelError('');
    try { setContributionMap(await fileApi.setAreaStatus(token, roomId, fileId, areaId, status)); }
    catch (failure) { setPanelError(failure.message); }
    finally { setUpdatingArea(''); }
  };
  const areas = contributionMap?.areas || [];
  const completedAreas = areas.filter((area) => area.status === 'done').length;
  const assignedAreas = areas.filter((area) => area.assigneeId).length;
  const owners = (contributionMap?.members || []).map((member) => ({
    ...member,
    areas: areas.filter((area) => area.assigneeId === member.id).length,
    done: areas.filter((area) => area.assigneeId === member.id && area.status === 'done').length,
  })).filter((member) => member.areas > 0);
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
          <div className="wf-room-presence" role="status" aria-live="polite" aria-atomic="true" aria-label={roomPresence ? `${roomPresence.length} people in this room` : 'Joining room'}>
            <div className="wf-room-avatars" aria-hidden="true">{(roomPresence || []).slice(0, 3).map((person, index) => <span className={`wf-room-avatar wf-room-avatar-${index % 4}`} key={person.id} title={person.name}>{personInitials(person.name)}</span>)}{roomPresence?.length > 3 && <span className="wf-room-avatar wf-room-avatar-overflow">+{roomPresence.length - 3}</span>}</div>
            <span>{roomPresence ? `${roomPresence.length} ${roomPresence.length === 1 ? 'person' : 'people'} here` : 'Joining room…'}</span>
          </div>
          <span className="wf-status" role="status">
            {status}
          </span>
          <button className={`wf-share ${filePanel === 'history' ? 'is-active' : ''}`} type="button" onClick={() => openFilePanel('history')} aria-expanded={filePanel === 'history'} aria-controls="file-detail-panel">
            <History size={16} /> History
          </button>
          <button className={`wf-share ${filePanel === 'contributions' ? 'is-active' : ''}`} type="button" onClick={() => openFilePanel('contributions')} aria-expanded={filePanel === 'contributions'} aria-controls="file-detail-panel">
            <Users size={16} /> Contributions
          </button>
          <button className="wf-share" type="button" onClick={showInvite}>
            <Users size={16} /> Share
          </button>
          <WorkspaceAssistant token={token} roomId={roomId} activeFileId={fileId} launcherClassName="wf-share" disabled={token === DEMO_TOKEN} />
        </div>
      </div>
      {invite && (
        <div className="wf-invite glass-panel">
          <span>Share this link to open this file together</span>
          <code>{invite}</code>
          <button type="button" onClick={copyFileInvite}>
            <Copy size={15} /> {inviteCopied ? 'Link copied' : 'Copy file link'}
          </button>
          <button type="button" onClick={() => setInvite('')} aria-label="Hide invite code">
            <X size={15} />
          </button>
        </div>
      )}
      {filePanel && <section id="file-detail-panel" className="wf-file-panel glass-panel" aria-label={filePanel === 'history' ? 'File version history' : 'Contribution map'}>
        <div className="wf-file-panel-head"><div><span className="section-kicker">{filePanel === 'history' ? 'RECOVERABLE WORK' : 'SHARED OWNERSHIP'}</span><h2>{filePanel === 'history' ? 'Version history' : 'FairShare · Contribution map'}</h2><p>{filePanel === 'history' ? 'Preview saved work and restore an earlier version.' : 'Agree who owns each part, then see saved edits by area.'}</p></div><button type="button" className="wf-panel-close" onClick={() => setFilePanel('')} aria-label="Close panel"><X size={17} /></button></div>
        {panelError && <p className="wf-error" role="alert">{panelError}</p>}
        {panelBusy && <p className="wf-panel-loading" role="status">Loading…</p>}
        {filePanel === 'history' && !panelBusy && (previewVersion ? <div className="wf-version-preview"><button className="wf-history-back" type="button" onClick={() => setPreviewVersion(null)}><ArrowLeft size={14} /> All versions</button><div className="wf-version-meta"><strong>Version {previewVersion.revision}{previewVersion.kind === 'restore' ? ' · Restored' : ''}</strong><span>{previewVersion.authorName || 'A teammate'} · {new Date(previewVersion.createdAt).toLocaleString()}</span></div><pre>{versionPreviewText(file.type, previewVersion)}</pre>{roomOwnerId === userId && <button className="wf-share wf-restore-action" type="button" onClick={restoreFileVersion} disabled={panelBusy}><RefreshCw size={15} /> Restore this version</button>}</div> : <div className="wf-history-list">{fileHistory.map((item) => <button className="wf-history-row" type="button" key={item.revision} onClick={() => previewFileVersion(item)}><span className="wf-history-icon">{item.kind === 'restore' ? <RefreshCw size={15} /> : <FileClock size={15} />}</span><span><strong>Version {item.revision}{item.revision === file.revision ? <small> CURRENT</small> : ''}</strong><em>{item.authorName} · {new Date(item.createdAt).toLocaleString()}</em></span><ArrowRight size={15} /></button>)}{!fileHistory.length && <p className="wf-panel-loading">No saved versions yet.</p>}</div>)}
        {filePanel === 'contributions' && contributionMap && !panelBusy && <div className="wf-contribution-list">
          <div className="wf-contribution-overview">
            <div className="wf-contribution-overview-head"><span>WORK COVERAGE</span><strong>{completedAreas} <small>/ {areas.length} areas done</small></strong></div>
            <progress className="wf-contribution-progress" value={completedAreas} max={Math.max(areas.length, 1)} aria-label={`${completedAreas} of ${areas.length} work areas marked done`} />
            <div className="wf-contribution-summary"><span><strong>{assignedAreas}</strong> of {areas.length} areas owned</span><span><strong>{contributionMap.contributors.reduce((sum, person) => sum + person.edits, 0)}</strong> saved edits tracked</span></div>
            {owners.length > 0 && <div className="wf-contribution-workload" aria-label="Work ownership by teammate"><span>OWNERSHIP</span>{owners.map((owner) => <span className="wf-owner-chip" key={owner.id}><strong>{owner.name}</strong><small>{owner.done}/{owner.areas} done</small></span>)}</div>}
          </div>
          {areas.map((area) => <article className="wf-contribution-row" key={area.id}>
            <div className="wf-contribution-area"><strong>{area.label}</strong><span>{area.edits} saved {area.edits === 1 ? 'edit' : 'edits'}{area.contributors.length ? ` · ${area.contributors.map((person) => `${person.name} ${person.edits}`).join(', ')}` : ' · No edits yet'}</span></div>
            <div className="wf-contribution-controls">
              <label><span className="sr-only">Owner for {area.label}</span><select value={area.assigneeId || ''} onChange={(event) => assignArea(area.id, event.target.value)} disabled={updatingArea === area.id}><option value="">Unassigned</option>{contributionMap.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
              <label><span className="sr-only">Progress for {area.label}</span><select className={`wf-area-status is-${area.status}`} value={area.status} onChange={(event) => setAreaStatus(area.id, event.target.value)} disabled={updatingArea === area.id}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label>
            </div>
          </article>)}
          {!areas.length && <p className="wf-panel-loading">Add a slide or page to map its ownership.</p>}
          <p className="wf-contribution-note">Progress is set by teammates. Saved edit counts show activity, not quality or effort.</p>
        </div>}
      </section>}
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
      {file.type === 'code' && <CodeEditor file={file} token={token} roomId={roomId} fileId={fileId} read={read} edit={edit} perform={perform} />}
    </main>
  );
}
