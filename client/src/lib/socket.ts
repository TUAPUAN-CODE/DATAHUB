import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string) {
  if (socket) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io('/', { path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'], reconnectionDelayMax: 8000 });
  return socket;
}
export const updateSocketToken = (token: string) => {
  if (socket) socket.auth = { token };
};
export const getSocket = () => socket;
export const socketId = () => socket?.id;
export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
