import { useMemo, useRef, useState } from 'react';
import { Braces, Check, ChevronDown, CircleAlert, Clock3, Play, Terminal } from 'lucide-react';
import { compilerApi } from './api.js';

const languageNames = { python: 'Python 3.13', cpp: 'C++ · GCC 13.2' };
const keywords = {
  python: new Set(['and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'False', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'None', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield']),
  cpp: new Set(['alignas', 'auto', 'bool', 'break', 'case', 'catch', 'char', 'class', 'const', 'constexpr', 'continue', 'default', 'delete', 'do', 'double', 'else', 'enum', 'explicit', 'extern', 'false', 'float', 'for', 'if', 'include', 'inline', 'int', 'long', 'namespace', 'new', 'nullptr', 'private', 'protected', 'public', 'return', 'short', 'signed', 'sizeof', 'static', 'std', 'struct', 'switch', 'template', 'this', 'throw', 'true', 'try', 'typedef', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'while']),
};

function highlightCode(source, language) {
  const expression = language === 'python'
    ? /(#[^\n]*|'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g
    : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#\s*[A-Za-z_]+|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b)/g;
  const pieces = [];
  let cursor = 0;
  for (const match of source.matchAll(expression)) {
    if (match.index > cursor) pieces.push({ text: source.slice(cursor, match.index) });
    const value = match[0];
    let kind = '';
    if (value.startsWith('//') || value.startsWith('/*') || (language === 'python' && value.startsWith('#'))) kind = 'comment';
    else if (value.startsWith('"') || value.startsWith("'") || value.startsWith('"""') || value.startsWith("'''")) kind = 'string';
    else if (/^\d/.test(value)) kind = 'number';
    else if (keywords[language].has(value)) kind = 'keyword';
    else if (/^#/.test(value)) kind = 'directive';
    else if (/\s*\(/.test(source.slice(match.index + value.length, match.index + value.length + 2))) kind = 'function';
    pieces.push({ text: value, kind });
    cursor = match.index + value.length;
  }
  if (cursor < source.length) pieces.push({ text: source.slice(cursor) });
  if (!source) pieces.push({ text: '\n' });
  return pieces;
}

export function CodeEditor({ file, token, roomId, fileId, read, edit, perform }) {
  const language = file.content.language === 'cpp' ? 'cpp' : 'python';
  const key = `code:source:${language}`;
  const source = read(key, file.content.sources?.[language] || '');
  const stdin = read('code:stdin', file.content.stdin || '');
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const codeArea = useRef(null);
  const lines = useMemo(() => Array.from({ length: Math.max(1, source.split('\n').length) }, (_, i) => i + 1), [source]);
  const highlighted = useMemo(() => highlightCode(source, language), [source, language]);

  const changeLanguage = (next) => {
    if (next !== language) {
      setResult(null);
      setRunError('');
      void perform({ action: 'setCodeLanguage', language: next });
    }
  };

  const run = async () => {
    if (running) return;
    setRunning(true);
    setRunError('');
    setResult(null);
    try {
      const response = await compilerApi.run(token, roomId, fileId, { language, source, stdin });
      setResult(response);
    } catch (failure) {
      setRunError(failure.message || 'Could not run this program.');
    } finally {
      setRunning(false);
    }
  };

  const insertTab = (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    const element = event.currentTarget;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const next = `${source.slice(0, start)}    ${source.slice(end)}`;
    edit(key, next, { action: 'setCode', language });
    requestAnimationFrame(() => {
      element.selectionStart = element.selectionEnd = start + 4;
    });
  };

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void run();
    } else insertTab(event);
  };

  const output = result?.compileOutput || result?.stderr || result?.stdout || result?.message;
  const successful = result?.statusId === 3;

  return (
    <section className="ce-shell" aria-label="Code editor and compiler">
      <div className="ce-toolbar">
        <div className="ce-language-picker" role="group" aria-label="Programming language">
          <span className="ce-language-icon"><Braces size={16} /></span>
          <button type="button" aria-pressed={language === 'python'} onClick={() => changeLanguage('python')}>Python</button>
          <button type="button" aria-pressed={language === 'cpp'} onClick={() => changeLanguage('cpp')}>C++</button>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <div className="ce-toolbar-right">
          <span className="ce-language-version">{languageNames[language]}</span>
          <button className="ce-run" type="button" onClick={run} disabled={running}>
            {running ? <span className="ce-spinner" aria-hidden="true" /> : <Play size={15} fill="currentColor" />}
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>

      <div className="ce-workbench">
        <section className="ce-pane ce-source-pane" aria-label="Source code">
          <div className="ce-pane-heading"><span><Braces size={14} /> {language === 'python' ? 'main.py' : 'main.cpp'}</span><span>Autosaves to this shared file</span></div>
          <div className="ce-editor">
            <div className="ce-gutter" aria-hidden="true">{lines.map((line) => <span key={line}>{line}</span>)}</div>
            <div className="ce-code-surface">
              <pre className="ce-code-highlight" aria-hidden="true">{highlighted.map((piece, index) => piece.kind ? <span className={`ce-token-${piece.kind}`} key={index}>{piece.text}</span> : <span key={index}>{piece.text}</span>)}</pre>
              <textarea
                ref={codeArea}
                value={source}
                onChange={(event) => edit(key, event.target.value, { action: 'setCode', language })}
                onKeyDown={handleKeyDown}
                onScroll={(event) => {
                  const surface = event.currentTarget.parentElement;
                  const highlight = surface?.querySelector('.ce-code-highlight');
                  const gutter = surface?.previousElementSibling;
                  if (highlight) { highlight.scrollTop = event.currentTarget.scrollTop; highlight.scrollLeft = event.currentTarget.scrollLeft; }
                  if (gutter) gutter.scrollTop = event.currentTarget.scrollTop;
                }}
                aria-label={`${languageNames[language]} source code`}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck="false"
                maxLength={64 * 1024}
                wrap="off"
              />
            </div>
          </div>
          <label className="ce-input-label" htmlFor="ce-stdin">Program input <span>Optional · sent to stdin</span></label>
          <textarea
            id="ce-stdin"
            className="ce-stdin"
            value={stdin}
            onChange={(event) => edit('code:stdin', event.target.value, { action: 'setCodeStdin' })}
            placeholder="Type input your program reads…"
            maxLength={16 * 1024}
            rows={2}
          />
          <div className="ce-editor-footer"><span>{source.split('\n').length} lines</span><span>Ctrl/Cmd + Enter to run</span></div>
        </section>

        <section className="ce-pane ce-output-pane" aria-label="Program output">
          <div className="ce-pane-heading"><span><Terminal size={14} /> Output</span>{result && <span className={`ce-run-status ${successful ? 'is-success' : 'is-failure'}`}>{successful ? <Check size={13} /> : <CircleAlert size={13} />}{result.status}</span>}</div>
          <div className={`ce-output ${runError ? 'has-error' : ''}`} aria-live="polite" aria-busy={running}>
            {running ? <div className="ce-output-empty"><span className="ce-spinner" />Compiling and running your program…</div>
              : runError ? <p className="ce-run-error"><CircleAlert size={16} />{runError}</p>
                : result ? <>
                  {output ? <pre>{output}</pre> : <p className="ce-no-output">Program finished without output.</p>}
                  {result.stdout && (result.compileOutput || result.stderr) && <div className="ce-stdout"><span>Standard output</span><pre>{result.stdout}</pre></div>}
                  <div className="ce-run-meta"><span><Clock3 size={13} />{result.time ? `${result.time}s` : 'Finished'}</span>{result.memory != null && <span>{Math.round(result.memory / 1024)} MB memory</span>}</div>
                </>
                : <div className="ce-output-empty"><Terminal size={21} /><strong>Your output will appear here</strong><span>Press Run to compile and execute {languageNames[language]}.</span></div>}
          </div>
          <div className="ce-runtime-note"><span className="ce-runtime-dot" /> Runs in an isolated compiler environment</div>
        </section>
      </div>
    </section>
  );
}
