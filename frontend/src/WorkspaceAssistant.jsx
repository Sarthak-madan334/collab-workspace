import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowUp, BrainCircuit, CheckCircle2, CircleAlert, FileCheck2, FolderTree, LoaderCircle, Sparkles, UsersRound, X } from 'lucide-react';
import { assistantApi } from './api.js';
import { assistantReducer, initialAssistantState } from './assistant-state.js';
import { InsightMetricCard, PriorityActionCard, ScoreRing } from './AssistantInsightComponents.jsx';
import { isValidInsightScore, sortSuggestionsByPriority } from './assistant-insight-utils.js';
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
          <div className="wa-heading-icon"><BrainCircuit size={20} aria-hidden="true" /></div>
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
            <section className="wa-health-card" aria-label="Project health estimate">
              {isValidInsightScore(insights.overallScore) ? <ScoreRing score={insights.overallScore} label={insights.overallLabel} /> : <div className="wa-health-unavailable" role="status">—</div>}
              <div className="wa-health-copy"><span className="section-kicker">PROJECT HEALTH ESTIMATE</span><h3>{insights.overallLabel || 'Estimate unavailable'}</h3><p>AI-generated from the workspace context. This is an estimate, not work completed.</p></div>
            </section>
            <div className="wa-scores" aria-label="Project insight metrics">
              <InsightMetricCard title="Collaboration" score={insights.collaborationScore} detail={insights.collaborationLabel} Icon={UsersRound} tone="collaboration" />
              <InsightMetricCard title="Content completeness" score={insights.completenessScore} Icon={FileCheck2} tone="content" />
              <InsightMetricCard title="Organization" score={insights.organizationScore} Icon={FolderTree} tone="organization" />
            </div>
            <section className="wa-insight-card wa-summary-card"><h3>What we found</h3>{insights.summary ? <p>{insights.summary}</p> : <p className="wa-insight-empty">No summary was returned for this workspace.</p>}</section>
            <div className="wa-insight-groups">
              <section className="wa-insight-card wa-strengths-card"><h3><CheckCircle2 size={16} aria-hidden="true" /> Strengths</h3>{Array.isArray(insights.strengths) && insights.strengths.length ? <ul className="wa-insight-list">{insights.strengths.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="wa-insight-empty">No strengths were identified in the supplied context.</p>}</section>
              <section className="wa-insight-card wa-attention-card"><h3><CircleAlert size={16} aria-hidden="true" /> Needs attention</h3>{Array.isArray(insights.risks) && insights.risks.length ? <ul className="wa-insight-list">{insights.risks.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="wa-insight-empty">No items were flagged for attention in the supplied context.</p>}</section>
            </div>
            <section className="wa-next-steps"><h3>Recommended next steps</h3>{sortSuggestionsByPriority(insights.suggestions).length ? <ol className="wa-suggestions">{sortSuggestionsByPriority(insights.suggestions).map((suggestion, index) => <PriorityActionCard key={`${suggestion.title || 'action'}-${index}`} suggestion={suggestion} featured={index === 0} />)}</ol> : <p className="wa-insight-empty">No next steps were returned for this workspace.</p>}</section>
            {insights.confidenceNote && <p className="wa-confidence">{insights.confidenceNote}</p>}
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