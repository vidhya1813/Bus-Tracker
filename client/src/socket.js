// Live updates for a trip (seat map + bus GPS).
// Uses Socket.io when the server supports it (local / long-running server). On serverless hosting
// (Vercel) or whenever the socket is down, it falls back to polling the same data every few seconds.
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const POLL_ONLY = import.meta.env.VITE_REALTIME === 'poll';
let socket;
const getSocket = () =>
  (socket ||= io({ path: '/socket.io', transports: ['websocket', 'polling'], reconnectionAttempts: 4, timeout: 5000 }));

/**
 * @param handlers  { seats: fn(payload), gps: fn(payload) }  called on every update
 * @param pollers   { seats: async () => payload, gps: async () => payload }  used when the socket is not connected
 */
export function useTripChannel(scheduleId, date, handlers, pollers = {}, intervalMs = 4000) {
  const h = useRef(handlers);
  const p = useRef(pollers);
  h.current = handlers;
  p.current = pollers;

  useEffect(() => {
    if (!scheduleId || !date) return undefined;
    const room = `trip:${scheduleId}:${date}`;
    const listeners = {};
    let s = null;

    if (!POLL_ONLY) {
      s = getSocket();
      const join = () => s.emit('join', room);
      if (s.connected) join();
      s.on('connect', join);
      listeners.connect = join;
      for (const evt of Object.keys(h.current)) {
        listeners[evt] = (payload) => h.current[evt]?.(payload);
        s.on(evt, listeners[evt]);
      }
    }

    let stopped = false;
    const timer = setInterval(async () => {
      if (s?.connected) return;
      for (const [evt, fetcher] of Object.entries(p.current)) {
        try {
          const payload = await fetcher();
          if (!stopped && payload) h.current[evt]?.(payload);
        } catch {
          /* try again next tick */
        }
      }
    }, intervalMs);

    return () => {
      stopped = true;
      clearInterval(timer);
      if (s) {
        s.emit('leave', room);
        for (const [evt, fn] of Object.entries(listeners)) s.off(evt, fn);
      }
    };
  }, [scheduleId, date, intervalMs]);
}
