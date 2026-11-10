import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthGate } from './components/auth/AuthGate';
import './index.css';

const contenedor = document.getElementById('root');
if (!contenedor) {
  throw new Error('No se encontró el elemento #root');
}

ReactDOM.createRoot(contenedor).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>,
);

// El service worker (S1.11) se registra después del primer pintado y en un trozo aparte:
// no retrasa la carga ni suma a la parte inicial del bundle.
void import('./pwa/registrar').then(({ registrarServiceWorker }) => registrarServiceWorker());
