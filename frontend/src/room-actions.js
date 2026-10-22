export const initialRoomActionsState = {
  openRoomId: null,
  deletingRoom: null,
  confirmation: '',
  deleteBusy: false,
  deleteError: '',
  toast: '',
};

export function roomActionsReducer(state, action) {
  switch (action.type) {
    case 'toggle-menu':
      return { ...state, openRoomId: state.openRoomId === action.roomId ? null : action.roomId };
    case 'close-menu':
      return { ...state, openRoomId: null };
    case 'begin-delete':
      return { ...state, openRoomId: null, deletingRoom: action.room, confirmation: '', deleteBusy: false, deleteError: '' };
    case 'confirmation':
      return { ...state, confirmation: action.value, deleteError: '' };
    case 'delete-start':
      return { ...state, deleteBusy: true, deleteError: '' };
    case 'delete-failure':
      return { ...state, deleteBusy: false, deleteError: action.message };
    case 'cancel-delete':
      return state.deleteBusy ? state : { ...state, deletingRoom: null, confirmation: '', deleteError: '' };
    case 'delete-success':
      return { ...initialRoomActionsState, toast: action.message };
    case 'set-toast':
      return { ...state, toast: action.message };
    case 'dismiss-toast':
      return { ...state, toast: '' };
    default:
      return state;
  }
}

export const isRoomOwner = (room, userId) => Boolean(room && userId && room.ownerId === userId);
export const hasExactRoomConfirmation = (roomName, confirmation) => confirmation === roomName;
export const removeRoomById = (rooms, roomId) => rooms.filter((room) => room.id !== roomId);
export const shouldCloseRoomMenuOnEscape = (key) => key === 'Escape';
export const shouldCloseRoomMenuOnPointerDown = (target, container) => !container?.contains(target);
export function roomMenuFocusIndex(key, currentIndex, itemCount) {
  if (itemCount < 1) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  if (key === 'ArrowDown') return (currentIndex + 1 + itemCount) % itemCount;
  if (key === 'ArrowUp') return (currentIndex - 1 + itemCount) % itemCount;
  return null;
}