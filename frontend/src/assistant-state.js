export const initialAssistantState = {
  tab: 'insights',
  insights: null,
  insightStatus: 'idle',
  insightError: '',
  messages: [],
  question: '',
  pendingQuestion: '',
  chatStatus: 'idle',
  chatError: '',
};

export function assistantReducer(state, action) {
  switch (action.type) {
    case 'reset':
      return initialAssistantState;
    case 'tab':
      return { ...state, tab: action.value };
    case 'insights-start':
      return { ...state, insightStatus: 'loading', insightError: '' };
    case 'insights-success':
      return { ...state, insights: action.value, insightStatus: 'success', insightError: '' };
    case 'insights-error':
      return { ...state, insightStatus: 'error', insightError: action.message };
    case 'question':
      return { ...state, question: action.value };
    case 'chat-start':
      return {
        ...state,
        messages: action.retry ? state.messages : [...state.messages, { role: 'user', content: action.value }],
        pendingQuestion: action.value,
        chatStatus: 'loading',
        chatError: '',
        question: action.retry ? state.question : '',
      };
    case 'chat-success':
      return {
        ...state,
        messages: [...state.messages, { role: 'assistant', content: action.value }],
        pendingQuestion: '',
        chatStatus: 'success',
        chatError: '',
      };
    case 'chat-error':
      return { ...state, chatStatus: 'error', chatError: action.message };
    default:
      return state;
  }
}