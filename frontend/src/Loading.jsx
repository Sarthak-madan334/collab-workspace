export function PageLoader({ brand, label }) {
  return <section className="page-loader" role="status" aria-live="polite" aria-label={label}>
    <div className="page-loader-aura" aria-hidden="true" />
    <div className="page-loader-content">
      <div className="page-loader-orbit" aria-hidden="true">
        <i /><i /><i /><i />
      </div>
      <div className="page-loader-brand"><span className="page-loader-ring" aria-hidden="true" />{brand}</div>
      <p>{label}</p>
    </div>
  </section>;
}

export function InlineLoader({ label, className = '' }) {
  return <span className={`inline-loader ${className}`} role="status" aria-live="polite">
    <span className="spinner" aria-hidden="true" />
    {label && <span>{label}</span>}
  </span>;
}

export function ButtonLoader({ label }) {
  return <span className="button-loader">
    <span className="spinner" aria-hidden="true" />
    <span>{label}</span>
  </span>;
}

export function SkeletonLoader() {
  return <div className="room-card room-skeleton glass-panel" aria-hidden="true">
    <div className="room-card-top"><span className="skeleton-block skeleton-glyph" /><span className="skeleton-block skeleton-menu" /></div>
    <div className="skeleton-room-body">
      <span className="skeleton-block skeleton-label" />
      <span className="skeleton-block skeleton-title" />
      <span className="skeleton-block skeleton-description" />
    </div>
    <div className="room-card-footer"><span className="skeleton-block skeleton-meta" /><span className="skeleton-block skeleton-action" /></div>
  </div>;
}

export function ConnectionStatus({ connection, saveState, dirty, onRetry }) {
  const connectionLabels = {
    connecting: 'Connecting to Synkro…',
    reconnecting: 'Reconnecting…',
    error: 'Connection lost',
  };
  const saveLabels = {
    saving: 'Saving…',
    failed: 'Save failed',
    paused: 'Waiting to reconnect',
    review: 'Review changes',
    pending: 'Unsaved changes',
  };
  const label = connection !== 'live'
    ? connectionLabels[connection] || 'Connecting to Synkro…'
    : saveLabels[saveState] || (dirty ? 'Unsaved changes' : 'Live connection');
  const tone = ['error'].includes(connection) || saveState === 'failed'
    ? 'danger'
    : connection === 'live' && saveState === 'saved' && !dirty ? 'success' : 'neutral';

  return <div className={`connection-badge tone-${tone}`} role="status" aria-live="polite">
    <span className="connection-dot" aria-hidden="true" />
    <span>{label}</span>
    {saveState === 'failed' && <button onClick={onRetry} className="retry-link">Review</button>}
  </div>;
}