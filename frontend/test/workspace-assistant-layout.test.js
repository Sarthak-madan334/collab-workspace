import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/workspace-assistant.css', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/WorkspaceAssistant.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('assistant panel stays in a right-side drawer across desktop, tablet, and mobile', () => {
  assert.match(css, /\.wa-panel\s*\{[^}]*width:\s*min\(560px,\s*46vw\)/s);
  assert.match(css, /\.wa-panel\s*\{[^}]*height:\s*100dvh;/s);
  assert.match(css, /\.wa-scrim\s*\{[^}]*inset:\s*0;/s);
  assert.match(css, /@media\s*\(min-width:\s*601px\)\s*and\s*\(max-width:\s*1100px\)\s*\{[^}]*\.wa-panel\s*\{[^}]*width:\s*min\(520px,\s*calc\(100vw\s*-\s*32px\)\)/s);
  assert.match(css, /@media\s*\(max-width:\s*600px\)\s*\{[^}]*\.wa-scrim\s*\{\s*inset:\s*calc\(8px\s*\+\s*env\(safe-area-inset-top\)\)\s*8px\s*calc\(8px\s*\+\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.wa-panel\s*\{\s*width:\s*min\(88vw,\s*420px\);\s*max-width:\s*100%;[^}]*height:\s*100%/);
  assert.match(css, /\.wa-panel\s*\{[^}]*max-width:\s*calc\(100vw\s*-\s*32px\)/s);
  assert.match(css, /\.wa-panel\s*\{[^}]*animation:\s*wa-enter/);
  assert.match(css, /backdrop-filter:\s*blur\(28px\)\s*saturate\(145%\)/);
});

test('header and tabs remain outside the only scrollable tab content region', () => {
  assert.match(css, /\.wa-header,\s*\.wa-tabs\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
  assert.match(css, /\.wa-panel\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.wa-view\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.wa-messages\s*\{[^}]*overflow:\s*visible/s);
  assert.match(component, /<header className="wa-header">[\s\S]*?<div className="wa-tabs"[\s\S]*?className="wa-view wa-insights"[\s\S]*?className="wa-view wa-chat"/);
  assert.doesNotMatch(component, /AI-generated guidance based on the current workspace/);
  assert.doesNotMatch(css, /\.wa-footer/);
  assert.match(app, /const \[assistantOpen, setAssistantOpen\] = useState\(false\)/);
  assert.match(app, /className=\{`app-shell\$\{assistantOpen \? ' assistant-open' : ''\}`\}/);
  assert.match(app, /aria-hidden=\{assistantOpen\} inert=\{assistantOpen\}/);
  assert.match(app, /<WorkspaceAssistant[^>]*onOpenChange=\{onAssistantOpenChange\}/);
  assert.match(component, /onOpenChange\?\.\(nextOpen\)/);
  assert.match(app, /setAssistantOpen\(open\)/);
  assert.match(component, /onClick=\{\(\) => setPanelOpen\(true\)\}/);
  assert.match(component, /onClick=\{\(\) => setPanelOpen\(false\)\}/);
  assert.match(component, /if \(event.key === 'Escape'\) \{[\s\S]*?setPanelOpen\(false\);/);
  assert.match(component, /if \(event.target === event.currentTarget\) setPanelOpen\(false\)/);
  assert.match(component, /panelRef\.current\.querySelectorAll\(/);
  assert.doesNotMatch(css, /\.app-shell\.assistant-open \.topbar\s*\{[^}]*visibility:\s*hidden/s);
  assert.match(component, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(component, /document\.body\.style\.overflow = previousOverflow/);
});

test('chat content scrolls independently above the docked composer', () => {
  const intro = component.indexOf('className="wa-chat-welcome"');
  const suggestions = component.indexOf('className="wa-examples"');
  const composer = component.indexOf('className="wa-composer"');
  assert.ok(intro >= 0 && suggestions > intro && composer > suggestions);
  assert.match(css, /\.wa-chat\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.wa-chat-content\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1\s+1\s+auto;[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.wa-chat\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.wa-composer-dock\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
  assert.match(css, /\.wa-composer-dock\s*\{[^}]*z-index:\s*2/s);
  assert.match(css, /\.wa-composer-dock\s*\{[^}]*background:\s*rgba\(12,\s*16,\s*14,\s*\.76\)/s);
  assert.match(css, /\.wa-composer-field\s*\{[^}]*border-radius:\s*17px/s);
  assert.doesNotMatch(component, /wa-scroll-cue|Scroll down to ask your question/);
});

test('chat composer is outside the scrolling content and protected from the mobile safe area', () => {
  const chatStart = component.indexOf('className="wa-view wa-chat"');
  const chatEnd = component.indexOf('</section>', chatStart);
  const chatMarkup = component.slice(chatStart, chatEnd);
  assert.ok(chatMarkup.includes('className="wa-composer"'));
  assert.ok(chatMarkup.includes('htmlFor="wa-question"'));
  assert.ok(chatMarkup.includes('maxLength={QUESTION_LIMIT}'));
  assert.ok(chatMarkup.includes('aria-label="Send question"'));
  assert.match(css, /\.wa-composer-dock\s*\{[^}]*padding:[^;]*env\(safe-area-inset-bottom\)/s);
  assert.match(css, /\.wa-composer-dock\s*\{[^}]*background:\s*rgba\(12,\s*16,\s*14,\s*\.76\)/s);
  assert.doesNotMatch(css, /\.wa-composer\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.wa-composer textarea\s*\{[^}]*font-size:\s*16px/);
  assert.match(css, /\.wa-composer textarea\s*\{[^}]*height:\s*92px;[^}]*min-height:\s*78px;[^}]*max-height:\s*180px/);
  assert.match(css, /\.wa-composer textarea\s*\{[^}]*height:\s*78px;[^}]*min-height:\s*68px;[^}]*max-height:\s*140px/);
  assert.match(chatMarkup, /wa-composer-label-row/);
  assert.match(chatMarkup, /Shift \+ Enter for a new line/);
  assert.match(chatMarkup, /wa-composer-field/);
});

test('assistant body text and controls use readable sizes and visible focus treatment', () => {
  assert.match(css, /\.wa-empty p, \.wa-chat-welcome p[^}]*font-size:\s*16px/);
  assert.match(css, /\.wa-tabs button\s*\{[^}]*font-size:\s*15px/);
  assert.match(css, /\.wa-composer label\s*\{[^}]*font-size:\s*15px/);
  assert.match(css, /\.wa-action-card p\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /\.wa-insight-list li, \.wa-insight-empty\s*\{[^}]*font-size:\s*13px/);
  assert.match(css, /\.wa-examples button\s*\{[^}]*font-size:\s*14px/);
  assert.match(css, /\.wa-panel :is\(button, textarea, a\):focus-visible\s*\{[^}]*outline:\s*2px solid var\(--lime\)/);
});
