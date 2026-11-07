import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import SOS from './components/SOS.jsx';
import { RequireAuth } from './auth.jsx';
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

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <Header />
      <main key={pathname} className="route-fade">
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/login" element={<Login portal="passenger" />} />
          <Route path="/driver/login" element={<Login portal="driver" />} />
          <Route path="/departures" element={<Departures />} />
          <Route path="/credentials" element={<Credentials />} />
          <Route path="/trip/:scheduleId/:date" element={<SeatSelect />} />
          <Route path="/track/:scheduleId/:date" element={<Track />} />
          <Route path="/pay/:bookingId" element={<RequireAuth><Payment /></RequireAuth>} />
          <Route path="/ticket/:bookingId" element={<RequireAuth><Ticket /></RequireAuth>} />
          <Route path="/bookings" element={<RequireAuth><MyBookings /></RequireAuth>} />
          <Route path="/driver" element={<RequireAuth roles={['driver', 'admin']}><Driver /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth roles={['admin']}><Admin /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <SOS />
    </>
  );
}
