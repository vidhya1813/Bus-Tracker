// Socket.io rooms: one room per trip ("trip:<scheduleId>:<YYYY-MM-DD>").
// Events sent to a room: "seats" (seat map changed) and "gps" (new bus location + ETAs).
import { Server } from 'socket.io';
import { config } from '../config.js';

let io;
const ROOM_RE = /^trip:[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/;

export const tripRoom = (scheduleId, date) => `trip:${scheduleId}:${date}`;

export function initRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.clientOrigin } });
  io.on('connection', (socket) => {
    socket.on('join', (room) => {
      if (typeof room === 'string' && ROOM_RE.test(room)) socket.join(room);
    });
    socket.on('leave', (room) => {
      if (typeof room === 'string') socket.leave(room);
    });
  });
  return io;
}

export function emitToTrip(scheduleId, date, event, payload) {
  io?.to(tripRoom(scheduleId, date)).emit(event, payload);
}
