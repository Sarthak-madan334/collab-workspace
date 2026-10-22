import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMetricInterpretation, getPriorityBand, getScoreBand, isValidInsightScore, sortSuggestionsByPriority } from '../src/assistant-insight-utils.js';

const components = readFileSync(new URL('../src/AssistantInsightComponents.jsx', import.meta.url), 'utf8');
const assistant = readFileSync(new URL('../src/WorkspaceAssistant.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/workspace-assistant.css', import.meta.url), 'utf8');

test('score ring exposes its estimate, number, and accessible label', () => {
  assert.match(components, /Project health estimate: \$\{score\} out of 100/);
  assert.match(components, /role="img" aria-label=\{accessibleLabel\}/);
  assert.match(components, /\{score\}<small>\/100<\/small>/);
  assert.match(components, /strokeDasharray=\{circumference\} strokeDashoffset=\{dashOffset\}/);
  assert.match(assistant, /<ScoreRing score=\{insights\.overallScore\} label=\{insights\.overallLabel\}/);
});

test('score color bands use low 0-39, medium 40-69, and high 70-100', () => {
  assert.deepEqual([0, 39, 40, 69, 70, 100].map(getScoreBand), ['low', 'low', 'medium', 'medium', 'high', 'high']);
  assert.equal(getScoreBand(undefined), 'unavailable');
  assert.equal(isValidInsightScore(-1), false);
  assert.equal(isValidInsightScore(101), false);
  assert.match(css, /\.wa-health-ring-low \{ --wa-ring-start: #ff6376; --wa-ring-end: #ff9a62; \}/);
  assert.match(css, /\.wa-health-ring-medium \{ --wa-ring-start: #ffe16a; --wa-ring-end: #ff9d50; \}/);
  assert.match(css, /\.wa-health-ring-high \{ --wa-ring-start: #63dfb0; --wa-ring-end: #c9f06b; \}/);
});

test('metric cards show accessible progress and use distinct icons and accents', () => {
  assert.match(components, /export function InsightMetricCard/);
  assert.match(components, /role=\{validScore \? 'progressbar' : undefined\}/);
  assert.match(assistant, /Icon=\{UsersRound\} tone="collaboration"/);
  assert.match(assistant, /Icon=\{FileCheck2\} tone="content"/);
  assert.match(assistant, /Icon=\{FolderTree\} tone="organization"/);
  assert.match(css, /\.wa-metric-collaboration \{ --wa-metric-accent: #70d9f5; \}/);
  assert.match(css, /\.wa-metric-content \{ --wa-metric-accent: #c3a2ff; \}/);
  assert.match(css, /\.wa-metric-organization \{ --wa-metric-accent: #b6e777; \}/);
  assert.equal(getMetricInterpretation(undefined), 'Estimate unavailable');
  assert.equal(getMetricInterpretation(65, 'Needs attention'), 'Needs attention');
});

test('priority actions map colors and sort with highest priority first', () => {
  assert.deepEqual(['high', 'medium', 'low', 'urgent'].map(getPriorityBand), ['high', 'medium', 'low', 'unavailable']);
  assert.deepEqual(sortSuggestionsByPriority([{ priority: 'low' }, { priority: 'high' }, { priority: 'medium' }]).map((item) => item.priority), ['high', 'medium', 'low']);
  assert.deepEqual(sortSuggestionsByPriority(null), []);
  assert.match(components, /export function PriorityActionCard/);
  assert.match(css, /\.wa-action-high \{ --wa-priority: #ff827f; \}/);
  assert.match(css, /\.wa-action-medium \{ --wa-priority: #ffd36d; \}/);
  assert.match(css, /\.wa-action-low \{ --wa-priority: #75d9f5; \}/);
  assert.match(assistant, /featured=\{index === 0\}/);
});

test('reduced motion minimizes progress animation and missing optional fields have fallbacks', () => {
  assert.match(components, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.wa-ring-progress, \.wa-metric-track span \{ transition: none; \}/);
  assert.match(assistant, /No summary was returned for this workspace/);
  assert.match(assistant, /No strengths were identified in the supplied context/);
  assert.match(assistant, /No items were flagged for attention in the supplied context/);
  assert.match(assistant, /No next steps were returned for this workspace/);
  assert.match(assistant, /Array\.isArray\(insights\.strengths\)/);
  assert.match(assistant, /Array\.isArray\(insights\.risks\)/);
});