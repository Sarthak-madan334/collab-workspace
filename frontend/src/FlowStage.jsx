import React from 'react';
import { ArrowRight, Check, History, MessageSquare, PenLine, Plus, Radio, Users } from 'lucide-react';

function People({ compact = false }) {
  return <div className={`flow-people${compact ? ' flow-people-compact' : ''}`}>
    <span className="flow-person flow-person-a">A</span>
    <span className="flow-person flow-person-p">P</span>
    <span className="flow-person flow-person-t">T</span>
  </div>;
}

function RoomScene() {
  return <div className="flow-scene flow-room-scene">
    <div className="flow-scene-top"><span><Users size={15} /> TEAM SPACE</span><span className="flow-live"><i /> ROOM OPEN</span></div>
    <div className="flow-room-content">
      <span className="flow-scene-kicker">YOUR SHARED SPACE</span>
      <h4>Design sprint<span>.</span></h4>
      <p>One place to collect ideas, write together, and keep the whole team in the loop.</p>
      <div className="flow-room-invite"><span><Plus size={17} /> Invite your team</span><strong>ST-291</strong></div>
    </div>
    <div className="flow-scene-bottom"><People /><span>Alex, Priya and Taylor are here</span><span className="flow-scene-check"><Check size={14} /> Ready to collaborate</span></div>
  </div>;
}

function NotesScene() {
  return <div className="flow-scene flow-notes-scene">
    <div className="flow-scene-top"><span><PenLine size={15} /> DESIGN SPRINT / NOTES</span><span className="flow-live"><i /> LIVE</span></div>
    <div className="flow-notes-content">
      <span className="flow-scene-kicker">ONE SHARED PAGE</span>
      <h4>Ideas in progress</h4>
      <p>Good work gets better when we make it together.</p>
      <div className="flow-note-divider" />
      <strong>What should we make?</strong>
      <div className="flow-edit-line">Let's make it easier to share ideas as they happen.<span className="flow-caret" /></div>
      <span className="flow-edit-author"><span className="flow-person flow-person-a">A</span> Alex is writing</span>
      <div className="flow-comment"><span className="flow-person flow-person-p">P</span><span><b>Priya</b><br />Let's set a milestone for Friday.</span><MessageSquare size={14} /></div>
    </div>
    <div className="flow-scene-bottom"><People compact /><span>2 editing now</span><span className="flow-scene-check"><Radio size={14} /> Changes appear instantly</span></div>
  </div>;
}

function HistoryScene() {
  return <div className="flow-scene flow-history-scene">
    <div className="flow-scene-top"><span><History size={15} /> DESIGN SPRINT / HISTORY</span><span className="flow-live"><i /> ALL CHANGES SAVED</span></div>
    <div className="flow-history-content">
      <div className="flow-history-list">
        <span className="flow-scene-kicker">PREVIOUS VERSIONS</span>
        <div className="flow-version is-current"><span>08</span><div><strong>Latest notes</strong><small>Just now · Alex</small></div><Check size={16} /></div>
        <div className="flow-version"><span>07</span><div><strong>Project outline</strong><small>10:42 · Priya</small></div></div>
        <div className="flow-version"><span>06</span><div><strong>First ideas</strong><small>09:18 · Taylor</small></div></div>
      </div>
      <div className="flow-version-preview"><span className="flow-scene-kicker">VERSION 07 PREVIEW</span><h4>Project outline</h4><p>Bring the team together around one clear direction.</p><div className="flow-preview-lines"><i /><i /><i /></div><span className="flow-preview-foot"><History size={14} /> Earlier ideas are always within reach</span></div>
    </div>
    <div className="flow-scene-bottom"><span>Every change, kept in context</span><span className="flow-scene-check"><Check size={14} /> Nothing gets lost</span></div>
  </div>;
}

export default function FlowStage({ cards, active, onSelect, LinkComponent }) {
  const card = cards[active];
  return <div className="flow-stage glass-panel">
    <div className="flow-stage-steps" aria-label="Explore the Synkro flow">
      <div className="flow-stage-kicker"><span className="flow-stage-kicker-dot" /> FROM FIRST IDEA TO FINISHED WORK</div>
      <div className="flow-step-list">
        {cards.map((item, index) => <button
          key={item.step}
          type="button"
          className={`flow-step${active === index ? ' is-active' : ''}`}
          onClick={() => onSelect(index)}
          aria-current={active === index ? 'step' : undefined}
          aria-controls="flow-stage-preview"
        >
          <span className="flow-step-number">{item.step}</span>
          <span className="flow-step-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
          <span className="flow-step-icon" aria-hidden="true">{item.icon}</span>
        </button>)}
      </div>
      <LinkComponent className="flow-stage-link" to={card.route}>{card.hint}<ArrowRight size={16} /></LinkComponent>
    </div>
    <div id="flow-stage-preview" className="flow-stage-preview" aria-label={`Preview: ${card.title}`}>
      <div className="flow-stage-preview-top"><span>THE WORKSPACE, IN ACTION</span><span>{card.step} / 03</span></div>
      <div className="flow-scene-wrap" key={card.kind}>
        {card.kind === 'room' && <RoomScene />}
        {card.kind === 'sync' && <NotesScene />}
        {card.kind === 'history' && <HistoryScene />}
      </div>
      <div className="flow-stage-preview-foot"><span><span className="flow-stage-kicker-dot" /> SYNKRO / {card.kind.toUpperCase()}</span><span>ONE SPACE, EVERYONE IN SYNC</span></div>
    </div>
  </div>;
}
