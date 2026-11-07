import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { PrefsProvider } from './prefs.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PrefsProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </PrefsProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
