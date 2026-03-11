import { createContext, useContext, useEffect, useRef, useState } from 'react';

const PWAInstallContext = createContext(null);

export function PWAInstallProvider({ children }) {
  const [canInstall, setCanInstall] = useState(false);
  const promptRef = useRef(null);

  useEffect(() => {
    // Capture the browser's install prompt before it disappears
    const onBeforeInstall = (e) => {
      e.preventDefault();
      promptRef.current = e;
      setCanInstall(true);
    };

    // Clear prompt once app is installed
    const onInstalled = () => {
      promptRef.current = null;
      setCanInstall(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Auto-trigger install if landing page linked here with ?install=true
  useEffect(() => {
    if (!canInstall) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('install') === 'true') {
      triggerInstall();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [canInstall]);

  const triggerInstall = async () => {
    if (!promptRef.current) return;
    promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;
    if (outcome === 'accepted') {
      promptRef.current = null;
      setCanInstall(false);
    }
  };

  return (
    <PWAInstallContext.Provider value={{ canInstall, triggerInstall }}>
      {children}
    </PWAInstallContext.Provider>
  );
}

export const usePWAInstall = () => useContext(PWAInstallContext);
