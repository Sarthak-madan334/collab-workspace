import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

export function createWorkspaceSocket(token) {
  return io(SOCKET_URL, {
    autoConnect: false,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 8000,
    timeout: 8000,
  });
}

export function socketAck(socket, event, payload, timeout = 6000) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeout).emit(event, payload, (error, response) => {
      if (error) return reject(new Error('The server did not confirm this action.'));
      if (!response?.ok) return reject(new Error(response?.error?.message || 'This action could not be completed.'));
      resolve(response.data);
    });
  });
}
