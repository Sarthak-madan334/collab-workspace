const priorityOrder = { high: 0, medium: 1, low: 2 };

export function isValidInsightScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= 100;
}

export function getScoreBand(score) {
  if (!isValidInsightScore(score)) return 'unavailable';
  if (score < 40) return 'low';
  if (score < 70) return 'medium';
  return 'high';
}

export function getMetricInterpretation(score, detail) {
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (!isValidInsightScore(score)) return 'Estimate unavailable';
  if (score >= 80) return 'Strong signal';
  if (score >= 60) return 'Some areas to review';
  return 'Needs more attention';
}

export function getPriorityBand(priority) {
  return Object.hasOwn(priorityOrder, priority) ? priority : 'unavailable';
}

export function sortSuggestionsByPriority(suggestions) {
  if (!Array.isArray(suggestions)) return [];
  return suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .filter(({ suggestion }) => suggestion && typeof suggestion === 'object')
    .sort((left, right) => (priorityOrder[left.suggestion.priority] ?? 3) - (priorityOrder[right.suggestion.priority] ?? 3) || left.index - right.index)
    .map(({ suggestion }) => suggestion);
}