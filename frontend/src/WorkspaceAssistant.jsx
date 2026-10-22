import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowUp, CheckCircle2, CircleAlert, LoaderCircle, Sparkles, X } from 'lucide-react';
import { assistantApi } from './api.js';
import { assistantReducer, initialAssistantState } from './assistant-state.js';
import './workspace-assistant.css';

const QUESTION_LIMIT = 1800;
const examples = [
  'What should we improve in this presentation?',
  'Summarize the current project plan.',
  'What tasks are missing?',
  'Explain this spreadsheet formula.',
  'Suggest the next three actions for our team.',
];

function readableError(failure) {
  if (failure.code === 'AI_NOT_CONFIGURED') return 'AI Assistant is not configured on this server yet. Ask your workspace administrator to add GROQ_API_KEY in the server environment.';
  if (failure.code === 'AI_TIMEOUT') return 'The assistant took too long to respond. Please retry.';
  if (failure.code === 'RATE_LIMITED') return 'The assistant is receiving too many requests. Please wait a moment and retry.';
  return failure.message || 'The assistant could not complete that request. Please retry.';
}

function Score({ label, score, detail }) {
  return <div className="wa-score">
    <div className="wa-score-top"><span>{label}</span><strong>{score}<small>/100</small></strong></div>
    <div className="wa-score-track" aria-hidden="true"><i style={{ width: `${score}%` }} /></div>
    {detail && <small className="wa-score-detail">{detail}</small>}
  </div>;
}

