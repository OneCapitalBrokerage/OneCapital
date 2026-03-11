import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { PWAInstallProvider } from './context/PWAInstallContext.jsx'

const logSw = (...args) => {
  // Keep this lightweight but visible in production debugging sessions.
  console.info('[PWA][SW]', ...args);
};

const logSwError = (...args) => {
  console.error('[PWA][SW]', ...args);
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    logSw('registered', { scope: registration.scope });

    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener('statechange', () => {
        logSw('statechange', { state: installing.state });
      });
    });

    navigator.serviceWorker.ready
      .then((readyRegistration) => {
        logSw('ready', { scope: readyRegistration.scope });
      })
      .catch((error) => {
        logSwError('ready failed', error);
      });
  } catch (error) {
    logSwError('registration failed', error);
  }
};

// Register service worker (required for PWA install prompt)
window.addEventListener('load', registerServiceWorker);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <PWAInstallProvider>
        <App />
      </PWAInstallProvider>
    </ThemeProvider>
  </StrictMode>,
)
