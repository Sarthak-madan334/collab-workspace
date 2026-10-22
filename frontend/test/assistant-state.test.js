import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantReducer, initialAssistantState } from '../src/assistant-state.js';

test('insights move from idle through loading to a rendered result', () => {
  const loading = assistantReducer(initialAssistantState, { type: 'insights-start' });
  assert.equal(loading.insightStatus, 'loading');
  const result = assistantReducer(loading, { type: 'insights-success', value: { overallScore: 80 } });
  assert.equal(result.insightStatus, 'success');
  assert.equal(result.insights.overallScore, 80);
});

test('insights expose a retryable error state', () => {
  const failed = assistantReducer(initialAssistantState, { type: 'insights-error', message: 'AI is not configured.' });
  assert.equal(failed.insightStatus, 'error');
  assert.equal(failed.insightError, 'AI is not configured.');
  assert.equal(assistantReducer(failed, { type: 'insights-start' }).insightStatus, 'loading');
});

test('chat send state preserves the question for retry without duplicating the user bubble', () => {
  const queued = assistantReducer(initialAssistantState, { type: 'chat-start', value: 'What is missing?' });
  assert.equal(queued.chatStatus, 'loading');
  assert.equal(queued.question, '');
  assert.equal(queued.messages.length, 1);
  const failed = assistantReducer(queued, { type: 'chat-error', message: 'Try again.' });
  assert.equal(failed.chatStatus, 'error');
  assert.equal(failed.pendingQuestion, 'What is missing?');
  const retry = assistantReducer(failed, { type: 'chat-start', value: failed.pendingQuestion, retry: true });
  assert.equal(retry.chatStatus, 'loading');
  assert.equal(retry.messages.length, 1);
  const answered = assistantReducer(retry, { type: 'chat-success', value: 'Known facts: none supplied. Suggestions: add context.' });
  assert.equal(answered.chatStatus, 'success');
  assert.equal(answered.pendingQuestion, '');
  assert.equal(answered.messages.length, 2);
});