import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/workspace.css', import.meta.url), 'utf8');

test('Help is a named native button that opens the getting-started panel', () => {
  assert.match(app, /<button className="help-button" type="button" aria-label="Open help" onClick=\{\(\) => setHelpOpen\(true\)\}/);
  assert.match(app, /\{helpOpen && <Modal title="Help & Getting Started"/);
  assert.match(styles, /\.app-shell \.help-button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--lime\)/);
});

test('Help modal supports Escape, backdrop, close, focus return, and focus trapping', () => {
  assert.match(app, /if \(event.key === 'Escape' && !dismissDisabledRef.current\) \{\s*onCloseRef\.current\(\)/);
  assert.match(app, /event.target === event.currentTarget\) onCloseRef\.current\(\)/);
  assert.match(app, /onClick=\{\(\) => setHelpOpen\(false\)\}>Close<\/GlassButton>/);
  assert.match(app, /previousFocus\?\.focus\?\.\(\)/);
  assert.match(app, /if \(initialFocus\) dialogRef\.current\?\.querySelector\([^;]+\)\?\.focus\(\)/);
  assert.match(app, /if \(event\.shiftKey && document\.activeElement === first\)[\s\S]*?else if \(!event\.shiftKey && document\.activeElement === last\)/);
  assert.match(app, /className="help-modal-card" scrimClassName="help-modal-scrim"/);
});

test('Help explains the implemented room, file, sharing, AI, and revision workflows', () => {
  for (const title of [
    'Create or join a room',
    'Invite teammates',
    'Create and edit files',
    'Share files and rooms',
    'Use AI Assistant',
    'Restore previous work / revisions',
    'Press Esc to close',
  ]) assert.ok(app.includes(title), `Missing Help content: ${title}`);
  assert.match(app, /Everything you need to collaborate in Synkro\./);
  assert.match(app, /Copy file link to open that file after joining its room/);
  assert.match(app, /Room and file owners can restore an earlier version as a new revision/);
});

test('native button activation is retained for Enter and Space', () => {
  const helpButton = app.match(/<button className="help-button"[\s\S]*?<\/button>/)?.[0] || '';
  assert.match(helpButton, /type="button"/);
  assert.match(helpButton, /onClick=\{\(\) => setHelpOpen\(true\)\}/);
  assert.doesNotMatch(helpButton, /onKeyDown=/);
});