export default function WorkspaceAssistant({ token, roomId, activeFileId, launcherClassName = 'toolbar-button glass-panel', disabled = false, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useReducer(assistantReducer, initialAssistantState);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const scrollRef = useRef(null);
  const requestLock = useRef(false);
  const setPanelOpen = useCallback((nextOpen) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange]);

  useEffect(() => { dispatch({ type: 'reset' }); }, [roomId, activeFileId]);
  useEffect(() => {
    if (!open) return undefined;
    const returnFocus = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPanelOpen(false);
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll('button:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      returnFocus?.focus?.();
    };
  }, [open, setPanelOpen]);
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);
  useEffect(() => {
    if (state.chatStatus === 'loading' || state.chatStatus === 'success') scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.messages, state.chatStatus]);

  const askInsights = async () => {
    if (requestLock.current) return;
    requestLock.current = true;
    dispatch({ type: 'insights-start' });
    try {
      const result = await assistantApi.insights(token, roomId, activeFileId);
      dispatch({ type: 'insights-success', value: result.insights });
    } catch (failure) {
      dispatch({ type: 'insights-error', message: readableError(failure) });
    } finally { requestLock.current = false; }
  };

  const sendQuestion = async (question = state.question, retry = false) => {
    const value = question.trim();
    if (requestLock.current || !value || value.length > QUESTION_LIMIT) return;
    requestLock.current = true;
    dispatch({ type: 'chat-start', value, retry });
    try {
      const result = await assistantApi.chat(token, roomId, value, activeFileId);
      dispatch({ type: 'chat-success', value: result.answer });
    } catch (failure) {
      dispatch({ type: 'chat-error', message: readableError(failure) });
    } finally { requestLock.current = false; }
  };

  const insights = state.insights;
  return <>
    <button ref={triggerRef} type="button" className={launcherClassName} onClick={() => setPanelOpen(true)} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} title={disabled ? 'AI Assistant is unavailable in the local demo. Sign in with a server-backed account to use it.' : undefined}>
      <Sparkles size={15} /><span>AI Assistant</span>
    </button>
    {open && <div className="wa-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) setPanelOpen(false); }}>
      <aside ref={panelRef} className="wa-panel" role="dialog" aria-modal="true" aria-labelledby="wa-title" aria-describedby="wa-description">
        <header className="wa-header">
          <div className="wa-heading-icon"><Sparkles size={17} /></div>
          <div className="wa-heading-copy"><span className="section-kicker">YOUR WORKSPACE, IN FOCUS</span><h2 id="wa-title">AI Assistant</h2></div>
          <button ref={closeRef} className="icon-button" type="button" onClick={() => setPanelOpen(false)} aria-label="Close AI Assistant"><X size={18} /></button>
          <p id="wa-description" className="sr-only">Workspace insights and questions, based only on content you are authorized to view.</p>
        </header>
        <div className="wa-tabs" role="tablist" aria-label="Assistant views">
          <button id="wa-tab-insights" type="button" role="tab" aria-selected={state.tab === 'insights'} aria-controls="wa-panel-insights" onClick={() => dispatch({ type: 'tab', value: 'insights' })}>Project Insights</button>
          <button id="wa-tab-chat" type="button" role="tab" aria-selected={state.tab === 'chat'} aria-controls="wa-panel-chat" onClick={() => dispatch({ type: 'tab', value: 'chat' })}>Ask Synkro AI</button>
        </div>
        {state.tab === 'insights' ? <section id="wa-panel-insights" className="wa-view wa-insights" role="tabpanel" aria-labelledby="wa-tab-insights">
          {state.insightStatus === 'idle' && <div className="wa-empty"><span className="wa-empty-mark"><Sparkles size={20} /></span><h3>A clearer view of the work</h3><p>Get an advisory read on project health, collaboration, completeness, and organization.</p><button className="button button-primary" type="button" onClick={askInsights}><Sparkles size={15} /> Generate insights</button></div>}
          {state.insightStatus === 'loading' && <div className="wa-loading" role="status"><LoaderCircle className="wa-spin" size={21} /><strong>Reviewing this workspace</strong><span>Only its authorized notes and files are considered.</span></div>}
          {state.insightStatus === 'error' && <div className="wa-error" role="alert"><CircleAlert size={18} /><p>{state.insightError}</p><button className="button" type="button" onClick={askInsights}><ArrowUp size={14} /> Retry</button></div>}
          {state.insightStatus === 'success' && insights && <div className="wa-results">
            <div className="wa-overall"><div><span className="section-kicker">OVERALL PROJECT HEALTH</span><strong>{insights.overallScore}<small>/100</small></strong><span className={`wa-label wa-label-${insights.overallLabel.toLowerCase().replaceAll(' ', '-')}`}>{insights.overallLabel}</span></div><p>{insights.summary}</p></div>
            <div className="wa-scores">
              <Score label="Collaboration smoothness" score={insights.collaborationScore} detail={insights.collaborationLabel} />
              <Score label="Content completeness" score={insights.completenessScore} />
              <Score label="Organization" score={insights.organizationScore} />
            </div>
            {insights.suggestions.length > 0 && <section className="wa-result-section"><h3>Suggested next actions</h3><ol className="wa-suggestions">{insights.suggestions.map((suggestion, index) => <li key={`${suggestion.title}-${index}`}><span className={`wa-priority wa-priority-${suggestion.priority}`}>{suggestion.priority}</span><div><strong>{suggestion.title}</strong><p>{suggestion.detail}</p></div></li>)}</ol></section>}
            <div className="wa-result-columns">
              <section className="wa-result-section"><h3><CheckCircle2 size={14} /> Strengths</h3>{insights.strengths.length ? <ul>{insights.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>None identified from the available context.</p>}</section>
              <section className="wa-result-section"><h3><CircleAlert size={14} /> Risks or missing items</h3>{insights.risks.length ? <ul>{insights.risks.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>None identified from the available context.</p>}</section>
            </div>
            <p className="wa-confidence">{insights.confidenceNote}</p>
            <button className="wa-regenerate" type="button" onClick={askInsights}><Sparkles size={14} /> Generate again</button>
          </div>}
        </section> : <section id="wa-panel-chat" className="wa-view wa-chat" role="tabpanel" aria-labelledby="wa-tab-chat" tabIndex={0}>
          <div ref={scrollRef} className="wa-chat-content">
            {!state.messages.length && <div className="wa-chat-welcome"><span className="section-kicker">ASK ABOUT THE WORK</span><h3>What are you thinking through?</h3><p>Answers use this room’s authorized notes and files, plus general reasoning.</p><div className="wa-examples" aria-label="Example questions">{examples.map((example) => <button key={example} type="button" onClick={() => dispatch({ type: 'question', value: example })}>{example}</button>)}</div></div>}
            <div className="wa-messages" aria-live="polite" aria-relevant="additions text">
              {state.messages.map((message, index) => <article className={`wa-message wa-message-${message.role}`} key={`${index}-${message.role}`}><span>{message.role === 'user' ? 'You' : 'Synkro AI'}</span><p>{message.content}</p></article>)}
              {state.chatStatus === 'loading' && <div className="wa-chat-loading" role="status"><LoaderCircle className="wa-spin" size={15} /> Thinking…</div>}
            </div>
          </div>
          <div className="wa-composer-dock">
            {state.chatError && <div className="wa-chat-error" role="alert"><p>{state.chatError}</p><button type="button" onClick={() => sendQuestion(state.pendingQuestion, true)}>Retry</button></div>}
            <form className="wa-composer" onSubmit={(event) => { event.preventDefault(); sendQuestion(); }}>
              <label htmlFor="wa-question">Ask Synkro AI</label>
              <textarea id="wa-question" value={state.question} maxLength={QUESTION_LIMIT} rows={3} placeholder="Ask about this workspace, file, or next steps…" onChange={(event) => dispatch({ type: 'question', value: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendQuestion(); } }} disabled={state.chatStatus === 'loading'} />
              <div className="wa-composer-foot"><span>{state.question.length}/{QUESTION_LIMIT}</span><button className="button button-primary" type="submit" aria-label="Send question" disabled={state.chatStatus === 'loading' || !state.question.trim()}>{state.chatStatus === 'loading' ? <LoaderCircle className="wa-spin" size={16} /> : <ArrowUp size={16} />}<span>Send</span></button></div>
            </form>
          </div>
        </section>}
      </aside>
    </div>}
  </>;
}