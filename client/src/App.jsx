import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import SOS from './components/SOS.jsx';
import { RequireAuth, useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Search from './pages/Search.jsx';
import SeatSelect from './pages/SeatSelect.jsx';
import Payment from './pages/Payment.jsx';
import Ticket from './pages/Ticket.jsx';
import MyBookings from './pages/MyBookings.jsx';
import Track from './pages/Track.jsx';
import Driver from './pages/Driver.jsx';
import Admin from './pages/Admin.jsx';
import Departures from './pages/Departures.jsx';
import Credentials from './pages/Credentials.jsx';

// Every page of the app needs a login. Visitors who aren't signed in land on the
// full-screen login page first, then go back to the page they asked for.
const AUTH_PAGES = ['/login', '/driver/login'];

export default function App() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  // Login pages (and the credentials page before login) are standalone: no app header or SOS bar.
  const standalone = AUTH_PAGES.includes(pathname) || (pathname === '/credentials' && !user);
  const guard = (el, roles) => <RequireAuth roles={roles}>{el}</RequireAuth>;

  return (
    <>
      {!standalone && <Header />}
      <main key={pathname} className={`route-fade ${standalone ? 'standalone' : ''}`}>
        <Routes>
          <Route path="/login" element={<Login portal="passenger" />} />
          <Route path="/driver/login" element={<Login portal="driver" />} />
          <Route path="/credentials" element={<Credentials />} />
          <Route path="/" element={guard(<Search />)} />
          <Route path="/departures" element={guard(<Departures />)} />
          <Route path="/trip/:scheduleId/:date" element={guard(<SeatSelect />)} />
          <Route path="/track/:scheduleId/:date" element={guard(<Track />)} />
          <Route path="/pay/:bookingId" element={guard(<Payment />)} />
          <Route path="/ticket/:bookingId" element={guard(<Ticket />)} />
          <Route path="/bookings" element={guard(<MyBookings />)} />
          <Route path="/driver" element={guard(<Driver />, ['driver', 'admin'])} />
          <Route path="/admin" element={guard(<Admin />, ['admin'])} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!standalone && <SOS />}
    </>
  );
}
