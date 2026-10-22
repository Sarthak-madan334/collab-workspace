import { useEffect, useId, useState } from 'react';
import { getMetricInterpretation, getPriorityBand, getScoreBand, isValidInsightScore } from './assistant-insight-utils.js';

function useProgressVisible(value) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setVisible(true);
      return undefined;
    }
    setVisible(false);
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [value]);
  return visible;
}

export function ScoreRing({ score, label }) {
  const band = getScoreBand(score);
  const visible = useProgressVisible(score);
  const id = useId().replaceAll(':', '');
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = visible ? circumference * (1 - score / 100) : circumference;
  const accessibleLabel = `Project health estimate: ${score} out of 100${label ? `, ${label}` : ''}`;

  return <div className={`wa-health-ring wa-health-ring-${band}`} role="img" aria-label={accessibleLabel}>
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs><linearGradient id={`wa-ring-gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="var(--wa-ring-start)" /><stop offset="100%" stopColor="var(--wa-ring-end)" /></linearGradient></defs>
      <circle className="wa-ring-track" cx="60" cy="60" r={radius} />
      <circle className="wa-ring-progress" cx="60" cy="60" r={radius} stroke={`url(#wa-ring-gradient-${id})`} strokeDasharray={circumference} strokeDashoffset={dashOffset} transform="rotate(-90 60 60)" />
    </svg>
    <span className="wa-ring-score" aria-hidden="true">{score}<small>/100</small></span>
  </div>;
}

export function InsightMetricCard({ title, score, detail, Icon, tone }) {
  const validScore = isValidInsightScore(score);
  const visible = useProgressVisible(score);
  const interpretation = getMetricInterpretation(score, detail);

  return <article className={`wa-insight-metric wa-metric-${tone}`}>
    <div className="wa-metric-heading"><span className="wa-metric-icon"><Icon size={17} aria-hidden="true" /></span><h4>{title}</h4></div>
    <strong className="wa-metric-score">{validScore ? score : '—'}<small>{validScore ? '/100' : ''}</small></strong>
    <p>{interpretation}</p>
    <div className="wa-metric-track" role={validScore ? 'progressbar' : undefined} aria-label={validScore ? `${title} score` : undefined} aria-valuemin={validScore ? 0 : undefined} aria-valuemax={validScore ? 100 : undefined} aria-valuenow={validScore ? score : undefined}>
      <span style={{ width: `${visible && validScore ? score : 0}%` }} aria-hidden="true" />
    </div>
  </article>;
}

export function PriorityActionCard({ suggestion, featured = false }) {
  const band = getPriorityBand(suggestion?.priority);
  const title = typeof suggestion?.title === 'string' ? suggestion.title.trim() : '';
  const detail = typeof suggestion?.detail === 'string' ? suggestion.detail.trim() : '';

  return <li className={`wa-action-card wa-action-${band}${featured ? ' is-featured' : ''}`}>
    <span className="wa-action-priority">{band === 'unavailable' ? 'Priority not set' : `${band} priority`}</span>
    <div><h4>{title || 'Untitled recommendation'}</h4>{detail && <p>{detail}</p>}</div>
  </li>;
}