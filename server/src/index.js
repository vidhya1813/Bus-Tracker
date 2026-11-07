// Long-running server: Express + Socket.io (live seats and GPS) + background hold sweeper.
import http from 'node:http';
import { config } from './config.js';
import app from './app.js';
import { initRealtime } from './services/realtime.js';
import { startHoldSweeper } from './routes/bookings.js';

const server = http.createServer(app);
initRealtime(server);
startHoldSweeper();

server.listen(config.port, () => {
  console.log(`GovBus API on http://localhost:${config.port}`);
  if (config.demoMode) {
    console.log('DEMO MODE: in-memory database (PGlite) with sample routes. Data resets on restart.');
    console.log('Demo staff accounts (OTP shown on screen, or password login): see README "Demo accounts".');
  }
});
